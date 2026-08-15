import { zodTextFormat } from 'openai/helpers/zod';
import { brandOfficialDomainCandidateSchema, productSearchAiResultSchema } from '../product-search/product-search.schema';
import { productIdentificationAiResultSchema } from '../product-identification/product-identification.schema';
import { aiJudgmentSchema } from '../ai-judgment/ai-judgment.schema';

// Regression guard for the class of bug where a schema passed to OpenAI's
// zodTextFormat() (to build the Responses API structured-output format)
// picks up a feature the JSON Schema conversion cannot represent — most
// notably .transform(), but also .pipe() or .brand(). zodTextFormat throws
// synchronously at request-build time in that case, so every real API call
// on the affected endpoint fails before reaching the model while every
// other test (which exercises sample/mock mode, or the schema in isolation
// via .parse()/.safeParse()) stays green. This test needs no network access
// or API key: it only asserts the conversion itself does not throw.
describe('AI-facing structured-output schemas stay convertible by zodTextFormat', () => {
  it.each([
    ['productSearchAiResultSchema', productSearchAiResultSchema, 'catchcatch_product_search'],
    ['productIdentificationAiResultSchema', productIdentificationAiResultSchema, 'catchcatch_product_identification'],
    ['aiJudgmentSchema', aiJudgmentSchema, 'catchcatch_judgment'],
    ['brandOfficialDomainCandidateSchema', brandOfficialDomainCandidateSchema, 'catchcatch_brand_official_domain_candidate'],
  ] as const)('%s converts to a JSON Schema text format without throwing', (_name, schema, formatName) => {
    expect(() => zodTextFormat(schema, formatName)).not.toThrow();
  });
});
