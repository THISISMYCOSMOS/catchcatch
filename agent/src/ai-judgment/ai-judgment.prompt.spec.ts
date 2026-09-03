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
    expect(JUDGMENT_PROMPT_VERSION).toBe('catchcatch-judgment-v9');
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
    for (const approvedCopy of [
      '최근 가격 흐름을 보면 지금은 비교적 저렴하게 구매할 수 있는 시점이에요. 현재 가격이 최근 평균가나 이전 세일가보다 낮아 가격적인 이점이 있어요.',
      '현재 가격은 평소 구매할 수 있는 가격대와 비슷한 수준이에요. 할인 중이더라도 최근 가격과 비교하면 가격적인 이점은 크지 않아요.',
      '최저점 수준은 아니지만 현재 조건이라면 구매를 고려할 만해요. 가격 외에도 상품 구성이나 혜택 등에서 구매할 만한 장점이 있어요.',
      '현재 확인된 정보만으로는 구매 시점을 충분히 판단하기 어려워요. 가격이나 구성 등 일부 핵심 정보가 더 필요해요.',
    ]) {
      expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain(approvedCopy);
    }
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('"원가에 가까워요"라고 표현하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('실제 fact에 없는 내용은 대표 문구의 어느 문장에도 추가하거나 그대로 복사하지 않는다');
    expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain('대표 문구의 둘째 문장에 해당하는 근거가 실제 fact에 없으면 그 내용을 그대로 복사하지 않고');
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
    for (const approvedCopy of [
      '실제로 결제하는 금액 기준으로 유리한 편이에요. 상품 가격과 확인된 할인·배송비를 반영했을 때 좋은 조건이에요.',
      '최종 결제금액은 다른 판매처와 큰 차이가 없어요. 할인과 배송비까지 반영하면 비슷한 가격대예요.',
      '최종 결제금액 기준으로는 다른 판매처보다 불리한 편이에요. 확인된 조건을 반영했을 때 더 낮은 가격의 판매처가 있어요.',
      '최종 결제금액을 정확히 비교하기 어려워요. 가격이나 배송비, 할인 조건 중 확인되지 않은 정보가 있어요.',
      '최근 가격 흐름을 보면 지금 구매하기 괜찮은 시점이에요. 현재 가격이 최근 평균가나 이전 세일가보다 낮은 편이에요.',
      '현재 가격은 최근 가격대와 비슷한 수준이에요. 지금 구매하더라도 가격 차이가 크지 않은 편이에요.',
      '가격만 보면 지금 바로 구매할 이점은 크지 않아요. 최근 평균가나 이전 세일가보다 현재 가격이 높은 편이에요.',
      '지금이 좋은 구매 시점인지 판단하기 어려워요. 비교할 수 있는 과거 가격 정보가 충분하지 않아요.',
      '같은 용량 기준으로 비교했을 때 가격 경쟁력이 좋은 편이에요. 실제 결제금액을 기준으로 계산한 단위 가격이 낮아요.',
      '용량 대비 가격은 다른 상품과 비슷한 수준이에요. 단위 가격으로 비교했을 때 큰 차이는 없어요.',
      '용량 대비 가격은 상대적으로 높은 편이에요. 같은 단위로 비교했을 때 더 저렴한 상품이 있어요.',
      '용량 대비 가격을 정확히 비교하기 어려워요. 상품의 용량이나 구성 정보가 충분하지 않아요.',
      '추가 구성이나 증정 혜택이 좋은 편이에요. 본품 외에 확인된 추가 용량이나 증정 구성이 있어요.',
      '구성 혜택은 다른 상품과 비슷한 수준이에요. 추가 구성에서 큰 차이는 확인되지 않아요.',
      '구성 혜택은 비교 상품보다 아쉬운 편이에요. 다른 상품보다 추가 구성이나 증정 혜택이 적어요.',
      '추가 구성이나 증정 혜택을 정확히 비교하기 어려워요. 구성품 정보가 충분히 확인되지 않았어요.',
      '과하게 많은 수량을 구매하지 않아도 되는 구성이에요. 비교적 적은 수량으로 구매할 수 있어 부담이 적어요.',
      '구매 수량은 다른 구성과 비슷한 수준이에요. 수량 측면에서 큰 차이는 없어요.',
      '필요한 만큼만 구매하려는 경우에는 많은 구성일 수 있어요. 더 적은 구성이 있지만 현재 상품은 묶음 수량이 많은 편이에요.',
      '구매 수량을 정확히 비교하기 어려워요. 상품의 수량이나 구성 정보가 충분하지 않아요.',
      '현재 확인되는 할인 조건이 좋은 편이에요. 복잡한 추가 조건 없이 비교적 간단하게 할인받을 수 있어요.',
      '할인 혜택은 있지만 간단한 추가 조건이 필요해요. 쿠폰 적용 등 일부 조건을 확인하면 할인받을 수 있어요.',
      '할인을 받기 위한 조건이 다소 복잡한 편이에요. 여러 쿠폰이나 결제 조건 등을 확인해야 해요.',
      '실제 할인 조건을 정확히 판단하기 어려워요. 쿠폰이나 할인 적용 조건 중 확인되지 않은 부분이 있어요.',
      '비교 가능한 판매처 중 배송이 빠른 편이에요. 현재 확인된 배송 정보 기준으로 빠르게 받을 수 있는 조건이에요.',
      '배송 속도는 다른 판매처와 비슷한 수준이에요. 예상 배송일에서 큰 차이는 없어요.',
      '빠른 배송을 중요하게 본다면 다른 판매처가 더 유리해요. 현재 확인된 배송 속도가 비교 판매처보다 느린 편이에요.',
      '배송 속도를 정확하게 비교하기 어려워요. 도착 예정일이나 배송 조건이 충분히 확인되지 않았어요.',
      '현재 이용 가능한 멤버십이나 적립 혜택을 받을 수 있어요. 확인된 사용자 혜택을 적용하면 구매 조건이 더 유리해져요.',
      '적용 가능한 멤버십 혜택이 있지만 영향은 크지 않은 편이에요. 혜택을 반영해도 판매처 간 차이가 크지 않아요.',
      '현재 확인된 혜택 기준으로는 다른 판매처가 더 유리할 수 있어요. 이 판매처에서 받을 수 있는 추가 혜택이 상대적으로 적어요.',
      '멤버십이나 적립 혜택을 정확히 판단하기 어려워요. 사용자의 혜택 적용 여부나 자격이 충분히 확인되지 않았어요.',
    ]) {
      expect(CATCHCATCH_JUDGMENT_INSTRUCTIONS).toContain(approvedCopy);
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
