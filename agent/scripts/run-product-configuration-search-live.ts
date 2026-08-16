import 'reflect-metadata';
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { FIXED_SELLER_DOMAINS } from '../src/ai-contracts/seller-domain.policy';
import { ProductIdentificationService } from '../src/product-identification/product-identification.service';
import { ProductSearchService } from '../src/product-search/product-search.service';

const USAGE = 'npm run test:configurations:live -- <https-product-url>';

async function main(): Promise<void> {
  const rawUrl = process.argv[2];
  if (!rawUrl || rawUrl === '--help' || rawUrl === '-h') {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is required for a live configuration-search test');
  }

  const productUrl = new URL(rawUrl);
  if (productUrl.protocol !== 'https:') {
    throw new Error('The product URL must use HTTPS');
  }
  const hostname = productUrl.hostname.toLowerCase().replace(/^www\./, '');
  const allowedDomain = Object.values(FIXED_SELLER_DOMAINS).find((domain) => (
    hostname === domain || hostname.endsWith(`.${domain}`)
  ));
  if (!allowedDomain) {
    throw new Error(`The input URL is not on a fixed registered seller domain: ${hostname}`);
  }

  const config = new ConfigService({
    ...process.env,
    PRODUCT_DATA_MODE: 'web_search',
  });
  const identificationService = new ProductIdentificationService(config);
  const searchService = new ProductSearchService(config);
  const startedAt = Date.now();
  const identification = await identificationService.identify({
    product_url: productUrl.toString(),
    allowed_domains: [allowedDomain],
  });

  if (identification.identification_status !== 'IDENTIFIED' || !identification.anchor_product) {
    process.stdout.write(`${JSON.stringify({
      testMode: 'configuration_web_search',
      model: config.get<string>('OPENAI_SEARCH_MODEL', config.get<string>('OPENAI_MODEL', 'gpt-5.6')),
      elapsedMs: Date.now() - startedAt,
      input: { productUrl: productUrl.toString(), allowedDomain },
      identification,
      configurationSearch: null,
    }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }

  const configurationSearch = await searchService.searchAlternativeConfigurations({
    product_url: productUrl.toString(),
    anchor_product: identification.anchor_product,
    brand_id: null,
  });

  process.stdout.write(`${JSON.stringify({
    testMode: 'configuration_web_search',
    model: config.get<string>('OPENAI_SEARCH_MODEL', config.get<string>('OPENAI_MODEL', 'gpt-5.6')),
    elapsedMs: Date.now() - startedAt,
    input: { productUrl: productUrl.toString(), allowedDomain },
    identification,
    configurationSearch,
    summary: configurationSearch.seller_results.map((seller) => ({
      seller: seller.seller,
      availability: seller.availability,
      candidateCount: seller.candidates.length,
      candidates: seller.candidates.map((candidate) => ({
        configuration: candidate.configuration_summary,
        sourceUrl: candidate.source.source_url,
        basisPrice: candidate.basis_price,
        priceBasis: candidate.price_basis,
        anchorMainTotal: candidate.anchor_main_total_amount,
        candidateMainTotal: candidate.candidate_main_total_amount,
        unit: candidate.capacity_unit,
        equivalentPrice: candidate.equivalent_price,
        comparisonStatus: candidate.comparison_status,
      })),
    })),
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Live product-configuration search test failed: ${message}\n`);
  process.exitCode = 1;
});
