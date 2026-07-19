import { ConfigService } from '@nestjs/config';
import { AiJudgmentService } from './ai-judgment.service';
import { JudgmentInput } from './ai-judgment.schema';

const input: JudgmentInput = {
  facts: [
    { id: 'fact-price', description: '현재 실구매가는 25,000원이다.' },
    { id: 'fact-average', description: '최근 평균가는 26,000원이다.' },
  ],
  selected_criteria: [
    'FINAL_PAYMENT_AMOUNT',
    'PURCHASE_TIMING',
    'SIMPLE_DISCOUNT',
  ],
  criterion_assessments: [
    { criterion: 'FINAL_PAYMENT_AMOUNT', status: 'NEUTRAL', fact_ids: ['fact-price'] },
    { criterion: 'PURCHASE_TIMING', status: 'NEUTRAL', fact_ids: ['fact-average'] },
    { criterion: 'SIMPLE_DISCOUNT', status: 'UNKNOWN', fact_ids: [] },
  ],
  cheapest_offer_id: 'offer-oliveyoung',
  data_warnings: ['할인 조건 일부를 확인할 수 없습니다.'],
  allowed_conclusions: ['NEAR_REGULAR_PRICE'],
  allowed_offer_ids: ['offer-oliveyoung'],
};

describe('AiJudgmentService', () => {
  it('returns a deterministic result without calling OpenAI in mock mode', async () => {
    const config = new ConfigService({ AI_JUDGMENT_MODE: 'mock' });
    const service = new AiJudgmentService(config);

    await expect(service.judge(input)).resolves.toMatchObject({
      conclusion: 'NEAR_REGULAR_PRICE',
      recommended_offer_id: 'offer-oliveyoung',
      used_fact_ids: ['fact-price', 'fact-average'],
    });
  });

  it('requires an API key in real mode', async () => {
    const config = new ConfigService({ AI_JUDGMENT_MODE: 'real' });
    const service = new AiJudgmentService(config);

    await expect(service.judge(input)).rejects.toThrow(
      'OPENAI_API_KEY is required in real mode',
    );
  });
});
