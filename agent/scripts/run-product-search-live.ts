import 'reflect-metadata';
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { FIXED_SELLER_DOMAINS } from '../src/ai-contracts/seller-domain.policy';
import { ProductIdentificationService } from '../src/product-identification/product-identification.service';
import { ProductSearchService } from '../src/product-search/product-search.service';
import { OpenAICostBudgetService } from '../src/openai-cost/openai-cost-budget.service';

const USAGE = 'npm run test:search:live -- <https-product-url>';

async function main(): Promise<void> {
  const rawUrl = process.argv[2];
  if (!rawUrl || rawUrl === '--help' || rawUrl === '-h') {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is required for a live product-search test');
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
  const costBudget = new OpenAICostBudgetService(config);
  const identificationService = new ProductIdentificationService(config, costBudget);
  const searchService = new ProductSearchService(config, costBudget);
  const startedAt = Date.now();
  const identification = await identificationService.identify({
    product_url: productUrl.toString(),
    allowed_domains: [allowedDomain],
  });

  if (identification.identification_status !== 'IDENTIFIED' || !identification.anchor_product) {
    process.stdout.write(`${JSON.stringify({
      testMode: 'web_search',
      model: config.get<string>('OPENAI_SEARCH_MODEL', config.get<string>('OPENAI_MODEL', 'gpt-5.6')),
      elapsedMs: Date.now() - startedAt,
      input: { productUrl: productUrl.toString(), allowedDomain },
      identification,
      search: null,
      targetSeller: null,
    }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }

  const search = await searchService.searchSameProduct({
    product_url: productUrl.toString(),
    anchor_product: identification.anchor_product,
    brand_id: null,
  });
  const musinsa = search.seller_results.find((result) => result.seller === 'MUSINSA_BEAUTY');

  process.stdout.write(`${JSON.stringify({
    testMode: 'web_search',
    model: config.get<string>('OPENAI_SEARCH_MODEL', config.get<string>('OPENAI_MODEL', 'gpt-5.6')),
    elapsedMs: Date.now() - startedAt,
    input: { productUrl: productUrl.toString(), allowedDomain },
    identification,
    search,
    targetSeller: musinsa
      ? {
          seller: musinsa.seller,
          availability: musinsa.availability,
          source: musinsa.source,
          candidateOffer: musinsa.candidate_offer,
          matchEvidence: musinsa.match_evidence,
          mismatchReasons: musinsa.mismatch_reasons,
        }
      : null,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Live product-search test failed: ${message}\n`);
  process.exitCode = 1;
});
