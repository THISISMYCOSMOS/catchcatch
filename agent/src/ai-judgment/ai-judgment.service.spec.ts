import { ConfigService } from '@nestjs/config';
import {
  AiJudgmentService,
  validateAiJudgmentBusinessRules,
} from './ai-judgment.service';
import {
  AiJudgment,
  JudgmentInput,
  judgmentInputSchema,
} from './ai-judgment.schema';

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
    recent_average_discount_rate: 3.8,
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
      id: 'fact-price',
      description: '현재 실구매가는 25,000원이다.',
      source_urls: ['https://www.oliveyoung.co.kr/store/goods/example'],
    },
    {
      id: 'fact-average',
      description: '최근 평균가는 26,000원이다.',
      source_urls: ['https://www.oliveyoung.co.kr/store/goods/example'],
    },
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
  comparison_price_basis: 'PUBLIC',
  cheapest_offer_id: 'offer-oliveyoung',
  price_history_status: 'INSUFFICIENT',
  data_quality: {
    status: 'PARTIAL',
    warnings: ['할인 조건 일부를 확인할 수 없습니다.'],
  },
  allowed_conclusions: ['NEAR_REGULAR_PRICE'],
  allowed_offer_ids: ['offer-oliveyoung'],
};

const validJudgment: AiJudgment = {
  evidence_review: {
    supporting_fact_ids: ['fact-price', 'fact-average'],
    contradicting_fact_ids: [],
    missing_evidence: ['공개 할인율'],
  },
  decision_status: 'DECIDED',
  conclusion: 'NEAR_REGULAR_PRICE',
  conclusion_reason: '현재 실구매가 25,000원은 최근 평균가 26,000원과 비슷합니다.',
  confidence: {
    level: 'MEDIUM',
    reason: '현재 가격과 최근 평균가는 확인됐지만 일부 조건은 확인이 필요합니다.',
    used_fact_ids: ['fact-price', 'fact-average'],
  },
  criteria_results: [
    {
      criterion: 'FINAL_PAYMENT_AMOUNT',
      status: 'NEUTRAL',
      reason: '현재 실구매가는 25,000원입니다.',
      used_fact_ids: ['fact-price'],
    },
    {
      criterion: 'PURCHASE_TIMING',
      status: 'NEUTRAL',
      reason: '최근 평균가는 26,000원입니다.',
      used_fact_ids: ['fact-average'],
    },
    {
      criterion: 'SIMPLE_DISCOUNT',
      status: 'UNKNOWN',
      reason: '확인된 할인 사실이 부족합니다.',
      used_fact_ids: [],
    },
  ],
  recommended_offer_id: 'offer-oliveyoung',
  recommendation_reason: '허용된 판매처 후보입니다.',
  warnings: ['할인 조건 일부를 확인할 수 없습니다.'],
  used_fact_ids: ['fact-price', 'fact-average'],
};

