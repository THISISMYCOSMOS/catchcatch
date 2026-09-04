import { z } from 'zod';
import {
  availabilitySchema,
  productComponentSchema,
  ProductIdentity,
  productIdentitySchema,
  sellerSchema,
  sourceCandidateMetadataSchema,
  sourceMetadataSchema,
} from '../ai-contracts/product-data.schema';
import {
  addProductIdentityLimitIssues,
  addSerializedSizeIssue,
  addTextLimitIssue,
  MAX_IDENTITY_TEXT_LENGTH,
  MAX_URL_LENGTH,
} from '../ai-contracts/input-limits';

// Minimum number of registered sellers that must be present in seller_results.
// A registered seller may still be reported as NOT_AVAILABLE (that counts as
// present); only an entirely omitted seller reduces the count below this floor.
const MIN_SELLER_COVERAGE = sellerSchema.options.length - 1;

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

export const cachedSellerOfferSchema = z.object({
  seller: sellerSchema,
  source_url: z.string().url(),
  observed_at: z.string().datetime(),
  candidate_offer: searchedOfferSchema,
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

// IMPORTANT: this schema is passed to openai's zodTextFormat() (in
// product-search.service.ts) to build the OpenAI structured-output format.
// zodTextFormat cannot convert a schema with .transform() ("Transforms
// cannot be represented in JSON Schema"), so this schema must stay
// transform-free — superRefine only. The missing-seller warning is applied
// by productSearchResultSchema below, which every code path (real and
// sample) parses through as its final step.
export const productSearchAiResultSchema = z.object({
  anchor_product: productIdentitySchema,
  seller_results: z.array(aiSellerSearchResultSchema).max(sellerSchema.options.length),
  warnings: z.array(z.string()),
}).superRefine(addSellerCoverageIssues);

export const productSearchPartialAiResultSchema = z.object({
  anchor_product: productIdentitySchema,
  seller_results: z.array(aiSellerSearchResultSchema).max(sellerSchema.options.length),
  warnings: z.array(z.string()),
}).superRefine(addDuplicateSellerIssues);

// Not passed to zodTextFormat, so a .transform() here is safe. This is the
// schema every search result (real web_search and sample) is parsed through
// as its last step, so appendOmittedSellerWarnings always gets applied.
export const productSearchResultSchema = z.object({
  anchor_product: productIdentitySchema,
  seller_results: z.array(sellerSearchResultSchema).max(sellerSchema.options.length),
  warnings: z.array(z.string()),
}).superRefine(addSellerCoverageIssues).transform(appendOmittedSellerWarnings);

// Hard-validation gate: rejects a seller repeated in the array and rejects
// coverage below MIN_SELLER_COVERAGE distinct registered sellers. A single
// omitted seller (present count == MIN_SELLER_COVERAGE) is not an error here —
// it is surfaced as a warning by appendOmittedSellerWarnings below.
function addSellerCoverageIssues(
  result: { seller_results: Array<{ seller: z.infer<typeof sellerSchema> }> },
  context: z.RefinementCtx,
): void {
  addDuplicateSellerIssues(result, context);
  const sellers = result.seller_results.map((item) => item.seller);
  const uniqueSellers = new Set(sellers);
  if (uniqueSellers.size !== sellers.length) return;
  if (uniqueSellers.size < MIN_SELLER_COVERAGE) {
    context.addIssue({
      code: 'custom',
      path: ['seller_results'],
      message: `At least ${MIN_SELLER_COVERAGE} distinct registered sellers are required in seller_results`,
    });
  }
}

function addDuplicateSellerIssues(
  result: { seller_results: Array<{ seller: z.infer<typeof sellerSchema> }> },
  context: z.RefinementCtx,
): void {
  const sellers = result.seller_results.map((item) => item.seller);
  if (new Set(sellers).size !== sellers.length) {
    context.addIssue({
      code: 'custom',
      path: ['seller_results'],
      message: 'A registered seller cannot appear more than once in seller_results',
    });
  }
}

// Demotes missing-seller coverage from a hard error to a warning. A seller
// entirely absent from seller_results (as opposed to one present with
// availability NOT_AVAILABLE/UNKNOWN) gets a named warning so downstream
// consumers can tell "checked and unavailable" apart from "never checked".
function appendOmittedSellerWarnings<
  T extends { seller_results: Array<{ seller: z.infer<typeof sellerSchema> }>; warnings: string[] },
>(result: T): T {
  const presentSellers = new Set(result.seller_results.map((item) => item.seller));
  const omittedSellers = sellerSchema.options.filter((seller) => !presentSellers.has(seller));
  if (omittedSellers.length === 0) {
    return result;
  }
  const additionalWarnings = omittedSellers
    .map((seller) => `Seller result omitted for registered seller ${seller}; coverage was not checked`)
    .filter((message) => !result.warnings.includes(message));
  if (additionalWarnings.length === 0) {
    return result;
  }
  return { ...result, warnings: [...result.warnings, ...additionalWarnings] };
}

// brand and normalized_product_name stay required: they are what the search
// prompt uses to tell the model *what* to look for at each seller, and the
// service's identity screening (compareRequiredIdentity with
// allowContainment for the name) treats them as load-bearing. product_type
// is relaxed to nullable: identification can legitimately fail to resolve a
// product_type (see productIdentificationResultSchema) while still yielding
// a usable brand + name, and Core forwards anchor_product unchanged once
// identification_status is IDENTIFIED, so search must not hard-reject a
// product_type identification could not guarantee.
export const productSearchInputSchema = z.object({
  product_url: z.string().url(),
  anchor_product: productIdentitySchema,
  brand_id: z.string().min(1).nullable(),
  cached_seller_offers: z.array(cachedSellerOfferSchema).max(sellerSchema.options.length).optional(),
}).superRefine((input, context) => {
  if (
    !input.anchor_product.brand ||
    !input.anchor_product.normalized_product_name
  ) {
    context.addIssue({
      code: 'custom',
      path: ['anchor_product'],
      message: 'Product search requires a verified anchor brand and product name',
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
  addTextLimitIssue(input.product_url, MAX_URL_LENGTH, ['product_url'], context);
  const cachedSellers = new Set<string>();
  (input.cached_seller_offers ?? []).forEach((offer, index) => {
    addTextLimitIssue(offer.source_url, MAX_URL_LENGTH, ['cached_seller_offers', index, 'source_url'], context);
    if (cachedSellers.has(offer.seller)) {
      context.addIssue({
        code: 'custom',
        path: ['cached_seller_offers', index, 'seller'],
        message: 'A cached seller offer may appear at most once per seller',
      });
    }
    cachedSellers.add(offer.seller);
  });
  addTextLimitIssue(input.brand_id, MAX_IDENTITY_TEXT_LENGTH, ['brand_id'], context);
  addProductIdentityLimitIssues(input.anchor_product, ['anchor_product'], context);
  addSerializedSizeIssue(input, context);
});

export type ProductSearchInput = z.infer<typeof productSearchInputSchema>;
export type CachedSellerOffer = z.infer<typeof cachedSellerOfferSchema>;
export type ProductSearchAiResult = z.infer<typeof productSearchAiResultSchema>;
export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;

// Fields relaxed by productSearchInputSchema that are absent get surfaced as
// a warning on the eventual search result instead of silently disappearing.
export function collectAnchorProductWarnings(
  anchorProduct: Pick<ProductIdentity, 'product_type'>,
): string[] {
  return anchorProduct.product_type
    ? []
    : ['anchor_product.product_type is missing; search proceeded without a verified product type'];
}

export function mergeWarnings(...groups: string[][]): string[] {
  return [...new Set(groups.flat())];
}

// Output contract for the brand-official domain discovery search. URL
// strings stay format-free because OpenAI Structured Outputs rejects the
// JSON Schema URI format; the service validates and cross-checks every URL
// against the actual web_search sources before promoting the domain.
export const brandOfficialDomainCandidateSchema = z.object({
  candidate_domain: z.string().min(1).nullable(),
  evidence_urls: z.array(z.string().min(1)).max(5),
});

export type BrandOfficialDomainCandidate = z.infer<typeof brandOfficialDomainCandidateSchema>;
