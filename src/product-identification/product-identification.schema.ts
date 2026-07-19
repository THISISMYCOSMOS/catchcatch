import { z } from 'zod';
import {
  productIdentitySchema,
  sellerSchema,
  sourceCandidateMetadataSchema,
  sourceMetadataSchema,
} from '../ai-contracts/product-data.schema';
import {
  assertAllowedSellerUrl,
  assertSellerMatchesUrl,
  inferBrandOfficialDomain,
  normalizeSellerPageUrl,
} from '../ai-contracts/seller-domain.policy';

export const productIdentificationInputSchema = z.object({
  product_url: z.string().url(),
  allowed_domains: z.array(z.string().min(1)).min(1),
});

const productIdentificationResultShape = {
  identification_status: z.enum([
    'IDENTIFIED',
    'AMBIGUOUS',
    'UNSUPPORTED',
    'UNKNOWN',
  ]),
  anchor_product: productIdentitySchema.nullable(),
  preview: z.object({
    seller: sellerSchema.nullable(),
    listed_price: z.number().int().nonnegative().nullable(),
    image_url: z.string().url().nullable(),
  }).nullable(),
  warnings: z.array(z.string()),
};

export const productIdentificationAiResultSchema = z.object({
  ...productIdentificationResultShape,
  source: sourceCandidateMetadataSchema.nullable(),
}).superRefine(addIdentificationIssues);

export const productIdentificationResultSchema = z.object({
  ...productIdentificationResultShape,
  source: sourceMetadataSchema.extend({
    verification_status: z.literal('URL_VERIFIED'),
  }).nullable(),
}).superRefine(addIdentificationIssues);

function addIdentificationIssues(
  result: {
    identification_status: 'IDENTIFIED' | 'AMBIGUOUS' | 'UNSUPPORTED' | 'UNKNOWN';
    anchor_product: z.infer<typeof productIdentitySchema> | null;
    source: unknown | null;
  },
  context: z.RefinementCtx,
): void {
  if (result.identification_status === 'IDENTIFIED') {
    if (
      !result.anchor_product?.brand ||
      !result.anchor_product.normalized_product_name ||
      !result.anchor_product.product_type
    ) {
      context.addIssue({
        code: 'custom',
        path: ['anchor_product'],
        message: 'IDENTIFIED requires brand, normalized name, and product type',
      });
    }
    if (!result.source) {
      context.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'IDENTIFIED requires a seller-page source',
      });
    }
  }
  if (result.identification_status === 'UNSUPPORTED' && result.anchor_product) {
    context.addIssue({
      code: 'custom',
      path: ['anchor_product'],
      message: 'UNSUPPORTED cannot return an anchor product',
    });
  }
}

export type ProductIdentificationInput = z.infer<typeof productIdentificationInputSchema>;
export type ProductIdentificationResult = z.infer<typeof productIdentificationResultSchema>;

export function validateProductIdentificationResult(
  rawInput: ProductIdentificationInput,
  rawResult: unknown,
  observedAt = new Date().toISOString(),
): ProductIdentificationResult {
  const input = productIdentificationInputSchema.parse(rawInput);
  const result = productIdentificationAiResultSchema.parse(rawResult);
  if (result.source) {
    assertAllowedSellerUrl(result.source.source_url, input.allowed_domains);
    if (
      normalizeSellerPageUrl(result.source.source_url) !==
      normalizeSellerPageUrl(input.product_url)
    ) {
      throw new Error('Identification source must match input product URL');
    }
    if (result.preview?.seller) {
      assertSellerMatchesUrl(
        result.preview.seller,
        result.source.source_url,
        inferBrandOfficialDomain(input.allowed_domains),
      );
    }
  }
  return productIdentificationResultSchema.parse({
    ...result,
    source: result.source
      ? {
          ...result.source,
          observed_at: observedAt,
          verification_status: 'URL_VERIFIED',
        }
      : null,
  });
}
