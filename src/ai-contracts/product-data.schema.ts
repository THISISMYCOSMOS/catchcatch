import { z } from 'zod';

export const sellerSchema = z.enum([
  'OLIVE_YOUNG',
  'MUSINSA_BEAUTY',
  'COUPANG',
  'BRAND_OFFICIAL',
]);

export const availabilitySchema = z.enum([
  'AVAILABLE',
  'NOT_AVAILABLE',
  'UNKNOWN',
]);

export const comparisonStatusSchema = z.enum([
  'DIRECTLY_COMPARABLE',
  'UNIT_COMPARABLE',
  'NOT_COMPARABLE',
  'UNKNOWN',
]);

export const capacityUnitSchema = z.enum(['ML', 'G']);

export const productComponentSchema = z.object({
  type: z.enum([
    'MAIN',
    'REFILL',
    'MINI',
    'TRAVEL',
    'OTHER_COSMETIC',
    'NON_COSMETIC_GIFT',
  ]),
  name: z.string().min(1).nullable(),
  capacity_value: z.number().positive().nullable(),
  capacity_unit: capacityUnitSchema.nullable(),
  quantity: z.number().int().positive().nullable(),
});

export const productIdentitySchema = z.object({
  brand: z.string().min(1).nullable(),
  normalized_product_name: z.string().min(1).nullable(),
  product_type: z.string().min(1).nullable(),
  option: z.string().min(1).nullable(),
  shade_or_scent: z.string().min(1).nullable(),
  version_or_renewal: z.string().min(1).nullable(),
  components: z.array(productComponentSchema),
});

export const sourceCandidateMetadataSchema = z.object({
  source_type: z.literal('SELLER_PAGE'),
  source_url: z.string().url(),
  acquisition_method: z.literal('AI_WEB_SEARCH'),
  verification_status: z.literal('UNVERIFIED'),
}).strict();

export const sourceMetadataSchema = sourceCandidateMetadataSchema.extend({
  observed_at: z.string().datetime({ offset: true }),
  verification_status: z.enum([
    'UNVERIFIED',
    'URL_VERIFIED',
    'CONTENT_VERIFIED',
    'REJECTED',
  ]),
});

export type Seller = z.infer<typeof sellerSchema>;
export type ProductIdentity = z.infer<typeof productIdentitySchema>;
export type SourceCandidateMetadata = z.infer<typeof sourceCandidateMetadataSchema>;
export type SourceMetadata = z.infer<typeof sourceMetadataSchema>;
