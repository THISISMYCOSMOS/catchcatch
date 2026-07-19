import 'reflect-metadata';
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { AiJudgmentService } from '../src/ai-judgment/ai-judgment.service';

async function main(): Promise<void> {
  const service = new AiJudgmentService(new ConfigService(process.env));
  const result = await service.judge({
      product_data_mode: 'sample',
      product: {
        product_id: 'product-example',
        identity: {
          brand: '예시브랜드',
          normalized_product_name: '예시 세럼',
          product_type: '세럼',
          option: null,
          shade_or_scent: null,
          version_or_renewal: null,
          components: [],
        },
      },
      offers: [{
        offer_id: 'offer-oliveyoung',
        seller: 'OLIVE_YOUNG',
        product_name: '예시 세럼',
        comparison_status: 'DIRECTLY_COMPARABLE',
        components: [],
        public_effective_price: 25000,
        personalized_effective_price: null,
        personalized_price_status: 'NOT_EVALUATED',
        unit_price: null,
        displayed_discount_rate: null,
        recent_average_discount_rate: null,
        previous_sale_discount_rate: null,
        recent_average_price: 26000,
        previous_sale_price: null,
        shipping_fee: 0,
        source: {
          source_type: 'SELLER_PAGE',
          source_url: 'https://www.oliveyoung.co.kr/store/goods/example',
          acquisition_method: 'AI_WEB_SEARCH',
          observed_at: '2026-07-19T12:00:00+09:00',
          verification_status: 'CONTENT_VERIFIED',
        },
      }],
      facts: [
        {
          id: 'fact-current',
          description: '현재 실구매가는 25,000원이다.',
          source_urls: ['https://www.oliveyoung.co.kr/store/goods/example'],
        },
        {
          id: 'fact-average',
          description: '최근 평균가는 26,000원이다.',
          source_urls: ['https://www.oliveyoung.co.kr/store/goods/example'],
        },
      ],
      selected_criteria: ['FINAL_PAYMENT_AMOUNT', 'PURCHASE_TIMING', 'SIMPLE_DISCOUNT'],
      criterion_assessments: [
        { criterion: 'FINAL_PAYMENT_AMOUNT', status: 'NEUTRAL', fact_ids: ['fact-current'] },
        { criterion: 'PURCHASE_TIMING', status: 'NEUTRAL', fact_ids: ['fact-average'] },
        { criterion: 'SIMPLE_DISCOUNT', status: 'UNKNOWN', fact_ids: [] },
      ],
      comparison_price_basis: 'PUBLIC',
      cheapest_offer_id: 'offer-oliveyoung',
      price_history_status: 'INSUFFICIENT',
      data_quality: {
        status: 'PARTIAL',
        warnings: ['공개 할인 조건만 확인했습니다.'],
      },
      allowed_conclusions: ['NEAR_REGULAR_PRICE'],
      allowed_offer_ids: ['offer-oliveyoung'],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main();
