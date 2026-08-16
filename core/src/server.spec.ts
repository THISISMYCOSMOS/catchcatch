import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import test from 'node:test';
import { AnalysisRequest } from './contracts.js';
import { AnalysisHandler, createCoreServer } from './server.js';

test('requires bearer authentication and returns standardized errors', async (context) => {
  const server = createCoreServer(fakeOrchestrator(), ['https://app.example.com']);
  context.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/v1/analyses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceUrl: 'https://www.coupang.com/vp/products/1' }),
  });
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 401);
  assert.equal(body.code, 'AUTHORIZATION_REQUIRED');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(String(body.requestId), /^[0-9a-f-]{36}$/);
});

test('allows only configured CORS origins', async (context) => {
  const server = createCoreServer(fakeOrchestrator(), ['https://app.example.com']);
  context.after(() => server.close());
  const baseUrl = await listen(server);

  const allowed = await fetch(`${baseUrl}/health`, {
    headers: { origin: 'https://app.example.com' },
  });
  const rejectedPreflight = await fetch(`${baseUrl}/api/v1/analyses`, {
    method: 'OPTIONS',
    headers: { origin: 'https://attacker.example' },
  });
  const rejectedRequest = await fetch(`${baseUrl}/health`, {
    headers: { origin: 'https://attacker.example' },
  });

  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.example.com');
  assert.equal(rejectedPreflight.status, 403);
  assert.equal(rejectedRequest.status, 403);
  assert.equal(rejectedPreflight.headers.get('access-control-allow-origin'), null);
});

test('rejects non-JSON and unknown request fields', async (context) => {
  const server = createCoreServer(fakeOrchestrator(), []);
  context.after(() => server.close());
  const baseUrl = await listen(server);
  const headers = { authorization: 'Bearer access-token' };

  const formResponse = await fetch(`${baseUrl}/api/v1/analyses`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'text/plain' },
    body: '{}',
  });
  const unknownFieldResponse = await fetch(`${baseUrl}/api/v1/analyses`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      sourceUrl: 'https://www.coupang.com/vp/products/1',
      admin: true,
    }),
  });

  assert.equal(formResponse.status, 415);
  assert.equal(unknownFieldResponse.status, 400);
  assert.equal((await unknownFieldResponse.json() as { code: string }).code, 'UNKNOWN_REQUEST_FIELD');
});

test('passes a validated analysis request to the orchestrator', async (context) => {
  let received: AnalysisRequest | null = null;
  const orchestrator = {
    async analyze(input: AnalysisRequest) {
      received = input;
      return {
        analysisId: 'analysis-1',
        status: 'COMPLETED' as const,
        analysis: {
          id: 'analysis-1',
          status: 'COMPLETED',
          productId: 'product-1',
          allowedConclusions: [],
          selectedCriteria: [],
          warningCodes: [],
          result: {},
        },
        judgment: {},
      };
    },
    async findRecentAnalyses() { return []; },
    async findAnalysis() { throw new Error('must not be called'); },
    async deleteAnalysis() { throw new Error('must not be called'); },
  } satisfies AnalysisHandler;
  const server = createCoreServer(orchestrator, []);
  context.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/v1/analyses`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer access-token',
      'content-type': 'application/json',
      'x-request-id': 'request-123',
    },
    body: JSON.stringify({
      sourceUrl: 'https://www.coupang.com/vp/products/1',
    }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(received, {
    sourceUrl: 'https://www.coupang.com/vp/products/1',
    idempotencyKey: 'request-123',
    authorization: 'Bearer access-token',
  });
});

test('proxies authenticated recent, detail, and delete requests', async (context) => {
  const calls: Array<{ operation: string; input: unknown }> = [];
  const analysis = {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'COMPLETED',
    productId: 'product-1',
    allowedConclusions: [],
    selectedCriteria: [],
    warningCodes: [],
    result: {},
  };
  const orchestrator: AnalysisHandler = {
    async analyze() { throw new Error('must not be called'); },
    async findRecentAnalyses(input) {
      calls.push({ operation: 'recent', input });
      return [analysis];
    },
    async findAnalysis(input) {
      calls.push({ operation: 'detail', input });
      return analysis;
    },
    async deleteAnalysis(input) {
      calls.push({ operation: 'delete', input });
    },
  };
  const server = createCoreServer(orchestrator, []);
  context.after(() => server.close());
  const baseUrl = await listen(server);
  const headers = { authorization: 'Bearer access-token' };

  const recent = await fetch(`${baseUrl}/api/v1/analyses/recent?limit=5`, { headers });
  const detail = await fetch(`${baseUrl}/api/v1/analyses/${analysis.id}`, { headers });
  const deleted = await fetch(`${baseUrl}/api/v1/analyses/${analysis.id}`, {
    method: 'DELETE',
    headers,
  });

  assert.equal(recent.status, 200);
  assert.deepEqual(await recent.json(), [analysis]);
  assert.equal(detail.status, 200);
  assert.deepEqual(await detail.json(), analysis);
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  assert.deepEqual(calls, [
    {
      operation: 'recent',
      input: { authorization: 'Bearer access-token', limit: '5' },
    },
    {
      operation: 'detail',
      input: { analysisId: analysis.id, authorization: 'Bearer access-token' },
    },
    {
      operation: 'delete',
      input: { analysisId: analysis.id, authorization: 'Bearer access-token' },
    },
  ]);
});

function fakeOrchestrator(): AnalysisHandler {
  return {
    async analyze() {
      throw new Error('must not be called');
    },
    async findRecentAnalyses() {
      throw new Error('must not be called');
    },
    async findAnalysis() {
      throw new Error('must not be called');
    },
    async deleteAnalysis() {
      throw new Error('must not be called');
    },
  };
}

async function listen(server: ReturnType<typeof createCoreServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
