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
