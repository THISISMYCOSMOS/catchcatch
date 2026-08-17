import { ConfigService } from '@nestjs/config';

jest.mock('openai', () => {
  const parse = jest.fn();
  class MockAPIError extends Error {}
  const MockOpenAI = jest.fn(() => ({ responses: { parse } }));
  Object.assign(MockOpenAI, { APIError: MockAPIError, __parse: parse });
  return { __esModule: true, default: MockOpenAI };
});

import OpenAI from 'openai';
import { ProductIdentificationService } from './product-identification.service';

const parseMock = (OpenAI as unknown as { __parse: jest.Mock }).__parse;

const input = {
  product_url: 'https://www.coupang.com/vp/products/1',
  allowed_domains: ['coupang.com'],
};

describe('ProductIdentificationService', () => {
  beforeEach(() => parseMock.mockReset());

  it('returns schema-valid, clearly-labeled sample data without calling OpenAI', async () => {
    const service = new ProductIdentificationService(config({
      PRODUCT_DATA_MODE: 'sample',
    }));
    const result = await service.identify(input);
    expect(result).toMatchObject({
      identification_status: 'IDENTIFIED',
      source: {
        source_url: input.product_url,
        verification_status: 'URL_VERIFIED',
      },
    });
    expect(result.warnings.some((warning) => warning.includes('sample data'))).toBe(true);
  });

  it('defaults to sample mode when PRODUCT_DATA_MODE is unset, matching .env.example', async () => {
    const service = new ProductIdentificationService(config({}));
    await expect(service.identify(input)).resolves.toMatchObject({
      identification_status: 'IDENTIFIED',
    });
  });

  it('still enforces the seller-domain allowlist in sample mode', async () => {
    const service = new ProductIdentificationService(config({
      PRODUCT_DATA_MODE: 'sample',
    }));
    await expect(service.identify({
      product_url: 'https://forged.example/product',
      allowed_domains: ['coupang.com'],
    })).rejects.toThrow('URL is outside registered seller domains');
  });

  it('fails closed when web search credentials are missing', async () => {
    const service = new ProductIdentificationService(config({
      PRODUCT_DATA_MODE: 'web_search',
    }));
    await expect(service.identify(input)).rejects.toMatchObject({
      response: {
        code: 'PRODUCT_IDENTIFICATION_PROVIDER_UNAVAILABLE',
        reason: 'SEARCH_CREDENTIALS_MISSING',
        retryable: false,
      },
    });
  });

  it('uses the cost-sensitive identification model and bounded web search by default', async () => {
    parseMock.mockResolvedValueOnce({
      output: [{
        type: 'web_search_call',
        action: { sources: [{ url: input.product_url }] },
      }],
      output_parsed: {
        identification_status: 'IDENTIFIED',
        anchor_product: {
          brand: 'Example',
          normalized_product_name: 'Example Product',
          product_type: 'serum',
          option: null,
          shade_or_scent: null,
          version_or_renewal: null,
          components: [],
        },
        preview: null,
        source: {
          source_type: 'SELLER_PAGE',
          source_url: input.product_url,
          acquisition_method: 'AI_WEB_SEARCH',
          verification_status: 'UNVERIFIED',
        },
        warnings: [],
      },
    });
    const service = new ProductIdentificationService(config({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
      OPENAI_SEARCH_MODEL: 'gpt-5.6',
    }));

    await expect(service.identify(input)).resolves.toMatchObject({
      identification_status: 'IDENTIFIED',
    });
    expect(parseMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-luna',
      max_tool_calls: 1,
      max_output_tokens: 1200,
      reasoning: { effort: 'low' },
    }));
  });
});

function config(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}
