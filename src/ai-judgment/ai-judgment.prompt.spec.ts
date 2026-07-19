import {
  buildJudgmentPrompt,
  CATCHCATCH_JUDGMENT_INSTRUCTIONS,
  JUDGMENT_PROMPT_VERSION,
} from './ai-judgment.prompt';
import { JudgmentInput } from './ai-judgment.schema';

const input: JudgmentInput = {
  facts: [{ id: 'fact-1', description: '현재 실구매가는 25,000원이다.' }],
  selected_criteria: ['FINAL_PAYMENT_AMOUNT', 'PURCHASE_TIMING', 'SIMPLE_DISCOUNT'],
  criterion_assessments: [
    { criterion: 'FINAL_PAYMENT_AMOUNT', status: 'POSITIVE', fact_ids: ['fact-1'] },
    { criterion: 'PURCHASE_TIMING', status: 'UNKNOWN', fact_ids: [] },
    { criterion: 'SIMPLE_DISCOUNT', status: 'NEUTRAL', fact_ids: ['fact-1'] },
  ],
  cheapest_offer_id: 'offer-1',
  data_warnings: [],
  allowed_conclusions: ['REASONABLE_BUY'],
  allowed_offer_ids: ['offer-1'],
};

describe('CatchCatch judgment prompt', () => {
  it('has an explicit version and critical domain boundaries', () => {
    expect(JUDGMENT_PROMPT_VERSION).toBe('catchcatch-judgment-v1');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('제조원가를 추정하거나 언급하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('UNKNOWN을 불리한 사실로 간주하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('allowed_offer_ids');
  });

  it('delimits verified input as data', () => {
    const prompt = buildJudgmentPrompt(input);
    expect(prompt).toContain('<verified_analysis_json>');
    expect(prompt).toContain('"allowed_conclusions":["REASONABLE_BUY"]');
    expect(prompt).toContain('</verified_analysis_json>');
  });
});