describe('AiJudgmentService', () => {
  it('returns a deterministic result without calling OpenAI in mock mode', async () => {
    const config = new ConfigService({ AI_JUDGMENT_MODE: 'mock' });
    const service = new AiJudgmentService(config);

    await expect(service.judge(input)).resolves.toMatchObject({
      decision_status: 'DECIDED',
      conclusion: 'NEAR_REGULAR_PRICE',
      recommended_offer_id: 'offer-oliveyoung',
      used_fact_ids: ['fact-price', 'fact-average'],
      confidence: { level: 'MEDIUM' },
    });
  });

  it('requires an API key in real mode', async () => {
    const config = new ConfigService({ AI_JUDGMENT_MODE: 'real' });
    const service = new AiJudgmentService(config);

    await expect(service.judge(input)).rejects.toThrow(
      'OPENAI_API_KEY is required in real mode',
    );
  });

  it('rejects a number that does not exist in verified facts', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      conclusion_reason: '현재 실구매가는 24,000원입니다.',
    })).toThrow('Output contains an unverified number: 24000');
  });

  it('rejects manufacturing-cost language', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      conclusion_reason: '제조원가에 가까운 가격입니다.',
    })).toThrow('Manufacturing cost language is forbidden');
  });

  it('rejects confidence facts that are not globally disclosed', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      used_fact_ids: ['fact-price'],
    })).toThrow('Specific explanation fact is missing from used_fact_ids');
  });

  it('rejects facts that cite a source outside the content-verified offers', () => {
    expect(() => validateAiJudgmentBusinessRules({
      ...input,
      facts: [{
        ...input.facts[0],
        source_urls: ['https://forged.example/product'],
      }, input.facts[1]],
    }, validJudgment)).toThrow('Fact references an unverified source');
  });

  it('rejects a personalized price when eligibility was not verified', () => {
    expect(() => judgmentInputSchema.parse({
      ...input,
      offers: [{
        ...input.offers[0],
        personalized_effective_price: 24000,
        personalized_price_status: 'UNKNOWN_ELIGIBILITY',
      }],
    })).toThrow('Unverified eligibility cannot contain a personalized price');
  });

  it('requires verified eligibility for a personalized cheapest-price basis', () => {
    expect(() => judgmentInputSchema.parse({
      ...input,
      comparison_price_basis: 'PERSONALIZED',
    })).toThrow('Personalized price basis requires verified eligibility');
  });

  it('rejects a non-comparable offer from recommendation candidates', () => {
    expect(() => judgmentInputSchema.parse({
      ...input,
      offers: [{
        ...input.offers[0],
        comparison_status: 'NOT_COMPARABLE',
      }],
    })).toThrow('Allowed offer is not comparable');
  });

  it('accepts a grounded judgment with AI-selected confidence', () => {
    expect(validateAiJudgmentBusinessRules(input, validJudgment)).toEqual(validJudgment);
  });

  it('allows the AI to abstain even when the backend supplied an eligible conclusion', () => {
    const insufficientInput: JudgmentInput = {
      ...input,
      data_quality: {
        status: 'LIMITED',
        warnings: ['가격 이력이 충분하지 않습니다.'],
      },
    };
    const insufficientJudgment: AiJudgment = {
      ...validJudgment,
      evidence_review: {
        supporting_fact_ids: ['fact-price'],
        contradicting_fact_ids: [],
        missing_evidence: ['충분한 가격 이력'],
      },
      decision_status: 'INSUFFICIENT_EVIDENCE',
      conclusion: null,
      conclusion_reason: '가격 이력이 충분하지 않아 구매 시점을 판단할 수 없습니다.',
      confidence: {
        level: 'LOW',
        reason: '현재 가격만 확인되어 가격 수준을 비교할 근거가 부족합니다.',
        used_fact_ids: ['fact-price'],
      },
      recommended_offer_id: null,
      recommendation_reason: '판단 근거가 충분하지 않아 판매처를 추천하지 않습니다.',
      used_fact_ids: ['fact-price', 'fact-average'],
    };

    expect(validateAiJudgmentBusinessRules(
      insufficientInput,
      insufficientJudgment,
    )).toEqual(insufficientJudgment);
  });

  it('returns an abstention in mock mode when no conclusion is eligible', async () => {
    const config = new ConfigService({ AI_JUDGMENT_MODE: 'mock' });
    const service = new AiJudgmentService(config);

    await expect(service.judge({
      ...input,
      allowed_conclusions: [],
    })).resolves.toMatchObject({
      decision_status: 'INSUFFICIENT_EVIDENCE',
      conclusion: null,
      confidence: { level: 'LOW' },
      recommended_offer_id: null,
    });
  });

  it('rejects a forced conclusion marked as insufficient evidence', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      decision_status: 'INSUFFICIENT_EVIDENCE',
      confidence: {
        ...validJudgment.confidence,
        level: 'LOW',
      },
      recommended_offer_id: null,
    })).toThrow('INSUFFICIENT_EVIDENCE cannot contain a conclusion');
  });

  it('rejects unknown facts in the evidence review', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      evidence_review: {
        ...validJudgment.evidence_review,
        contradicting_fact_ids: ['fact-forged'],
      },
    })).toThrow('Evidence review references an unknown fact');
  });

  it('requires a conflict or missing evidence when the AI abstains', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      evidence_review: {
        supporting_fact_ids: ['fact-price'],
        contradicting_fact_ids: [],
        missing_evidence: [],
      },
      decision_status: 'INSUFFICIENT_EVIDENCE',
      conclusion: null,
      confidence: {
        ...validJudgment.confidence,
        level: 'LOW',
      },
      recommended_offer_id: null,
    })).toThrow('INSUFFICIENT_EVIDENCE requires a conflict or missing evidence');
  });

  it('requires supporting evidence for a decided result', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      evidence_review: {
        ...validJudgment.evidence_review,
        supporting_fact_ids: [],
      },
    })).toThrow('DECIDED requires supporting evidence');
  });

  it('rejects a fact used as both supporting and contradicting evidence', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      evidence_review: {
        ...validJudgment.evidence_review,
        contradicting_fact_ids: ['fact-price'],
      },
    })).toThrow('A fact cannot both support and contradict the decision');
  });

  it('rejects a recommendation when the AI abstains', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      decision_status: 'INSUFFICIENT_EVIDENCE',
      conclusion: null,
      confidence: {
        ...validJudgment.confidence,
        level: 'LOW',
      },
    })).toThrow('INSUFFICIENT_EVIDENCE cannot recommend an offer');
  });

  it('rejects a decided result without a conclusion', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      conclusion: null,
    })).toThrow('DECIDED requires a conclusion');
  });

  it('rejects non-low confidence when the AI abstains', () => {
    expect(() => validateAiJudgmentBusinessRules(input, {
      ...validJudgment,
      decision_status: 'INSUFFICIENT_EVIDENCE',
      conclusion: null,
      recommended_offer_id: null,
    })).toThrow('INSUFFICIENT_EVIDENCE requires LOW confidence');
  });
});
