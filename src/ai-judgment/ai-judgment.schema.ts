import { z } from 'zod';
import {
  comparisonStatusSchema,
  productComponentSchema,
  productIdentitySchema,
  sellerSchema,
  sourceMetadataSchema,
} from '../ai-contracts/product-data.schema';

export const conclusionSchema = z.enum([
  'LOW_POINT_BUY',
  'NEAR_REGULAR_PRICE',
  'REASONABLE_BUY',
]);

export const decisionStatusSchema = z.enum([
  'DECIDED',
  'INSUFFICIENT_EVIDENCE',
]);

export const criterionSchema = z.enum([
  'FINAL_PAYMENT_AMOUNT',
  'PURCHASE_TIMING',
  'UNIT_PRICE',
  'SET_AND_GIFTS',
  'RIGHT_SIZED_PURCHASE',
  'SIMPLE_DISCOUNT',
  'FAST_DELIVERY',
  'REWARDS_AND_MEMBERSHIP',
]);

export const criterionStatusSchema = z.enum([
  'POSITIVE',
  'NEUTRAL',
  'NEGATIVE',
  'UNKNOWN',
]);

export const confidenceLevelSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const criterionResultSchema = z.object({
  criterion: criterionSchema,
  status: criterionStatusSchema,
  reason: z.string().min(1),
  used_fact_ids: z.array(z.string().min(1)),
});

export const aiJudgmentSchema = z.object({
  evidence_review: z.object({
    supporting_fact_ids: z.array(z.string().min(1)),
    contradicting_fact_ids: z.array(z.string().min(1)),
    missing_evidence: z.array(z.string().min(1)),
  }),
  decision_status: decisionStatusSchema,
  conclusion: conclusionSchema.nullable(),
  conclusion_reason: z.string().min(1),
  confidence: z.object({
    level: confidenceLevelSchema,
    reason: z.string().min(1),
    used_fact_ids: z.array(z.string().min(1)).min(1),
  }),
  criteria_results: z.array(criterionResultSchema).length(3),
  recommended_offer_id: z.string().nullable(),
  recommendation_reason: z.string().min(1),
  warnings: z.array(z.string()),
  used_fact_ids: z.array(z.string().min(1)).min(1),
}).superRefine((judgment, context) => {
  if (judgment.decision_status === 'DECIDED' && judgment.conclusion === null) {
    context.addIssue({
      code: 'custom',
      path: ['conclusion'],
      message: 'DECIDED requires a conclusion',
    });
  }
  if (
    judgment.decision_status === 'INSUFFICIENT_EVIDENCE' &&
    judgment.conclusion !== null
  ) {
    context.addIssue({
      code: 'custom',
      path: ['conclusion'],
      message: 'INSUFFICIENT_EVIDENCE cannot contain a conclusion',
    });
  }
  if (
    judgment.decision_status === 'INSUFFICIENT_EVIDENCE' &&
    judgment.confidence.level !== 'LOW'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['confidence', 'level'],
      message: 'INSUFFICIENT_EVIDENCE requires LOW confidence',
    });
  }
  if (
    judgment.decision_status === 'INSUFFICIENT_EVIDENCE' &&
    judgment.recommended_offer_id !== null
  ) {
    context.addIssue({
      code: 'custom',
      path: ['recommended_offer_id'],
      message: 'INSUFFICIENT_EVIDENCE cannot recommend an offer',
    });
  }
  if (
    judgment.decision_status === 'INSUFFICIENT_EVIDENCE' &&
    judgment.evidence_review.contradicting_fact_ids.length === 0 &&
    judgment.evidence_review.missing_evidence.length === 0
  ) {
    context.addIssue({
      code: 'custom',
      path: ['evidence_review'],
      message: 'INSUFFICIENT_EVIDENCE requires a conflict or missing evidence',
    });
  }
  if (
    judgment.decision_status === 'DECIDED' &&
    judgment.evidence_review.supporting_fact_ids.length === 0
  ) {
    context.addIssue({
      code: 'custom',
      path: ['evidence_review', 'supporting_fact_ids'],
      message: 'DECIDED requires supporting evidence',
    });
  }
  const supportingFactIds = new Set(
    judgment.evidence_review.supporting_fact_ids,
  );
  if (
    supportingFactIds.size !==
      judgment.evidence_review.supporting_fact_ids.length ||
    new Set(judgment.evidence_review.contradicting_fact_ids).size !==
      judgment.evidence_review.contradicting_fact_ids.length
  ) {
    context.addIssue({
      code: 'custom',
      path: ['evidence_review'],
      message: 'Evidence review fact IDs must be unique',
    });
  }
  if (
    judgment.evidence_review.contradicting_fact_ids.some(
      (id) => supportingFactIds.has(id),
    )
  ) {
    context.addIssue({
      code: 'custom',
      path: ['evidence_review'],
      message: 'A fact cannot both support and contradict the decision',
    });
  }
});

