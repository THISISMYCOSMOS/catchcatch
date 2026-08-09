import { z } from 'zod';
import {
  availabilitySchema,
  productComponentSchema,
  productIdentitySchema,
  sellerSchema,
  sourceCandidateMetadataSchema,
  sourceMetadataSchema,
} from '../ai-contracts/product-data.schema';

export { productComponentSchema, sellerSchema };

const nullableMoney = z.number().int().nonnegative().nullable();

export const searchedOfferSchema = z.object({
  product_name: z.string().min(1).nullable(),
  brand: z.string().min(1).nullable(),
  product_type: z.string().min(1).nullable(),
  option: z.string().min(1).nullable(),
  shade_or_scent: z.string().min(1).nullable(),
  version_or_renewal: z.string().min(1).nullable(),
  list_price: nullableMoney,
  listed_sale_price: nullableMoney,
  public_coupon_amount: nullableMoney,
  automatic_discount_amount: nullableMoney,
  shipping_fee: nullableMoney,
  discount_conditions: z.array(z.string()),
  shipping_condition: z.string().min(1).nullable(),
  components: z.array(productComponentSchema),
});

const sellerSearchResultShape = {
  seller: sellerSchema,
  availability: availabilitySchema,
  candidate_offer: searchedOfferSchema.nullable(),
  match_evidence: z.array(z.string()),
  mismatch_reasons: z.array(z.string()),
};

export const aiSellerSearchResultSchema = z.object({
  ...sellerSearchResultShape,
  source: sourceCandidateMetadataSchema.nullable(),
}).superRefine(addSellerResultIssues);

export const sellerSearchResultSchema = z.object({
  ...sellerSearchResultShape,
  source: sourceMetadataSchema.nullable(),
}).superRefine(addSellerResultIssues);

function addSellerResultIssues(
  result: {
    availability: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
    candidate_offer: unknown | null;
    match_evidence: string[];
    source: unknown | null;
  },
  context: z.RefinementCtx,
): void {
  if (result.availability === 'AVAILABLE' && !result.candidate_offer) {
    context.addIssue({
      code: 'custom',
      path: ['candidate_offer'],
      message: 'AVAILABLE requires a candidate offer',
    });
  }
  if (result.availability === 'AVAILABLE' && !result.source) {
    context.addIssue({
      code: 'custom',
      path: ['source'],
      message: 'AVAILABLE requires a seller-page source',
    });
  }
  if (result.availability === 'AVAILABLE' && result.match_evidence.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['match_evidence'],
      message: 'AVAILABLE requires explicit match evidence',
    });
  }
  if (result.availability !== 'AVAILABLE' && result.candidate_offer) {
    context.addIssue({
      code: 'custom',
      path: ['candidate_offer'],
      message: 'Unavailable or unknown sellers cannot contain an offer',
    });
  }
}

export const productSearchAiResultSchema = z.object({
  anchor_product: productIdentitySchema,
  seller_results: z.array(aiSellerSearchResultSchema).length(4),
  warnings: z.array(z.string()),
}).superRefine(addSellerCoverageIssues);

export const productSearchResultSchema = z.object({
  anchor_product: productIdentitySchema,
  seller_results: z.array(sellerSearchResultSchema).length(4),
  warnings: z.array(z.string()),
}).superRefine(addSellerCoverageIssues);

function addSellerCoverageIssues(
  result: { seller_results: Array<{ seller: z.infer<typeof sellerSchema> }> },
  context: z.RefinementCtx,
): void {
  const sellers = result.seller_results.map((item) => item.seller);
  const uniqueSellers = new Set(sellers);
  const expectedSellers = sellerSchema.options;
  if (
    uniqueSellers.size !== expectedSellers.length ||
    expectedSellers.some((seller) => !uniqueSellers.has(seller))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['seller_results'],
      message: 'Each registered seller must appear exactly once',
    });
  }
}

export const productSearchInputSchema = z.object({
  product_url: z.string().url(),
  anchor_product: productIdentitySchema,
  brand_id: z.string().min(1).nullable(),
}).superRefine((input, context) => {
  if (
    !input.anchor_product.brand ||
    !input.anchor_product.normalized_product_name ||
    !input.anchor_product.product_type
  ) {
    context.addIssue({
      code: 'custom',
      path: ['anchor_product'],
      message: 'Product search requires a verified anchor identity',
    });
  }
  if (
    input.brand_id &&
    !input.anchor_product.brand
  ) {
    context.addIssue({
      code: 'custom',
      path: ['brand_id'],
      message: 'A brand ID requires an identified anchor brand',
    });
  }
});

export type ProductSearchInput = z.infer<typeof productSearchInputSchema>;
export type ProductSearchAiResult = z.infer<typeof productSearchAiResultSchema>;
export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;
