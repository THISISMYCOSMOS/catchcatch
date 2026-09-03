import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentClient,
  BackendAnalysis,
  BackendClient,
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

test('orchestrates identification, persistence, calculation, and judgment in order', async () => {
  const calls: string[] = [];
  const identification: ProductIdentificationResult = {
    identification_status: 'IDENTIFIED',
    anchor_product: identity,
    preview: null,
    source: { source_url: 'https://www.coupang.com/vp/products/1' },
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
  const orchestrator = new AnalysisOrchestrator(agent, backend, ['coupang.com']);

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
  const orchestrator = new AnalysisOrchestrator(agent, backend, ['coupang.com']);

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
  });
  assert.deepEqual(calls, ['identify:coupang.com']);
});

test('returns a preview when optional identification preview fields are null', async () => {
  const orchestrator = new AnalysisOrchestrator(agentForIdentification({
    identification_status: 'IDENTIFIED',
    anchor_product: identity,
    preview: null,
    source: null,
    warnings: [],
  }), {} as BackendClient, ['coupang.com']);

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
    anchor_product: null,
    preview: null,
    source: null,
    warnings: ['ambiguous'],
  },
  {
    identification_status: 'UNKNOWN' as const,
    anchor_product: null,
    preview: null,
    source: null,
    warnings: [],
  },
  {
    identification_status: 'UNSUPPORTED' as const,
    anchor_product: null,
    preview: null,
    source: null,
    warnings: [],
  },
  {
    identification_status: 'IDENTIFIED' as const,
    anchor_product: null,
    preview: null,
    source: null,
    warnings: [],
  },
  {
    identification_status: 'IDENTIFIED' as const,
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
      ['coupang.com'],
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
  const orchestrator = new AnalysisOrchestrator(agent, {} as BackendClient, ['coupang.com']);

  await assert.rejects(
    orchestrator.preview({
      sourceUrl: 'https://attacker.example/product/1',
      authorization: 'Bearer test-token',
    }),
    (error: unknown) => error instanceof CoreError && error.code === 'UNSUPPORTED_PRODUCT_DOMAIN',
  );
  assert.equal(identifyCalled, false);
});

test('fails closed before persistence when identification is ambiguous', async () => {
  let backendCalled = false;
  const agent: AgentClient = {
    async identify() {
      return {
        identification_status: 'AMBIGUOUS',
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
  const orchestrator = new AnalysisOrchestrator(agent, backend, ['coupang.com']);

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

test('does not report completion when final backend persistence fails', async () => {
  const identification: ProductIdentificationResult = {
    identification_status: 'IDENTIFIED',
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
  const orchestrator = new AnalysisOrchestrator(agent, backend, ['coupang.com']);

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
