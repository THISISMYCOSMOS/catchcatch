import { z } from 'zod';
import {
  availabilitySchema,
  comparisonStatusSchema,
  productIdentitySchema,
  sellerSchema,
  sourceCandidateMetadataSchema,
  sourceMetadataSchema,
} from '../ai-contracts/product-data.schema';
import { searchedOfferSchema, productSearchInputSchema } from './product-search.schema';

export const MAX_CONFIGURATION_OFFERS_PER_SELLER = 3;

export const configurationRelationTypeSchema = z.enum([
  'SAME_PRODUCT_CONFIGURATION',
  'SAME_LINE_VARIANT',
]);

const configurationCandidateShape = {
  relation_type: configurationRelationTypeSchema,
  candidate_offer: searchedOfferSchema,
  relation_evidence: z.array(z.string()),
  configuration_difference_evidence: z.array(z.string()),
};

export const configurationCandidateAiSchema = z.object({
  ...configurationCandidateShape,
  source: sourceCandidateMetadataSchema,
}).superRefine((candidate, context) => {
  if (candidate.relation_evidence.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['relation_evidence'],
      message: 'A configuration candidate requires product-relation evidence',
    });
  }
  if (candidate.configuration_difference_evidence.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['configuration_difference_evidence'],
      message: 'A configuration candidate requires configuration-difference evidence',
    });
  }
});

export const configurationCandidateResultSchema = z.object({
  ...configurationCandidateShape,
  source: sourceMetadataSchema,
  configuration_summary: z.string().min(1),
  comparison_status: comparisonStatusSchema,
  price_basis: z.enum(['LISTED_SALE_PRICE', 'LIST_PRICE']).nullable(),
  basis_price: z.number().int().nonnegative().nullable(),
  capacity_unit: z.enum(['ML', 'G']).nullable(),
  anchor_main_total_amount: z.number().positive().nullable(),
  candidate_main_total_amount: z.number().positive().nullable(),
  equivalent_price: z.number().int().nonnegative().nullable(),
  equivalent_price_scope: z.enum(['DIRECT', 'REFERENCE_ONLY']).nullable(),
});

function addConfigurationSellerIssues(
  result: {
    availability: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
    candidates: unknown[];
  },
  context: z.RefinementCtx,
): void {
  if (result.availability === 'AVAILABLE' && result.candidates.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['candidates'],
      message: 'AVAILABLE requires at least one configuration candidate',
    });
  }
  if (result.availability !== 'AVAILABLE' && result.candidates.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['candidates'],
      message: 'Only AVAILABLE sellers may contain configuration candidates',
    });
  }
}

export const configurationSellerAiResultSchema = z.object({
  seller: sellerSchema,
  availability: availabilitySchema,
  candidates: z.array(configurationCandidateAiSchema).max(MAX_CONFIGURATION_OFFERS_PER_SELLER),
  notes: z.array(z.string()),
});

export const configurationSellerResultSchema = z.object({
  seller: sellerSchema,
  availability: availabilitySchema,
  candidates: z.array(configurationCandidateResultSchema).max(MAX_CONFIGURATION_OFFERS_PER_SELLER),
  notes: z.array(z.string()),
}).superRefine(addConfigurationSellerIssues);

function addSellerResultIssues(
  result: { seller_results: Array<{ seller: z.infer<typeof sellerSchema> }> },
  context: z.RefinementCtx,
): void {
  const sellers = result.seller_results.map((entry) => entry.seller);
  const unique = new Set(sellers);
  if (unique.size !== sellers.length) {
    context.addIssue({
      code: 'custom',
      path: ['seller_results'],
      message: 'A registered seller cannot appear more than once',
    });
  }
}

// This schema is passed to zodTextFormat(), so it must remain transform-free.
export const productConfigurationSearchAiResultSchema = z.object({
  anchor_product: productIdentitySchema,
  seller_results: z.array(configurationSellerAiResultSchema).min(1).max(sellerSchema.options.length),
  warnings: z.array(z.string()),
}).superRefine(addSellerResultIssues);

export const productConfigurationSearchResultSchema = z.object({
  anchor_product: productIdentitySchema,
  seller_results: z.array(configurationSellerResultSchema).min(1).max(sellerSchema.options.length),
  warnings: z.array(z.string()),
}).superRefine(addSellerResultIssues);

export const productConfigurationSearchInputSchema = productSearchInputSchema.safeExtend({
  target_sellers: z.array(sellerSchema).min(1).max(sellerSchema.options.length).optional(),
  max_candidates_per_seller: z.number().int().min(1).max(MAX_CONFIGURATION_OFFERS_PER_SELLER).optional(),
  registered_brand_official_domain: z.string().trim().min(1).nullable().optional(),
}).superRefine((input, context) => {
  if (
    input.target_sellers &&
    new Set(input.target_sellers).size !== input.target_sellers.length
  ) {
    context.addIssue({
      code: 'custom',
      path: ['target_sellers'],
      message: 'A target seller cannot be repeated',
    });
  }
});

export type ProductConfigurationSearchInput = z.infer<typeof productConfigurationSearchInputSchema>;
export type ProductConfigurationSearchAiResult = z.infer<typeof productConfigurationSearchAiResultSchema>;
export type ProductConfigurationSearchResult = z.infer<typeof productConfigurationSearchResultSchema>;
export type ConfigurationSellerAiResult = z.infer<typeof configurationSellerAiResultSchema>;
export type ConfigurationCandidateAi = z.infer<typeof configurationCandidateAiSchema>;
export type ConfigurationCandidateResult = z.infer<typeof configurationCandidateResultSchema>;
