const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { ValidationPipe } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { Test } = require('@nestjs/testing');

const { AnalysesController } = require('../dist/analyses/analyses.controller.js');
const { AnalysesService } = require('../dist/analyses/analyses.service.js');
const { AuthGuard } = require('../dist/auth/auth.guard.js');
const { InternalApiGuard } = require('../dist/auth/internal-api.guard.js');
const { CoreIntegrationController } = require('../dist/core-integration/core-integration.controller.js');
const { CoreIntegrationService } = require('../dist/core-integration/core-integration.service.js');
const repositories = require('../dist/database/repositories/in-memory.repositories.js');
const tokens = require('../dist/database/repositories/repository.tokens.js');
const { SearchQuotaService } = require('../dist/search-quota/search-quota.service.js');
const {
  productIdentificationResultSchema,
} = require('../agent/dist/product-identification/product-identification.schema.js');
const {
  productSearchResultSchema,
} = require('../agent/dist/product-search/product-search.schema.js');
const {
  aiJudgmentSchema,
} = require('../agent/dist/ai-judgment/ai-judgment.schema.js');
const {
  AiJudgmentService,
} = require('../agent/dist/ai-judgment/ai-judgment.service.js');

const root = path.resolve(__dirname, '..');
const internalToken = 'local-integration-token';
const accessToken = 'local-user-access-token';
const userId = '00000000-0000-4000-8000-000000000101';
const sourceUrl = 'https://zigzag.kr/catalog/products/123';

async function main() {
  process.env.INTERNAL_API_TOKEN = internalToken;
  const database = new repositories.InMemoryDatabase();
  const repositoryProviders = createRepositoryProviders(database);
  const preferences = repositoryProviders.find(
    (provider) => provider.provide === tokens.USER_PREFERENCE_REPOSITORY,
  ).useValue;
  await preferences.upsert({
    user_id: userId,
    selected_criteria: ['FINAL_PAYMENT_AMOUNT', 'PURCHASE_TIMING', 'UNIT_PRICE'],
  });

  const backendBuilder = Test.createTestingModule({
    controllers: [AnalysesController, CoreIntegrationController],
    providers: [
      AnalysesService,
      CoreIntegrationService,
      SearchQuotaService,
      InternalApiGuard,
      ...repositoryProviders,
    ],
  });
  const backendModule = await backendBuilder.overrideGuard(AuthGuard).useValue({
    canActivate(context) {
      const request = context.switchToHttp().getRequest();
      request.user = { id: userId, email: null, phone: '+821012345678' };
      request.accessToken = accessToken;
      return true;
    },
  }).compile();
  const backend = backendModule.createNestApplication();
  backend.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  await backend.listen(0, '127.0.0.1');
  const backendPort = backend.getHttpServer().address().port;
  const corePort = await freePort();
  const children = [];
  const servers = [];

  try {
    const sampleAgentPort = await freePort();
    const sampleAgent = startNodeService('agent', sampleAgentPort, {
      INTERNAL_API_TOKEN: internalToken,
      PRODUCT_DATA_MODE: 'sample',
      AI_JUDGMENT_MODE: 'mock',
      OPENAI_API_KEY: '',
      OPENAI_LOG_USAGE: 'false',
    });
    children.push(sampleAgent);
    await waitForHealth(`http://127.0.0.1:${sampleAgentPort}/health`, sampleAgent);
    await verifyActualAgentSampleMode(sampleAgentPort);
    await stopChild(sampleAgent);
    children.splice(children.indexOf(sampleAgent), 1);

    const fixtureAgent = await startFixtureAgent();
    servers.push(fixtureAgent.server);

    const core = startNodeService('core', corePort, {
      CORE_PORT: String(corePort),
      CORE_ALLOWED_ORIGINS: 'http://localhost:3003',
      BACKEND_BASE_URL: `http://127.0.0.1:${backendPort}`,
      AGENT_BASE_URL: `http://127.0.0.1:${fixtureAgent.port}`,
      INTERNAL_API_TOKEN: internalToken,
      ALLOWED_PRODUCT_DOMAINS: 'coupang.com,oliveyoung.co.kr,musinsa.com,zigzag.kr',
      GEMINI_API_KEY: '',
    });
    children.push(core);
    await waitForHealth(`http://127.0.0.1:${corePort}/health`, core);

    const headers = {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    };
    const preview = await requestJson(`http://127.0.0.1:${corePort}/api/v1/products/preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sourceUrl }),
    });
    assert.equal(preview.sourceUrl, sourceUrl);
    assert.equal(preview.productName, 'CatchCatch Fixture Serum');

    const created = await requestJson(`http://127.0.0.1:${corePort}/api/v1/analyses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sourceUrl, idempotencyKey: 'local-integration-request-1' }),
    });
    assert.equal(created.status, 'COMPLETED');
    assert.equal(created.analysis.status, 'COMPLETED');
    assert.equal(created.analysis.id, created.analysisId);
    assert.ok(created.analysis.result.aiJudgment);
    assert.equal(created.analysis.result.aiJudgment.decision_status, 'DECIDED');
    assert.equal(created.analysis.result.aiJudgment.criteria_results.length, 3);

    const detail = await requestJson(
      `http://127.0.0.1:${corePort}/api/v1/analyses/${encodeURIComponent(created.analysisId)}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    assert.equal(detail.id, created.analysisId);
    assert.deepEqual(detail.result.aiJudgment, created.analysis.result.aiJudgment);

    const recent = await requestJson(
      `http://127.0.0.1:${corePort}/api/v1/analyses/recent?limit=3`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    assert.ok(recent.some((analysis) => analysis.id === created.analysisId));

    const deleted = await fetch(
      `http://127.0.0.1:${corePort}/api/v1/analyses/${encodeURIComponent(created.analysisId)}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` } },
    );
    assert.equal(deleted.status, 204);
    const afterDelete = await fetch(
      `http://127.0.0.1:${corePort}/api/v1/analyses/${encodeURIComponent(created.analysisId)}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    assert.equal(afterDelete.status, 404);

    process.stdout.write(JSON.stringify({
      status: 'ok',
      billedProviderCalls: 0,
      checked: [
        'Actual Agent sample mode remains non-billed and fail-closed',
        'Agent schemas validate the local CONTENT_VERIFIED contract fixture',
        'ZIGZAG Core allowlist and preview',
        'Core -> Agent HTTP identification/search contracts',
        'Core -> Backend resolve/ingest/calculate',
        'Core -> real Agent mock-judgment service',
        'Backend judgment persistence',
        'Frontend-facing detail/recent/delete routes',
      ],
    }, null, 2));
    process.stdout.write('\n');
  } finally {
    for (const child of children.reverse()) child.kill();
    for (const server of servers.reverse()) await closeServer(server);
    await backend.close();
  }
}

async function verifyActualAgentSampleMode(port) {
  const headers = {
    'x-internal-api-token': internalToken,
    'content-type': 'application/json',
  };
  const identification = productIdentificationResultSchema.parse(await requestJson(
    `http://127.0.0.1:${port}/internal/v1/product-identification`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ product_url: sourceUrl, allowed_domains: ['zigzag.kr'] }),
    },
  ));
  const search = productSearchResultSchema.parse(await requestJson(
    `http://127.0.0.1:${port}/internal/v1/product-search`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        product_url: sourceUrl,
        anchor_product: identification.anchor_product,
        brand_id: null,
      }),
    },
  ));
  assert.ok(search.warnings.some((warning) => warning.includes('sample data')));
  assert.ok(search.seller_results.every((result) => (
    result.source?.verification_status !== 'CONTENT_VERIFIED'
  )));
}

