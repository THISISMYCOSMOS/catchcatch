import { z } from 'zod';

export const conclusionSchema = z.enum([
  'LOW_POINT_BUY',
  'NEAR_REGULAR_PRICE',
  'REASONABLE_BUY',
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

export const criterionResultSchema = z.object({
  criterion: criterionSchema,
  status: criterionStatusSchema,
  reason: z.string().min(1),
});

export const aiJudgmentSchema = z.object({
  conclusion: conclusionSchema,
  conclusion_reason: z.string().min(1),
  criteria_results: z.array(criterionResultSchema).length(3),
  recommended_offer_id: z.string().nullable(),
  recommendation_reason: z.string().min(1),
  warnings: z.array(z.string()),
  used_fact_ids: z.array(z.string()),
});

export type AiJudgment = z.infer<typeof aiJudgmentSchema>;
export type Conclusion = z.infer<typeof conclusionSchema>;

export const judgmentInputSchema = z.object({
  facts: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
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
  cheapest_offer_id: z.string().min(1).nullable(),
  data_warnings: z.array(z.string()),
  allowed_conclusions: z.array(conclusionSchema).min(1),
  allowed_offer_ids: z.array(z.string().min(1)),
}).superRefine((input, context) => {
  const selected = new Set(input.selected_criteria);
  const assessed = new Set(input.criterion_assessments.map((item) => item.criterion));
  const factIds = new Set(input.facts.map((fact) => fact.id));

  if (selected.size !== 3) {
    context.addIssue({ code: 'custom', path: ['selected_criteria'], message: 'Criteria must be distinct' });
  }
  if (assessed.size !== 3 || [...selected].some((criterion) => !assessed.has(criterion))) {
    context.addIssue({ code: 'custom', path: ['criterion_assessments'], message: 'Assessments must match selected criteria' });
  }
  if (input.criterion_assessments.some((item) => item.fact_ids.some((id) => !factIds.has(id)))) {
    context.addIssue({ code: 'custom', path: ['criterion_assessments'], message: 'Assessment references an unknown fact' });
  }
});

export type JudgmentInput = z.infer<typeof judgmentInputSchema>;
