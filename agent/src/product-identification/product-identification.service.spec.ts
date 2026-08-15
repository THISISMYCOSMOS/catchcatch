import { ConfigService } from '@nestjs/config';
import { ProductIdentificationService } from './product-identification.service';

const input = {
  product_url: 'https://www.coupang.com/vp/products/1',
  allowed_domains: ['coupang.com'],
};

describe('ProductIdentificationService', () => {
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
});

function config(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}