export type AiJudgment = z.infer<typeof aiJudgmentSchema>;
export type Conclusion = z.infer<typeof conclusionSchema>;

const nullableMoney = z.number().int().nonnegative().nullable();
const nullableRate = z.number().finite().nullable();

export const personalizedPriceStatusSchema = z.enum([
  'NOT_EVALUATED',
  'VERIFIED_ELIGIBLE',
  'VERIFIED_INELIGIBLE',
  'UNKNOWN_ELIGIBILITY',
]);

export const verifiedOfferForJudgmentSchema = z.object({
  offer_id: z.string().min(1),
  seller: sellerSchema,
  product_name: z.string().min(1),
  comparison_status: comparisonStatusSchema,
  components: z.array(productComponentSchema),
  public_effective_price: nullableMoney,
  personalized_effective_price: nullableMoney,
  personalized_price_status: personalizedPriceStatusSchema,
  unit_price: z.number().nonnegative().nullable(),
  displayed_discount_rate: nullableRate,
  recent_average_discount_rate: nullableRate,
  previous_sale_discount_rate: nullableRate,
  recent_average_price: nullableMoney,
  previous_sale_price: nullableMoney,
  shipping_fee: nullableMoney,
  source: sourceMetadataSchema.extend({
    verification_status: z.literal('CONTENT_VERIFIED'),
  }),
}).superRefine((offer, context) => {
  if (
    offer.personalized_price_status === 'VERIFIED_ELIGIBLE' &&
    offer.personalized_effective_price === null
  ) {
    context.addIssue({
      code: 'custom',
      path: ['personalized_effective_price'],
      message: 'Verified eligibility requires a personalized price',
    });
  }
  if (
    offer.personalized_price_status !== 'VERIFIED_ELIGIBLE' &&
    offer.personalized_effective_price !== null
  ) {
    context.addIssue({
      code: 'custom',
      path: ['personalized_effective_price'],
      message: 'Unverified eligibility cannot contain a personalized price',
    });
  }
});

