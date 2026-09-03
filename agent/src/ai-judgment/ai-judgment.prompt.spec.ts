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
    expect(JUDGMENT_PROMPT_VERSION).toBe('catchcatch-judgment-v8');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('AI는 판단 계산기가 아니라 설명 작성기다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('최종 구매 판단과 기준별 상태를 바꾸지 않고');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('criterion_assessments의 값을 각각 그대로 복사한다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('UNKNOWN을 불리한 사실로 간주하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('allowed_offer_ids');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('confidence는 결론의 강도가 아니라');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('설명에 숫자를 사용하려면');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('다른 사용자의 검색 결과를 기억하거나 재사용하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('INSUFFICIENT_EVIDENCE');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('allowed_conclusions가 비어 있으면 decision_status는 INSUFFICIENT_EVIDENCE, conclusion은 null이다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('CONTENT_VERIFIED');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('VERIFIED_ELIGIBLE');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('evidence_review');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('나열 순서를 우선순위로 보지 말고');
    expect(CATCHCATCH_JUDGMENT_CORRECTION_INSTRUCTIONS).not.toContain('오류 내용');
  });

  it('defines grounded wording for each final judgment', () => {
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('최근 가격 흐름을 보면 지금은 비교적 저렴하게 구매할 수 있는 시점이에요');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('현재 가격은 최근 평소 구매 가능한 가격대와 비슷한 수준이에요');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('뚜렷한 저점은 아니지만 현재 조건이라면 구매를 고려할 만해요');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('현재 확인된 정보만으로는 구매 시점을 충분히 판단하기 어려워요');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('"원가에 가까워요"라고 표현하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('실제 fact에 없는 근거는 대표 문구에 있어도 쓰지 않는다');
  });

  it('keeps status wording distinct and grounded for every criterion', () => {
    for (const criterion of [
      'FINAL_PAYMENT_AMOUNT',
      'PURCHASE_TIMING',
      'UNIT_PRICE',
      'SET_AND_GIFTS',
      'RIGHT_SIZED_PURCHASE',
      'SIMPLE_DISCOUNT',
      'FAST_DELIVERY',
      'REWARDS_AND_MEMBERSHIP',
    ]) {
      expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain(`## ${criterion}`);
    }
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('POSITIVE를 NEGATIVE 어투로 뒤집지 않고 UNKNOWN을 불리함이나 단점으로 설명하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('가격 이력이 충분하지 않으면 UNKNOWN을 유지하고 NEUTRAL로 바꾸지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('"딱 필요한 양이에요", "사용자에게 적당한 양이에요"처럼 단정하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('fact에 자동 적용이 명시된 경우에만 "자동 적용"이라고 표현한다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('가장 빠르다는 fact가 있을 때만 사용한다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('사용자 자격이 확인되지 않으면 현재 이용 중인 멤버십으로 받을 수 있다고 단정하지 않는다');
  });

  it('delimits verified input as data', () => {
    const prompt = buildJudgmentPrompt(input);
    expect(prompt).toContain('<verified_analysis_json>');
    expect(prompt).toContain('"allowed_conclusions":["REASONABLE_BUY"]');
    expect(prompt).toContain('</verified_analysis_json>');
  });
});
