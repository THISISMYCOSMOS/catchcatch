import { buildJudgmentPrompt } from '../ai-judgment/ai-judgment.prompt';
import { judgmentInputSchema } from '../ai-judgment/ai-judgment.schema';
import { judgmentBiasCases } from './judgment-bias.cases';

describe('judgment bias evaluation cases', () => {
  it.each(judgmentBiasCases)('$id has a valid judgment input contract', ({ input }) => {
    expect(() => judgmentInputSchema.parse(input)).not.toThrow();
    expect(buildJudgmentPrompt(input)).toContain('<verified_analysis_json>');
  });

  it('changes only ordering in the permutation case', () => {
    const reference = judgmentBiasCases.find(
      (item) => item.id === 'reference-complete-public-price',
    )!;
    const permuted = judgmentBiasCases.find(
      (item) => item.id === 'permuted-input-order',
    )!;

    expect(new Set(permuted.input.offers.map((offer) => offer.offer_id))).toEqual(
      new Set(reference.input.offers.map((offer) => offer.offer_id)),
    );
    expect(new Set(permuted.input.facts.map((fact) => fact.id))).toEqual(
      new Set(reference.input.facts.map((fact) => fact.id)),
    );
    expect(permuted.input.offers.map((offer) => offer.offer_id)).not.toEqual(
      reference.input.offers.map((offer) => offer.offer_id),
    );
  });

  it('contains a genuine contradictory fact in the abstention case', () => {
    const conflict = judgmentBiasCases.find(
      (item) => item.id === 'conflicting-verified-price-facts',
    )!;
    expect(conflict.input.facts.map((fact) => fact.id)).toContain(
      'fact-conflicting-price',
    );
    expect(conflict.input.data_quality.status).toBe('LIMITED');
  });
});
