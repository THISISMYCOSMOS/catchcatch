import { ConfigService } from '@nestjs/config';
import { ProductSearchService } from './product-search.service';

const input = {
  product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
  brand_official_domain: null,
};

describe('ProductSearchService mode boundaries', () => {
  it('does not run web search or silently mix sample data in sample mode', async () => {
    const service = new ProductSearchService(
      new ConfigService({ PRODUCT_DATA_MODE: 'sample' }),
    );
    await expect(service.searchSameProduct(input)).rejects.toThrow(
      'PRODUCT_DATA_MODE must be web_search',
    );
  });

  it('requires an API key in web_search mode', async () => {
    const service = new ProductSearchService(
      new ConfigService({ PRODUCT_DATA_MODE: 'web_search' }),
    );
    await expect(service.searchSameProduct(input)).rejects.toThrow(
      'OPENAI_API_KEY is required in web_search mode',
    );
  });
});
