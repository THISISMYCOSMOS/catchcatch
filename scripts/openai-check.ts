import 'reflect-metadata';
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { AiJudgmentService } from '../src/ai-judgment/ai-judgment.service';

async function main(): Promise<void> {
  const service = new AiJudgmentService(new ConfigService(process.env));
  const result = await service.judge({
      facts: [
        { id: 'fact-current', description: '현재 실구매가는 25,000원이다.' },
        { id: 'fact-average', description: '최근 평균가는 26,000원이다.' },
      ],
      selected_criteria: ['FINAL_PAYMENT_AMOUNT', 'PURCHASE_TIMING', 'SIMPLE_DISCOUNT'],
      criterion_assessments: [
        { criterion: 'FINAL_PAYMENT_AMOUNT', status: 'NEUTRAL', fact_ids: ['fact-current'] },
        { criterion: 'PURCHASE_TIMING', status: 'NEUTRAL', fact_ids: ['fact-average'] },
        { criterion: 'SIMPLE_DISCOUNT', status: 'UNKNOWN', fact_ids: [] },
      ],
      cheapest_offer_id: 'offer-oliveyoung',
      data_warnings: ['공개 할인 조건만 확인했습니다.'],
      allowed_conclusions: ['NEAR_REGULAR_PRICE'],
      allowed_offer_ids: ['offer-oliveyoung'],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main();
