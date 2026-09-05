import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import test from 'node:test';
import { AnalysisRequest, ProductPreviewRequest } from './contracts.js';
import { AnalysisHandler, createCoreServer } from './server.js';
import { BackendPublicApiProxy } from './public-backend.proxy.js';

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
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
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

test('passes an HttpOnly-cookie access token to the orchestrator as backend authorization', async (context) => {
  let received: AnalysisRequest | null = null;
  const orchestrator = {
    async preview() { throw new Error('must not be called'); },
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
      cookie: 'catchcatch_access_token=cookie-access-token',
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
    authorization: 'Bearer cookie-access-token',
  });
});

test('returns an authenticated product preview and rejects unknown fields', async (context) => {
  let received: ProductPreviewRequest | null = null;
  const orchestrator = {
    async preview(input: ProductPreviewRequest) {
      received = input;
      return {
        sourceUrl: input.sourceUrl,
        productName: '테스트 크림',
        brand: '테스트 브랜드',
        seller: 'COUPANG',
        listedPrice: 15000,
        imageUrl: null,
        analysisCategory: 'COSMETIC' as const,
        analysisEligible: true,
      };
    },
    async analyze() { throw new Error('must not be called'); },
    async findRecentAnalyses() { return []; },
    async findAnalysis() { throw new Error('must not be called'); },
    async deleteAnalysis() { throw new Error('must not be called'); },
  } satisfies AnalysisHandler;
  const server = createCoreServer(orchestrator, [], {
    async forward() { throw new Error('preview must not be proxied'); },
  });
  context.after(() => server.close());
  const baseUrl = await listen(server);
  const sourceUrl = 'https://www.coupang.com/vp/products/1';

  const response = await fetch(`${baseUrl}/api/v1/products/preview`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer access-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sourceUrl }),
  });
  const unknownFieldResponse = await fetch(`${baseUrl}/api/v1/products/preview`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer access-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sourceUrl, admin: true }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    sourceUrl,
    productName: '테스트 크림',
    brand: '테스트 브랜드',
    seller: 'COUPANG',
    listedPrice: 15000,
    imageUrl: null,
    analysisCategory: 'COSMETIC',
    analysisEligible: true,
  });
  assert.deepEqual(received, { sourceUrl, authorization: 'Bearer access-token' });
  assert.equal(unknownFieldResponse.status, 400);
  assert.equal(
    (await unknownFieldResponse.json() as { code: string }).code,
    'UNKNOWN_REQUEST_FIELD',
  );
});

test('requires authentication for product preview', async (context) => {
  const server = createCoreServer(fakeOrchestrator(), []);
  context.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/v1/products/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceUrl: 'https://www.coupang.com/vp/products/1' }),
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json() as { code: string }).code, 'AUTHORIZATION_REQUIRED');
});

test('proxies allowlisted public backend routes and rewrites the auth cookie path', async (context) => {
  const received: Array<{ method: string; path: string; authorization: string | null; body: unknown }> = [];
  const backend = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bodyText = Buffer.concat(chunks).toString('utf8');
    received.push({
      method: request.method ?? 'GET',
      path: request.url ?? '/',
      authorization: request.headers.authorization ?? null,
      body: bodyText ? JSON.parse(bodyText) : null,
    });
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json');
    response.setHeader('set-cookie', 'catchcatch_refresh_token=token; Path=/auth; HttpOnly; Secure');
    response.end(JSON.stringify({ ok: true }));
  });
  context.after(() => backend.close());
  const backendBaseUrl = new URL(await listen(backend));

  const server = createCoreServer(
    fakeOrchestrator(),
    [],
    new BackendPublicApiProxy(backendBaseUrl, 1_000),
  );
  context.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/v1/auth/phone/send-otp?source=web`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer optional-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ phone: '+821012345678', purpose: 'login' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get('set-cookie') ?? '', /Path=\/api\/v1\/auth/);
  assert.deepEqual(received, [{
    method: 'POST',
    path: '/auth/phone/send-otp?source=web',
    authorization: 'Bearer optional-token',
    body: { phone: '+821012345678', purpose: 'login' },
  }]);
});

test('does not proxy non-allowlisted backend routes', async (context) => {
  const proxy = {
    async forward() { return false; },
  };
  const server = createCoreServer(fakeOrchestrator(), [], proxy);
  context.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/v1/internal/admin`);

  assert.equal(response.status, 404);
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
    async preview() { throw new Error('must not be called'); },
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
    async preview() {
      throw new Error('must not be called');
    },
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
