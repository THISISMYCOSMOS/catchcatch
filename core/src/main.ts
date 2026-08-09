import { AgentHttpClient } from './agent-http.client.js';
import { AnalysisOrchestrator } from './analysis.orchestrator.js';
import { BackendHttpClient } from './backend-http.client.js';
import { loadConfig } from './config.js';
import { HttpJsonClient } from './http-json.client.js';
import { createCoreServer } from './server.js';

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
const orchestrator = new AnalysisOrchestrator(
  agent,
  backend,
  config.allowedProductDomains,
);
const server = createCoreServer(orchestrator, config.allowedOrigins);

server.listen(config.port, '0.0.0.0');
