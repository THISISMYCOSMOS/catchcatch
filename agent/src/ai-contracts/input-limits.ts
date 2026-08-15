import { z } from 'zod';

// Size limits for the request bodies Core sends to this service. Before
// these, a brand name of 100,000 characters passed validation and went
// straight into a prompt (risk report §7, "P1: 입력 크기 제한 부재").
//
// IMPORTANT: apply these to INPUT schemas only. The AI-facing result
// schemas are converted by zodTextFormat() into the Responses API's
// structured-output format, and that conversion supports only a subset of
// JSON Schema; adding constraints there risks breaking every real API call
// at request-build time. Input schemas are never converted, so they are the
// safe place for this.
export const MAX_IDENTITY_TEXT_LENGTH = 200;
export const MAX_COMPONENTS = 20;
export const MAX_COMPONENT_NAME_LENGTH = 200;
export const MAX_URL_LENGTH = 2048;
export const MAX_ALLOWED_DOMAINS = 20;
export const MAX_JUDGMENT_OFFERS = 20;
export const MAX_JUDGMENT_FACTS = 50;
export const MAX_FACT_DESCRIPTION_LENGTH = 1000;
export const MAX_SOURCE_URLS_PER_FACT = 20;
export const MAX_WARNINGS = 50;
export const MAX_WARNING_LENGTH = 1000;
// Backstop for anything the per-field limits do not reach. Sized well above
// a realistic request (the largest sample payload is a few kilobytes) so it
// only ever catches genuinely abnormal input.
export const MAX_INPUT_BYTES = 64 * 1024;

type Ctx = z.RefinementCtx;

export function addTextLimitIssue(
  value: string | null | undefined,
  limit: number,
  path: (string | number)[],
  context: Ctx,
): void {
  if (typeof value === 'string' && value.length > limit) {
    context.addIssue({
      code: 'custom',
      path,
      message: `Must be ${limit} characters or fewer`,
    });
  }
}

export function addArrayLimitIssue(
  value: unknown[] | null | undefined,
  limit: number,
  path: (string | number)[],
  context: Ctx,
): void {
  if (Array.isArray(value) && value.length > limit) {
    context.addIssue({
      code: 'custom',
      path,
      message: `Must contain ${limit} items or fewer`,
    });
  }
}

type IdentityLike = {
  brand: string | null;
  normalized_product_name: string | null;
  product_type: string | null;
  option: string | null;
  shade_or_scent: string | null;
  version_or_renewal: string | null;
  components: Array<{ name: string | null }>;
};

export function addProductIdentityLimitIssues(
  identity: IdentityLike,
  basePath: (string | number)[],
  context: Ctx,
): void {
  const textFields = [
    'brand',
    'normalized_product_name',
    'product_type',
    'option',
    'shade_or_scent',
    'version_or_renewal',
  ] as const;
  for (const field of textFields) {
    addTextLimitIssue(identity[field], MAX_IDENTITY_TEXT_LENGTH, [...basePath, field], context);
  }
  addArrayLimitIssue(identity.components, MAX_COMPONENTS, [...basePath, 'components'], context);
  identity.components.forEach((component, index) => {
    addTextLimitIssue(
      component.name,
      MAX_COMPONENT_NAME_LENGTH,
      [...basePath, 'components', index, 'name'],
      context,
    );
  });
}

// Total serialized size of the request. JSON.stringify can throw on a
// circular structure, which cannot reach here through a parsed Zod object
// but is cheap to treat as oversized rather than let escape as a 500.
export function addSerializedSizeIssue(input: unknown, context: Ctx): void {
  let byteLength: number;
  try {
    byteLength = Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8');
  } catch {
    byteLength = MAX_INPUT_BYTES + 1;
  }
  if (byteLength > MAX_INPUT_BYTES) {
    context.addIssue({
      code: 'custom',
      path: [],
      message: `Request must serialize to ${MAX_INPUT_BYTES} bytes or fewer`,
    });
  }
}
