import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductIdentificationService } from './product-identification.service';

const input = {
  product_url: 'https://www.coupang.com/vp/products/1',
  allowed_domains: ['coupang.com'],
};

describe('ProductIdentificationService', () => {
  it('does not silently use sample data', async () => {
    const service = new ProductIdentificationService(config({
      PRODUCT_DATA_MODE: 'sample',
    }));
    await expect(service.identify(input)).rejects.toThrow(ServiceUnavailableException);
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
