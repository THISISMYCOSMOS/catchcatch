import {
  AnalysisAccessRequest,
  BackendAnalysis,
  ProductConfigurationSearchResult,
  BackendClient,
  ProductIdentificationResult,
  ProductSearchResult,
  RecentAnalysesRequest,
  ResolvedProduct,
} from './contracts.js';
import { HttpJsonClient } from './http-json.client.js';

export class BackendHttpClient implements BackendClient {
  constructor(private readonly http: HttpJsonClient) {}

  resolveProduct(input: {
    sourceUrl: string;
    identification: ProductIdentificationResult;
    idempotencyKey: string;
    authorization: string;
  }): Promise<ResolvedProduct> {
    return this.http.request('/internal/v1/products/resolve', {
      method: 'POST',
      headers: authorizationHeader(input.authorization),
      body: {
        schemaVersion: 'product-identification.v1',
        sourceUrl: input.sourceUrl,
        identification: input.identification,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  async ingestOffers(input: {
    productId: string;
    search: ProductSearchResult;
    idempotencyKey: string;
    authorization: string;
  }): Promise<void> {
    await this.http.request(`/internal/v1/products/${encodeURIComponent(input.productId)}/offers`, {
      method: 'PUT',
      headers: authorizationHeader(input.authorization),
      body: {
        schemaVersion: 'product-search.v1',
        search: input.search,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  createAnalysis(input: {
    sourceUrl: string;
    productId: string;
    idempotencyKey: string;
    authorization: string;
  }): Promise<BackendAnalysis> {
    return this.http.request('/analyses', {
      method: 'POST',
      headers: authorizationHeader(input.authorization),
      body: {
        sourceUrl: input.sourceUrl,
        productId: input.productId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  async getJudgmentInput(input: {
    analysisId: string;
    authorization: string;
  }): Promise<unknown> {
    const response = await this.http.request<{ judgmentInput: unknown }>(
      `/internal/v1/analyses/${encodeURIComponent(input.analysisId)}/judgment-context`,
      { headers: authorizationHeader(input.authorization) },
    );
    return response.judgmentInput;
  }

  finalizeJudgment(input: {
    analysisId: string;
    judgment: unknown;
    authorization: string;
  }): Promise<BackendAnalysis> {
    return this.http.request(
      `/internal/v1/analyses/${encodeURIComponent(input.analysisId)}/judgment`,
      {
        method: 'PUT',
        headers: authorizationHeader(input.authorization),
        body: {
          schemaVersion: 'ai-judgment.v1',
          judgment: input.judgment,
        },
      },
    );
  }

  findRecentAnalyses(input: RecentAnalysesRequest): Promise<BackendAnalysis[]> {
    const query = input.limit === undefined
      ? ''
      : `?limit=${encodeURIComponent(input.limit)}`;
    return this.http.request(`/analyses/recent${query}`, {
      headers: authorizationHeader(input.authorization),
    });
  }

  async saveAlternativeConfigurations(input: {
    analysisId: string;
    search: ProductConfigurationSearchResult;
    authorization: string;
  }): Promise<void> {
    await this.http.request(
      `/internal/v1/analyses/${encodeURIComponent(input.analysisId)}/alternative-configurations`,
      {
        method: 'PUT',
        headers: authorizationHeader(input.authorization),
        body: {
          schemaVersion: 'product-configuration-search.v1',
          search: input.search,
        },
      },
    );
  }

  findAnalysis(input: AnalysisAccessRequest): Promise<BackendAnalysis> {
    return this.http.request(`/analyses/${encodeURIComponent(input.analysisId)}`, {
      headers: authorizationHeader(input.authorization),
    });
  }

  async deleteAnalysis(input: AnalysisAccessRequest): Promise<void> {
    await this.http.request(`/analyses/${encodeURIComponent(input.analysisId)}`, {
      method: 'DELETE',
      headers: authorizationHeader(input.authorization),
    });
  }
}

function authorizationHeader(value: string): Record<string, string> {
  return { authorization: value };
}
