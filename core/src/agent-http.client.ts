import {
  AgentClient,
  ProductIdentificationResult,
  ProductIdentity,
  ProductSearchResult,
} from './contracts.js';
import { HttpJsonClient } from './http-json.client.js';

export class AgentHttpClient implements AgentClient {
  constructor(private readonly http: HttpJsonClient) {}

  identify(input: {
    product_url: string;
    allowed_domains: string[];
  }): Promise<ProductIdentificationResult> {
    return this.http.request('/internal/v1/product-identification', {
      method: 'POST',
      body: input,
    });
  }

  search(input: {
    product_url: string;
    anchor_product: ProductIdentity;
    brand_id: string | null;
  }): Promise<ProductSearchResult> {
    return this.http.request('/internal/v1/product-search', {
      method: 'POST',
      body: input,
    });
  }

  judge(input: unknown): Promise<unknown> {
    return this.http.request('/internal/v1/ai-judgment', {
      method: 'POST',
      body: input,
    });
  }
}