export const judgmentInputSchema = z.object({
  product_data_mode: z.enum(['sample', 'web_search']),
  product: z.object({
    product_id: z.string().min(1),
    identity: productIdentitySchema,
  }),
  offers: z.array(verifiedOfferForJudgmentSchema),
  facts: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      numeric_values: z.array(z.number().finite()).optional(),
      source_urls: z.array(z.string().url()).min(1),
    }),
  ).min(1),
  selected_criteria: z.array(criterionSchema).length(3),
  criterion_assessments: z.array(
    z.object({
      criterion: criterionSchema,
      status: criterionStatusSchema,
      fact_ids: z.array(z.string().min(1)),
    }),
  ).length(3),
  comparison_price_basis: z.enum(['PUBLIC', 'PERSONALIZED']),
  cheapest_offer_id: z.string().min(1).nullable(),
  price_history_status: z.enum(['SUFFICIENT', 'INSUFFICIENT', 'UNAVAILABLE']),
  data_quality: z.object({
    status: z.enum(['COMPLETE', 'PARTIAL', 'LIMITED']),
    warnings: z.array(z.string()),
  }),
  allowed_conclusions: z.array(conclusionSchema).max(conclusionSchema.options.length),
  allowed_offer_ids: z.array(z.string().min(1)),
}).superRefine((input, context) => {
  const selected = new Set(input.selected_criteria);
  const assessed = new Set(input.criterion_assessments.map((item) => item.criterion));
  const factIds = new Set(input.facts.map((fact) => fact.id));
  const offerIds = new Set(input.offers.map((offer) => offer.offer_id));
  const verifiedSourceUrls = new Set(
    input.offers.map((offer) => offer.source.source_url),
  );

  if (factIds.size !== input.facts.length) {
    context.addIssue({ code: 'custom', path: ['facts'], message: 'Fact IDs must be unique' });
  }
  if (offerIds.size !== input.offers.length) {
    context.addIssue({ code: 'custom', path: ['offers'], message: 'Offer IDs must be unique' });
  }
  if (selected.size !== 3) {
    context.addIssue({ code: 'custom', path: ['selected_criteria'], message: 'Criteria must be distinct' });
  }
  if (assessed.size !== 3 || [...selected].some((criterion) => !assessed.has(criterion))) {
    context.addIssue({ code: 'custom', path: ['criterion_assessments'], message: 'Assessments must match selected criteria' });
  }
  if (input.criterion_assessments.some((item) => item.fact_ids.some((id) => !factIds.has(id)))) {
    context.addIssue({ code: 'custom', path: ['criterion_assessments'], message: 'Assessment references an unknown fact' });
  }
  if (input.facts.some(
    (fact) => fact.source_urls.some((url) => !verifiedSourceUrls.has(url)),
  )) {
    context.addIssue({ code: 'custom', path: ['facts'], message: 'Fact references an unverified source' });
  }
  if (input.allowed_offer_ids.some((id) => !offerIds.has(id))) {
    context.addIssue({ code: 'custom', path: ['allowed_offer_ids'], message: 'Allowed offer is not in verified offers' });
  }
  const offerById = new Map(input.offers.map((offer) => [offer.offer_id, offer]));
  const isRecommendationEligible = (offerId: string): boolean => {
    const offer = offerById.get(offerId);
    return Boolean(
      offer &&
      (offer.comparison_status === 'DIRECTLY_COMPARABLE' ||
        offer.comparison_status === 'UNIT_COMPARABLE'),
    );
  };
  if (input.allowed_offer_ids.some((id) => !isRecommendationEligible(id))) {
    context.addIssue({ code: 'custom', path: ['allowed_offer_ids'], message: 'Allowed offer is not comparable' });
  }
  if (new Set(input.allowed_offer_ids).size !== input.allowed_offer_ids.length) {
    context.addIssue({ code: 'custom', path: ['allowed_offer_ids'], message: 'Allowed offers must be unique' });
  }
  if (new Set(input.allowed_conclusions).size !== input.allowed_conclusions.length) {
    context.addIssue({ code: 'custom', path: ['allowed_conclusions'], message: 'Allowed conclusions must be unique' });
  }
  if (
    input.cheapest_offer_id !== null &&
    !offerIds.has(input.cheapest_offer_id)
  ) {
    context.addIssue({ code: 'custom', path: ['cheapest_offer_id'], message: 'Cheapest offer is not verified' });
  }
  if (
    input.cheapest_offer_id !== null &&
    !isRecommendationEligible(input.cheapest_offer_id)
  ) {
    context.addIssue({ code: 'custom', path: ['cheapest_offer_id'], message: 'Cheapest offer is not comparable' });
  }
  const cheapestOffer = input.cheapest_offer_id
    ? offerById.get(input.cheapest_offer_id)
    : undefined;
  if (
    cheapestOffer &&
    input.comparison_price_basis === 'PUBLIC' &&
    cheapestOffer.public_effective_price === null
  ) {
    context.addIssue({ code: 'custom', path: ['cheapest_offer_id'], message: 'Public price basis requires a public effective price' });
  }
  if (
    cheapestOffer &&
    input.comparison_price_basis === 'PERSONALIZED' &&
    (
      cheapestOffer.personalized_price_status !== 'VERIFIED_ELIGIBLE' ||
      cheapestOffer.personalized_effective_price === null
    )
  ) {
    context.addIssue({ code: 'custom', path: ['cheapest_offer_id'], message: 'Personalized price basis requires verified eligibility' });
  }
});

export type JudgmentInput = z.infer<typeof judgmentInputSchema>;
