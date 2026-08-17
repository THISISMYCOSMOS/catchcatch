import 'reflect-metadata';
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import { FIXED_SELLER_DOMAINS } from '../src/ai-contracts/seller-domain.policy';
import { productIdentitySchema, sellerSchema } from '../src/ai-contracts/product-data.schema';
import { ProductIdentificationService } from '../src/product-identification/product-identification.service';
import { ProductSearchService } from '../src/product-search/product-search.service';
import { OpenAICostBudgetService } from '../src/openai-cost/openai-cost-budget.service';

const USAGE = 'npm run test:configurations:live -- <https-product-url> [--sellers=COUPANG,OLIVE_YOUNG,MUSINSA_BEAUTY,BRAND_OFFICIAL] [--max-candidates=1] [--anchor-file=path.json] [--brand-domain=example.com]';

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
    OPENAI_LOG_USAGE: 'true',
  });
  const sellersArgument = process.argv.slice(3)
    .find((argument) => argument.startsWith('--sellers='))
    ?.slice('--sellers='.length);
  const maxCandidatesArgument = process.argv.slice(3)
    .find((argument) => argument.startsWith('--max-candidates='))
    ?.slice('--max-candidates='.length);
  const anchorFile = process.argv.slice(3)
    .find((argument) => argument.startsWith('--anchor-file='))
    ?.slice('--anchor-file='.length);
  const registeredBrandOfficialDomain = process.argv.slice(3)
    .find((argument) => argument.startsWith('--brand-domain='))
    ?.slice('--brand-domain='.length);
  const targetSellers = sellersArgument
    ? sellersArgument.split(',').map((seller) => sellerSchema.parse(seller.trim()))
    : undefined;
  const maxCandidatesPerSeller = maxCandidatesArgument
    ? Number(maxCandidatesArgument)
    : undefined;
  const costBudget = new OpenAICostBudgetService(config);
  const searchService = new ProductSearchService(config, costBudget);
  const startedAt = Date.now();
  const reusedAnchor = anchorFile
    ? productIdentitySchema.parse(JSON.parse(await readFile(anchorFile, 'utf8')))
    : null;
  const identification = reusedAnchor
    ? null
    : await new ProductIdentificationService(config, costBudget).identify({
      product_url: productUrl.toString(),
      allowed_domains: [allowedDomain],
    });
  const anchorProduct = reusedAnchor ?? identification?.anchor_product ?? null;

  if (!anchorProduct) {
    process.stdout.write(`${JSON.stringify({
      testMode: 'configuration_web_search',
      model: config.get<string>('OPENAI_CONFIGURATION_SEARCH_MODEL', config.get<string>('OPENAI_SEARCH_MODEL', config.get<string>('OPENAI_MODEL', 'gpt-5.6'))),
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
    anchor_product: anchorProduct,
    brand_id: null,
    ...(targetSellers ? { target_sellers: targetSellers } : {}),
    ...(maxCandidatesPerSeller !== undefined
      ? { max_candidates_per_seller: maxCandidatesPerSeller }
      : {}),
    ...(registeredBrandOfficialDomain
      ? { registered_brand_official_domain: registeredBrandOfficialDomain }
      : {}),
  });

  process.stdout.write(`${JSON.stringify({
    testMode: 'configuration_web_search',
    model: config.get<string>('OPENAI_CONFIGURATION_SEARCH_MODEL', config.get<string>('OPENAI_SEARCH_MODEL', config.get<string>('OPENAI_MODEL', 'gpt-5.6'))),
    elapsedMs: Date.now() - startedAt,
    input: { productUrl: productUrl.toString(), allowedDomain },
    identification,
    anchorReused: Boolean(reusedAnchor),
    configurationSearch,
    summary: configurationSearch.seller_results.map((seller) => ({
      seller: seller.seller,
      availability: seller.availability,
      candidateCount: seller.candidates.length,
      candidates: seller.candidates.map((candidate) => ({
        relationType: candidate.relation_type,
        configuration: candidate.configuration_summary,
        sourceUrl: candidate.source.source_url,
        basisPrice: candidate.basis_price,
        priceBasis: candidate.price_basis,
        anchorMainTotal: candidate.anchor_main_total_amount,
        candidateMainTotal: candidate.candidate_main_total_amount,
        unit: candidate.capacity_unit,
        equivalentPrice: candidate.equivalent_price,
        equivalentPriceScope: candidate.equivalent_price_scope,
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
