import {
  buildJudgmentPrompt,
  CATCHCATCH_JUDGMENT_CORRECTION_INSTRUCTIONS,
  CATCHCATCH_JUDGMENT_INSTRUCTIONS,
  JUDGMENT_PROMPT_VERSION,
} from './ai-judgment.prompt';
import { JudgmentInput } from './ai-judgment.schema';

const input: JudgmentInput = {
  product_data_mode: 'sample',
  product: {
    product_id: 'product-1',
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
    offer_id: 'offer-1',
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
    recent_average_price: null,
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
  facts: [{
    id: 'fact-1',
    description: '현재 실구매가는 25,000원이다.',
    source_urls: ['https://www.oliveyoung.co.kr/store/goods/example'],
  }],
  selected_criteria: ['FINAL_PAYMENT_AMOUNT', 'PURCHASE_TIMING', 'SIMPLE_DISCOUNT'],
  criterion_assessments: [
    { criterion: 'FINAL_PAYMENT_AMOUNT', status: 'POSITIVE', fact_ids: ['fact-1'] },
    { criterion: 'PURCHASE_TIMING', status: 'UNKNOWN', fact_ids: [] },
    { criterion: 'SIMPLE_DISCOUNT', status: 'NEUTRAL', fact_ids: ['fact-1'] },
  ],
  comparison_price_basis: 'PUBLIC',
  cheapest_offer_id: 'offer-1',
  price_history_status: 'INSUFFICIENT',
  data_quality: { status: 'PARTIAL', warnings: [] },
  allowed_conclusions: ['REASONABLE_BUY'],
  allowed_offer_ids: ['offer-1'],
};

describe('CatchCatch judgment prompt', () => {
  it('has an explicit version and critical domain boundaries', () => {
    expect(JUDGMENT_PROMPT_VERSION).toBe('catchcatch-judgment-v7');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('제조원가나 생산원가를 추정하거나 언급하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('UNKNOWN을 불리한 사실로 간주하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('allowed_offer_ids');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('confidence는 결론의 강도가 아니라');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('설명에 숫자를 사용하려면');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('다른 사용자의 검색 결과를 기억하거나 재사용하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('INSUFFICIENT_EVIDENCE');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('허용 목록에 억지로 맞추지 말고 판단을 유보한다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('CONTENT_VERIFIED');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('VERIFIED_ELIGIBLE');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('evidence_review');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('나열 순서를 우선순위로 해석하지 말고');
    expect(CATCHCATCH_JUDGMENT_CORRECTION_INSTRUCTIONS).not.toContain('오류 내용');
  });

  it('delimits verified input as data', () => {
    const prompt = buildJudgmentPrompt(input);
    expect(prompt).toContain('<verified_analysis_json>');
    expect(prompt).toContain('"allowed_conclusions":["REASONABLE_BUY"]');
    expect(prompt).toContain('</verified_analysis_json>');
  });
});
