import { AgentHttpClient } from './agent-http.client.js';
import { AnalysisOrchestrator } from './analysis.orchestrator.js';
import { BackendHttpClient } from './backend-http.client.js';
import { loadConfig } from './config.js';
import { HttpJsonClient } from './http-json.client.js';
import { createCoreServer } from './server.js';
import { BackendPublicApiProxy } from './public-backend.proxy.js';

const config = loadConfig();
const commonInternalHeaders = {
  'x-internal-api-token': config.internalApiToken,
};
const agent = new AgentHttpClient(new HttpJsonClient(
  'agent',
  config.agentBaseUrl,
  config.upstreamTimeoutMs,
  commonInternalHeaders,
));
const backend = new BackendHttpClient(new HttpJsonClient(
  'backend',
  config.backendBaseUrl,
  config.upstreamTimeoutMs,
  commonInternalHeaders,
));
const orchestrator = new AnalysisOrchestrator(agent, backend);
const publicApiProxy = new BackendPublicApiProxy(
  config.backendBaseUrl,
  config.upstreamTimeoutMs,
);
const server = createCoreServer(orchestrator, config.allowedOrigins, publicApiProxy);

server.listen(config.port, '0.0.0.0');