async function startFixtureAgent() {
  const identification = productIdentificationResultSchema.parse(fixtureIdentification());
  const search = productSearchResultSchema.parse(fixtureSearch(identification.anchor_product));
  const judgmentService = new AiJudgmentService(new ConfigService({ AI_JUDGMENT_MODE: 'mock' }));
  const server = createServer(async (request, response) => {
    try {
      if (request.headers['x-internal-api-token'] !== internalToken) {
        return sendJson(response, 401, { code: 'INVALID_INTERNAL_API_TOKEN' });
      }
      const body = request.method === 'POST' ? await readJsonBody(request) : null;
      if (request.method === 'POST' && request.url === '/internal/v1/product-identification') {
        return sendJson(response, 201, identification);
      }
      if (request.method === 'POST' && request.url === '/internal/v1/product-search') {
        return sendJson(response, 201, search);
      }
      if (request.method === 'POST' && request.url === '/internal/v1/ai-judgment') {
        return sendJson(response, 201, aiJudgmentSchema.parse(await judgmentService.judge(body)));
      }
      return sendJson(response, 404, { code: 'ROUTE_NOT_FOUND' });
    } catch (error) {
      return sendJson(response, 500, { code: 'FIXTURE_AGENT_FAILED', message: String(error) });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, port: server.address().port };
}

function fixtureIdentification() {
  return {
    identification_status: 'IDENTIFIED',
    anchor_product: {
      brand: 'CatchCatch Fixture Brand',
      normalized_product_name: 'CatchCatch Fixture Serum',
      product_type: 'SERUM',
      option: null,
      shade_or_scent: null,
      version_or_renewal: null,
      components: [{
        type: 'MAIN',
        name: 'CatchCatch Fixture Serum',
        capacity_value: 50,
        capacity_unit: 'ML',
        quantity: 1,
      }],
    },
    preview: { seller: 'ZIGZAG', listed_price: 10000, image_url: null },
    source: {
      source_type: 'SELLER_PAGE',
      source_url: sourceUrl,
      acquisition_method: 'AI_WEB_SEARCH',
      observed_at: '2026-09-04T00:00:00.000Z',
      verification_status: 'URL_VERIFIED',
    },
    warnings: ['Local integration fixture; no provider call was made.'],
  };
}

function fixtureSearch(anchorProduct) {
  const unavailable = (seller) => ({
    seller,
    availability: 'NOT_AVAILABLE',
    candidate_offer: null,
    match_evidence: [],
    mismatch_reasons: [],
    source: null,
  });
  return {
    anchor_product: anchorProduct,
    seller_results: [
      {
        seller: 'ZIGZAG',
        availability: 'AVAILABLE',
        candidate_offer: {
          product_name: anchorProduct.normalized_product_name,
          brand: anchorProduct.brand,
          product_type: anchorProduct.product_type,
          option: null,
          shade_or_scent: null,
          version_or_renewal: null,
          list_price: 12000,
          listed_sale_price: 10000,
          public_coupon_amount: 1000,
          automatic_discount_amount: null,
          shipping_fee: 0,
          discount_conditions: ['Local integration fixture coupon'],
          shipping_condition: '무료배송',
          components: anchorProduct.components,
        },
        match_evidence: ['Local fixture identity and capacity match'],
        mismatch_reasons: [],
        source: {
          source_type: 'SELLER_PAGE',
          source_url: sourceUrl,
          acquisition_method: 'DIRECT_HTTP',
          observed_at: '2026-09-04T00:00:00.000Z',
          verification_status: 'CONTENT_VERIFIED',
        },
      },
      unavailable('COUPANG'),
      unavailable('MUSINSA_BEAUTY'),
      unavailable('OLIVE_YOUNG'),
    ],
    warnings: ['Local integration fixture; no provider call was made.'],
  };
}

function createRepositoryProviders(database) {
  return [
    [tokens.USER_PREFERENCE_REPOSITORY, repositories.InMemoryUserPreferenceRepository],
    [tokens.PRODUCT_REPOSITORY, repositories.InMemoryProductRepository],
    [tokens.PRODUCT_COMPONENT_REPOSITORY, repositories.InMemoryProductComponentRepository],
    [tokens.SELLER_OFFER_REPOSITORY, repositories.InMemorySellerOfferRepository],
    [tokens.SELLER_OFFER_COMPONENT_REPOSITORY, repositories.InMemorySellerOfferComponentRepository],
    [tokens.SELLER_OFFER_BENEFIT_REPOSITORY, repositories.InMemorySellerOfferBenefitRepository],
    [tokens.PRICE_HISTORY_REPOSITORY, repositories.InMemoryPriceHistoryRepository],
    [tokens.ANALYSIS_REPOSITORY, repositories.InMemoryAnalysisRepository],
    [tokens.ANALYSIS_PERSISTENCE_REPOSITORY, repositories.InMemoryAnalysisPersistenceRepository],
    [tokens.ANALYSIS_OFFER_REPOSITORY, repositories.InMemoryAnalysisOfferRepository],
    [tokens.SEARCH_QUOTA_REPOSITORY, repositories.InMemorySearchQuotaRepository],
    [tokens.USER_MEMBERSHIP_REPOSITORY, repositories.InMemoryUserMembershipRepository],
    [tokens.USER_SHOPPING_GRADE_REPOSITORY, repositories.InMemoryUserShoppingGradeRepository],
    [tokens.USER_CARD_REPOSITORY, repositories.InMemoryUserCardRepository],
  ].map(([provide, Repository]) => ({ provide, useValue: new Repository(database) }));
}

function startNodeService(directory, port, overrides) {
  const logs = [];
  const env = { ...process.env, PORT: String(port), ...overrides };
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: path.join(root, directory),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => appendLog(logs, chunk));
  child.stderr.on('data', (chunk) => appendLog(logs, chunk));
  child.capturedLogs = logs;
  return child;
}

function appendLog(logs, chunk) {
  logs.push(String(chunk));
  while (logs.join('').length > 8000) logs.shift();
}

function stopChild(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
    setTimeout(resolve, 3000).unref();
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Service exited before health check (${child.exitCode}):\n${child.capturedLogs.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}:\n${child.capturedLogs.join('')}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options?.method ?? 'GET'} ${url} failed with ${response.status}: ${text}`);
  }
  return body;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
