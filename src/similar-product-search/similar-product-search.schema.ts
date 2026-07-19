import { z } from 'zod';
import {
  productIdentitySchema,
  sellerSchema,
  sourceCandidateMetadataSchema,
  sourceMetadataSchema,
} from '../ai-contracts/product-data.schema';
import { criterionSchema } from '../ai-judgment/ai-judgment.schema';
import {
  assertAllowedSellerUrl,
  assertSellerMatchesUrl,
  inferBrandOfficialDomain,
  normalizeSellerPageUrl,
} from '../ai-contracts/seller-domain.policy';

export const similarProductSearchInputSchema = z.object({
  anchor_product_id: z.string().min(1),
  anchor_product: productIdentitySchema,
  selected_criteria: z.array(criterionSchema).length(3),
  allowed_domains: z.array(z.string().min(1)).min(1),
  excluded_source_urls: z.array(z.string().url()),
  max_candidates: z.number().int().min(1).max(3),
}).superRefine((input, context) => {
  if (new Set(input.selected_criteria).size !== 3) {
    context.addIssue({
      code: 'custom',
      path: ['selected_criteria'],
      message: 'Criteria must be distinct',
    });
  }
});

const similarProductCandidateShape = {
  product: productIdentitySchema,
  seller: sellerSchema,
  listed_price: z.number().int().nonnegative().nullable(),
  similarity_reason: z.string().min(1),
  meaningful_differences: z.array(z.string().min(1)).min(1),
  matched_criteria: z.array(criterionSchema),
};

export const similarProductAiCandidateSchema = z.object({
  ...similarProductCandidateShape,
  source: sourceCandidateMetadataSchema,
});

export const similarProductCandidateSchema = z.object({
  ...similarProductCandidateShape,
  source: sourceMetadataSchema.extend({
    verification_status: z.literal('UNVERIFIED'),
  }),
});

const similarProductSearchResultShape = {
  search_status: z.enum(['FOUND', 'NO_MATCH', 'INSUFFICIENT_DATA']),
  warnings: z.array(z.string()),
};

export const similarProductSearchAiResultSchema = z.object({
  ...similarProductSearchResultShape,
  candidates: z.array(similarProductAiCandidateSchema).max(3),
}).superRefine(addSimilarProductResultIssues);

export const similarProductSearchResultSchema = z.object({
  ...similarProductSearchResultShape,
  candidates: z.array(similarProductCandidateSchema).max(3),
}).superRefine(addSimilarProductResultIssues);

function addSimilarProductResultIssues(
  result: {
    search_status: 'FOUND' | 'NO_MATCH' | 'INSUFFICIENT_DATA';
    candidates: Array<{ source: { source_url: string } }>;
  },
  context: z.RefinementCtx,
): void {
  if (result.search_status === 'FOUND' && result.candidates.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['candidates'],
      message: 'FOUND requires at least one candidate',
    });
  }
  if (result.search_status !== 'FOUND' && result.candidates.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['candidates'],
      message: 'Non-FOUND results cannot contain candidates',
    });
  }
  const urls = result.candidates.map((candidate) => candidate.source.source_url);
  if (new Set(urls).size !== urls.length) {
    context.addIssue({
      code: 'custom',
      path: ['candidates'],
      message: 'Candidate source URLs must be unique',
    });
  }
}

export type SimilarProductSearchInput = z.infer<typeof similarProductSearchInputSchema>;
export type SimilarProductSearchResult = z.infer<typeof similarProductSearchResultSchema>;

export function validateSimilarProductSearchResult(
  rawInput: SimilarProductSearchInput,
  rawResult: unknown,
  observedAt = new Date().toISOString(),
): SimilarProductSearchResult {
  const input = similarProductSearchInputSchema.parse(rawInput);
  const result = similarProductSearchAiResultSchema.parse(rawResult);
  if (result.candidates.length > input.max_candidates) {
    throw new Error('Too many similar-product candidates');
  }

  const excludedUrls = new Set(input.excluded_source_urls.map(normalizeSellerPageUrl));
  const anchorBrand = normalizeText(input.anchor_product.brand);
  const anchorName = normalizeText(input.anchor_product.normalized_product_name);
  const brandOfficialDomain = inferBrandOfficialDomain(input.allowed_domains);
  for (const candidate of result.candidates) {
    assertAllowedSellerUrl(candidate.source.source_url, input.allowed_domains);
    assertSellerMatchesUrl(
      candidate.seller,
      candidate.source.source_url,
      brandOfficialDomain,
    );
    if (excludedUrls.has(normalizeSellerPageUrl(candidate.source.source_url))) {
      throw new Error('Excluded source URL was returned as a similar product');
    }
    if (
      anchorBrand &&
      anchorName &&
      normalizeText(candidate.product.brand) === anchorBrand &&
      normalizeText(candidate.product.normalized_product_name) === anchorName
    ) {
      throw new Error('Anchor product was returned as a similar product');
    }
  }
  return similarProductSearchResultSchema.parse({
    ...result,
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      source: {
        ...candidate.source,
        observed_at: observedAt,
      },
    })),
  });
}

function normalizeText(value: string | null): string | null {
  return value?.normalize('NFKC').replace(/\s+/g, '').toLowerCase() ?? null;
}
