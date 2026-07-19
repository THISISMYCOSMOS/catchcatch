import { z } from 'zod';

export const sellerSchema = z.enum([
  'OLIVE_YOUNG',
  'MUSINSA_BEAUTY',
  'COUPANG',
  'BRAND_OFFICIAL',
]);

const nullableText = z.string().min(1).nullable();
const nullableMoney = z.number().int().nonnegative().nullable();

export const productComponentSchema = z.object({
  type: z.enum(['MAIN', 'REFILL', 'MINI', 'TRAVEL', 'OTHER_COSMETIC', 'NON_COSMETIC_GIFT']),
  name: nullableText,
  capacity_value: z.number().positive().nullable(),
  capacity_unit: z.enum(['ML', 'G']).nullable(),
  quantity: z.number().int().positive().nullable(),
});

export const searchedOfferSchema = z.object({
  seller: sellerSchema,
  source_url: z.string().url(),
  product_name: nullableText,
  brand: nullableText,
  option: nullableText,
  list_price: nullableMoney,
  listed_sale_price: nullableMoney,
  public_coupon_amount: nullableMoney,
  automatic_discount_amount: nullableMoney,
  shipping_fee: nullableMoney,
  discount_conditions: z.array(z.string()),
  shipping_condition: nullableText,
  components: z.array(productComponentSchema),
  availability: z.enum(['AVAILABLE', 'NOT_AVAILABLE', 'UNKNOWN']),
  verification_notes: z.array(z.string()),
});

export const productSearchResultSchema = z.object({
  anchor_product: z.object({
    source_url: z.string().url(),
    seller: sellerSchema.nullable(),
    brand: nullableText,
    product_name: nullableText,
    product_type: nullableText,
    option: nullableText,
    main_capacity_value: z.number().positive().nullable(),
    main_capacity_unit: z.enum(['ML', 'G']).nullable(),
    main_quantity: z.number().int().positive().nullable(),
  }),
  offers: z.array(searchedOfferSchema).max(4),
  warnings: z.array(z.string()),
});

export const productSearchInputSchema = z.object({
  product_url: z.string().url(),
  brand_official_domain: z.string().min(1).nullable(),
});

export type ProductSearchInput = z.infer<typeof productSearchInputSchema>;
export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;
