import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentClient,
  BackendAnalysis,
  BackendClient,
  ProductConfigurationSearchResult,
  ProductIdentificationResult,
  ProductSearchResult,
} from './contracts.js';
import { AnalysisOrchestrator } from './analysis.orchestrator.js';
import { CoreError } from './errors.js';

const identity = {
  brand: '테스트 브랜드',
  normalized_product_name: '테스트 크림',
  product_type: '크림',
  option: null,
  shade_or_scent: null,
  version_or_renewal: null,
  components: [],
};

test('continues an anchor-present ambiguous cosmetic identification through search, persistence, and judgment', async () => {
  const calls: string[] = [];
  const identification: ProductIdentificationResult = {
    identification_status: 'AMBIGUOUS',
    analysis_category: 'COSMETIC',
    category_evidence: null,
    anchor_product: identity,
    preview: null,
    source: { source_url: 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000263178' },
    warnings: [],
  };
  const search: ProductSearchResult = {
    anchor_product: identity,
    seller_results: [],
    warnings: [],
  };
  const initial = analysis('analysis-1', null);
  const finalized = analysis('analysis-1', 'LOW_POINT_BUY');
  const agent: AgentClient = {
    async identify() { calls.push('identify'); return identification; },
    async search(input) {
      calls.push(`search:${input.brand_id}`);
      return search;
    },
    async judge() { calls.push('judge'); return { decision_status: 'DECIDED' }; },
  };
  const backend: BackendClient = {
    async resolveProduct(input) {
      calls.push(`resolve:${input.idempotencyKey}`);
      return { productId: 'product-1', brandId: 'brand-1' };
    },
    async ingestOffers() { calls.push('ingest'); },
    async createAnalysis() { calls.push('calculate'); return initial; },
    async getJudgmentInput() { calls.push('context'); return { facts: [] }; },
    async finalizeJudgment() { calls.push('finalize'); return finalized; },
    async findRecentAnalyses() { return []; },
    async findAnalysis() { return finalized; },
    async deleteAnalysis() {},
  };
  const orchestrator = new AnalysisOrchestrator(agent, backend);

  const result = await orchestrator.analyze({
    sourceUrl: 'https://www.coupang.com/vp/products/1',
    idempotencyKey: 'request-1',
    authorization: 'Bearer test-token',
  });

  assert.equal(result.analysisId, 'analysis-1');
  assert.deepEqual(calls, [
    'identify',
    'resolve:request-1',
    'search:brand-1',
    'ingest',
    'calculate',
    'context',
    'judge',
    'finalize',
  ]);
});

test('returns a public product preview using identification only', async () => {
  const calls: string[] = [];
  const agent: AgentClient = {
    async identify(input) {
      calls.push(`identify:${input.allowed_domains.join(',')}`);
      return {
        identification_status: 'IDENTIFIED',
        analysis_category: 'COSMETIC',
        category_evidence: null,
        anchor_product: identity,
        preview: {
          seller: 'COUPANG',
          listed_price: 15000,
          image_url: 'https://image.example/product.jpg',
        },
        source: { internal: true },
        warnings: ['internal warning'],
      };
    },
    async search() { throw new Error('must not run'); },
    async judge() { throw new Error('must not run'); },
  };
  const backend = new Proxy({}, {
    get() { throw new Error('backend must not run'); },
  }) as BackendClient;
  const orchestrator = new AnalysisOrchestrator(agent, backend);

  const result = await orchestrator.preview({
    sourceUrl: 'https://www.coupang.com/vp/products/1',
    authorization: 'Bearer test-token',
  });

  assert.deepEqual(result, {
    sourceUrl: 'https://www.coupang.com/vp/products/1',
    productName: '테스트 크림',
    brand: '테스트 브랜드',
    seller: 'COUPANG',
    listedPrice: 15000,
    imageUrl: 'https://image.example/product.jpg',
    analysisCategory: 'COSMETIC',
    analysisEligible: true,
  });
  assert.deepEqual(calls, ['identify:coupang.com']);
});

test('returns a preview when optional identification preview fields are null', async () => {
  const orchestrator = new AnalysisOrchestrator(agentForIdentification({
    identification_status: 'IDENTIFIED',
    analysis_category: 'COSMETIC',
    category_evidence: null,
    anchor_product: identity,
    preview: null,
    source: null,
    warnings: [],
  }), {} as BackendClient);

  const result = await orchestrator.preview({
    sourceUrl: 'https://www.coupang.com/vp/products/1',
    authorization: 'Bearer test-token',
  });

  assert.equal(result.productName, '테스트 크림');
  assert.equal(result.seller, null);
  assert.equal(result.listedPrice, null);
  assert.equal(result.imageUrl, null);
});

for (const identification of [
  {
    identification_status: 'AMBIGUOUS' as const,
    analysis_category: 'COSMETIC' as const,
    category_evidence: null,
    anchor_product: null,
    preview: null,
    source: null,
    warnings: ['ambiguous'],
  },
  {
    identification_status: 'UNKNOWN' as const,
    analysis_category: 'UNKNOWN' as const,
    category_evidence: null,
    anchor_product: null,
    preview: null,
    source: null,
    warnings: [],
  },
  {
    identification_status: 'UNSUPPORTED' as const,
    analysis_category: 'UNKNOWN' as const,
    category_evidence: null,
    anchor_product: null,
    preview: null,
    source: null,
    warnings: [],
  },
  {
    identification_status: 'IDENTIFIED' as const,
    analysis_category: 'COSMETIC' as const,
    category_evidence: null,
    anchor_product: null,
    preview: null,
    source: null,
    warnings: [],
  },
  {
    identification_status: 'IDENTIFIED' as const,
    analysis_category: 'COSMETIC' as const,
    category_evidence: null,
    anchor_product: { ...identity, normalized_product_name: '  ' },
    preview: null,
    source: null,
    warnings: [],
  },
]) {
  test(`rejects incomplete preview identification: ${identification.identification_status}`, async () => {
    const orchestrator = new AnalysisOrchestrator(
      agentForIdentification(identification),
      {} as BackendClient,
    );

    await assert.rejects(
      orchestrator.preview({
        sourceUrl: 'https://www.coupang.com/vp/products/1',
        authorization: 'Bearer test-token',
      }),
      (error: unknown) => (
        error instanceof CoreError &&
        error.status === 422 &&
        error.code === 'PRODUCT_IDENTIFICATION_INCOMPLETE'
      ),
    );
  });
}

test('applies the existing product URL policy before preview identification', async () => {
  let identifyCalled = false;
  const agent: AgentClient = {
    async identify() { identifyCalled = true; throw new Error('must not run'); },
    async search() { throw new Error('must not run'); },
    async judge() { throw new Error('must not run'); },
  };
  const orchestrator = new AnalysisOrchestrator(agent, {} as BackendClient);

  await assert.rejects(
    orchestrator.preview({
      sourceUrl: 'https://attacker.internal/product/1',
      authorization: 'Bearer test-token',
    }),
    (error: unknown) => error instanceof CoreError && error.code === 'INVALID_PRODUCT_URL',
  );
  assert.equal(identifyCalled, false);
});

test('persists same-product alternative configurations separately from the seller comparison', async () => {
  const calls: string[] = [];
  const identification: ProductIdentificationResult = {
    identification_status: 'IDENTIFIED',
    analysis_category: 'COSMETIC',
    category_evidence: null,
    anchor_product: identity,
    preview: null,
    source: null,
    warnings: [],
  };
  const search: ProductSearchResult = { anchor_product: identity, seller_results: [], warnings: [] };
  const configurations: ProductConfigurationSearchResult = {
    anchor_product: identity,
    seller_results: [],
    warnings: [],
  };
  const initial = analysis('analysis-1', null);
  const finalized = analysis('analysis-1', 'LOW_POINT_BUY');
  const agent: AgentClient = {
    async identify() { calls.push('identify'); return identification; },
    async search() { calls.push('search'); return search; },
    async searchConfigurations() { calls.push('configurations'); return configurations; },
    async judge() { calls.push('judge'); return { decision_status: 'DECIDED' }; },
  };
  const backend: BackendClient = {
    async resolveProduct() { calls.push('resolve'); return { productId: 'product-1', brandId: 'brand-1' }; },
    async ingestOffers() { calls.push('ingest'); },
    async createAnalysis() { calls.push('calculate'); return initial; },
    async saveAlternativeConfigurations(input) {
      calls.push(`save-configurations:${input.analysisId}`);
      assert.equal(input.search, configurations);
    },
    async getJudgmentInput() { calls.push('context'); return { facts: [] }; },
    async finalizeJudgment() { calls.push('finalize'); return finalized; },
    async findRecentAnalyses() { return []; },
    async findAnalysis() { return finalized; },
    async deleteAnalysis() {},
  };

  await new AnalysisOrchestrator(agent, backend).analyze({
    sourceUrl: 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000263178',
    idempotencyKey: 'request-configurations',
    authorization: 'Bearer test-token',
  });

  assert.deepEqual(calls, [
    'identify',
    'resolve',
    'search',
    'ingest',
    'calculate',
    'configurations',
    'save-configurations:analysis-1',
    'context',
    'judge',
    'finalize',
  ]);
});

test('keeps the seller comparison and final judgment when the optional configuration search fails', async () => {
  const calls: string[] = [];
  const agent: AgentClient = {
    async identify() {
      return {
        identification_status: 'IDENTIFIED',
        analysis_category: 'COSMETIC',
        category_evidence: null,
        anchor_product: identity,
        preview: null,
        source: null,
        warnings: [],
      };
    },
    async search() { calls.push('search'); return { anchor_product: identity, seller_results: [], warnings: [] }; },
    async searchConfigurations() { calls.push('configurations'); throw new Error('configuration provider unavailable'); },
    async judge() { calls.push('judge'); return { decision_status: 'DECIDED' }; },
  };
  const finalized = analysis('analysis-1', 'LOW_POINT_BUY');
  const backend: BackendClient = {
    async resolveProduct() { return { productId: 'product-1', brandId: null }; },
    async ingestOffers() { calls.push('ingest'); },
    async createAnalysis() { calls.push('calculate'); return analysis('analysis-1', null); },
    async saveAlternativeConfigurations() { calls.push('save-configurations'); },
    async getJudgmentInput() { calls.push('context'); return { facts: [] }; },
    async finalizeJudgment() { calls.push('finalize'); return finalized; },
    async findRecentAnalyses() { return []; },
    async findAnalysis() { return finalized; },
    async deleteAnalysis() {},
  };

  const result = await new AnalysisOrchestrator(agent, backend).analyze({
    sourceUrl: 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000263178',
    idempotencyKey: 'request-configuration-failure',
    authorization: 'Bearer test-token',
  });

  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(calls, ['search', 'ingest', 'calculate', 'configurations', 'context', 'judge', 'finalize']);
});

test('uses an arbitrary public source host only for identification', async () => {
  const seenAllowedDomains: string[][] = [];
  const agent = agentForIdentification({
    identification_status: 'IDENTIFIED',
    analysis_category: 'COSMETIC',
    category_evidence: null,
    anchor_product: identity,
    preview: null,
    source: null,
    warnings: [],
  });
  agent.identify = async (input) => {
    seenAllowedDomains.push(input.allowed_domains);
    return {
      identification_status: 'IDENTIFIED',
      analysis_category: 'COSMETIC',
      category_evidence: null,
      anchor_product: identity,
      preview: null,
      source: null,
      warnings: [],
    };
  };
  const orchestrator = new AnalysisOrchestrator(agent, {} as BackendClient);

  await orchestrator.preview({
    sourceUrl: 'https://shop.example-brand.co.kr/products/1',
    authorization: 'Bearer test-token',
  });

  assert.deepEqual(seenAllowedDomains, [['shop.example-brand.co.kr']]);
});

test('fails closed before persistence when identification is ambiguous', async () => {
  let backendCalled = false;
  const agent: AgentClient = {
    async identify() {
      return {
        identification_status: 'AMBIGUOUS',
        analysis_category: 'COSMETIC',
        category_evidence: null,
        anchor_product: null,
        preview: null,
        source: null,
        warnings: ['option missing'],
      };
    },
    async search() { throw new Error('must not run'); },
    async judge() { throw new Error('must not run'); },
  };
  const backend = {
    async resolveProduct() { backendCalled = true; throw new Error('must not run'); },
  } as unknown as BackendClient;
  const orchestrator = new AnalysisOrchestrator(agent, backend);

  await assert.rejects(
    orchestrator.analyze({
      sourceUrl: 'https://www.coupang.com/vp/products/1',
      idempotencyKey: 'request-2',
      authorization: 'Bearer test-token',
    }),
    (error: unknown) => error instanceof CoreError && error.code === 'PRODUCT_IDENTIFICATION_INCOMPLETE',
  );
  assert.equal(backendCalled, false);
});

test('blocks a non-cosmetic product with page evidence before persistence', async () => {
  let backendCalled = false;
  const agent = agentForIdentification({
    identification_status: 'IDENTIFIED',
    analysis_category: 'NON_COSMETIC',
    category_evidence: '상품 분류: 공기청정기',
    anchor_product: { ...identity, product_type: '공기청정기' },
    preview: null,
    source: null,
    warnings: [],
  });
  const backend = {
    async resolveProduct() { backendCalled = true; throw new Error('must not run'); },
  } as unknown as BackendClient;
  const orchestrator = new AnalysisOrchestrator(agent, backend);

  await assert.rejects(
    orchestrator.analyze({
      sourceUrl: 'https://shop.example-brand.co.kr/products/1',
      idempotencyKey: 'request-non-cosmetic',
      authorization: 'Bearer test-token',
    }),
    (error: unknown) => error instanceof CoreError && error.code === 'NON_COSMETIC_PRODUCT',
  );
  assert.equal(backendCalled, false);
});

test('does not hard-block a non-cosmetic label without page evidence', async () => {
  let resolved = false;
  const agent: AgentClient = {
    async identify() {
      return {
        identification_status: 'IDENTIFIED',
        analysis_category: 'NON_COSMETIC',
        category_evidence: null,
        anchor_product: { ...identity, product_type: '공기청정기' },
        preview: null,
        source: null,
        warnings: [],
      };
    },
    async search() { throw new Error('search reached'); },
    async judge() { throw new Error('must not run'); },
  };
  const backend = {
    async resolveProduct() {
      resolved = true;
      return { productId: 'product-1', brandId: null };
    },
  } as unknown as BackendClient;
  const orchestrator = new AnalysisOrchestrator(agent, backend);

  await assert.rejects(
    orchestrator.analyze({
      sourceUrl: 'https://shop.example-brand.co.kr/products/1',
      idempotencyKey: 'request-unproven-category',
      authorization: 'Bearer test-token',
    }),
    /search reached/,
  );
  assert.equal(resolved, true);
});

test('does not hard-block an identified product with an unknown category', async () => {
  let resolved = false;
  const agent: AgentClient = {
    async identify() {
      return {
        identification_status: 'IDENTIFIED',
        analysis_category: 'UNKNOWN',
        category_evidence: null,
        anchor_product: identity,
        preview: null,
        source: null,
        warnings: [],
      };
    },
    async search() { throw new Error('search reached'); },
    async judge() { throw new Error('must not run'); },
  };
  const backend = {
    async resolveProduct() {
      resolved = true;
      return { productId: 'product-1', brandId: null };
    },
  } as unknown as BackendClient;
  const orchestrator = new AnalysisOrchestrator(agent, backend);

  await assert.rejects(
    orchestrator.analyze({
      sourceUrl: 'https://shop.example-brand.co.kr/products/1',
      idempotencyKey: 'request-unknown-category',
      authorization: 'Bearer test-token',
    }),
    /search reached/,
  );
  assert.equal(resolved, true);
});

test('does not report completion when final backend persistence fails', async () => {
  const identification: ProductIdentificationResult = {
    identification_status: 'IDENTIFIED',
    analysis_category: 'COSMETIC',
    category_evidence: null,
    anchor_product: identity,
    preview: null,
    source: null,
    warnings: [],
  };
  const agent: AgentClient = {
    async identify() { return identification; },
    async search() {
      return { anchor_product: identity, seller_results: [], warnings: [] };
    },
    async judge() { return { decision_status: 'DECIDED' }; },
  };
  const backend: BackendClient = {
    async resolveProduct() { return { productId: 'product-1', brandId: null }; },
    async ingestOffers() {},
    async createAnalysis() { return analysis('analysis-1', null); },
    async getJudgmentInput() { return { facts: [] }; },
    async finalizeJudgment() { throw new Error('persistence failed'); },
    async findRecentAnalyses() { return []; },
    async findAnalysis() { return analysis('analysis-1', null); },
    async deleteAnalysis() {},
  };
  const orchestrator = new AnalysisOrchestrator(agent, backend);

  await assert.rejects(orchestrator.analyze({
    sourceUrl: 'https://www.coupang.com/vp/products/1',
    idempotencyKey: 'request-3',
    authorization: 'Bearer test-token',
  }), /persistence failed/);
});

function analysis(id: string, verdict: string | null): BackendAnalysis {
  return {
    id,
    status: 'COMPLETED',
    productId: 'product-1',
    allowedConclusions: ['LOW_POINT_BUY'],
    selectedCriteria: ['FINAL_PAYMENT_AMOUNT', 'PURCHASE_TIMING', 'UNIT_PRICE'],
    warningCodes: [],
    result: verdict ? { verdict } : {},
  };
}

function agentForIdentification(identification: ProductIdentificationResult): AgentClient {
  return {
    async identify() { return identification; },
    async search() { throw new Error('must not run'); },
    async judge() { throw new Error('must not run'); },
  };
}
