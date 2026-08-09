// B 결과 화면의 구조를 A 안에서 독립적으로 재구성하기 위한 데모 데이터입니다.
// 실제 상품 분석 API 계약은 아직 연결되지 않았습니다.
export type StoreOffer = {
  readonly name: string;
  readonly price: string;
  readonly description: string;
  readonly purchaseUrl: string;
};

export const analysisMock = {
  product: {
    name: "라운드랩 독도 선크림",
    price: "15,000원",
    description: "2026년 7월 비교 판매처 중 쿠팡에서 가장 낮은 가격으로 확인된 데모 상품이에요.",
  },
  verdict: {
    title: "지금 구매해도 좋아요",
    summary: "7월 최저가 15,000원은 1~7월 비교 구간에서 가장 낮은 가격이에요. 실제 구매 전에는 쿠폰과 배송비를 함께 확인하세요.",
  },
  confidence: {
    label: "보통",
    summary: "가격 흐름은 충분하지만 배송비와 쿠폰 조건은 한 번 더 확인해 주세요.",
  },
  discount: { displayed: null, actual: null },
  baseData: {
    averagePrice: "확인 전",
    previousSalePrice: "확인 전",
    shippingIncluded: "확인 전",
    unitPrice: "확인 전",
  },
  priceHistory: [
    { month: "1월", coupang: 18900, musinsa: 18400, oliveyoung: 19800, official: 20500, lowest: "musinsa" },
    { month: "2월", coupang: 18200, musinsa: 19000, oliveyoung: 17600, official: 19800, lowest: "oliveyoung" },
    { month: "3월", coupang: 17500, musinsa: 16900, oliveyoung: 18900, official: 19200, lowest: "musinsa" },
    { month: "4월", coupang: 16800, musinsa: 18800, oliveyoung: 16200, official: 18900, lowest: "oliveyoung" },
    { month: "5월", coupang: 16600, musinsa: 18500, oliveyoung: 15800, official: 17900, lowest: "oliveyoung" },
    { month: "6월", coupang: 15800, musinsa: 16100, oliveyoung: 17600, official: 17200, lowest: "coupang" },
    { month: "7월", coupang: 15000, musinsa: 17900, oliveyoung: 17500, official: 18500, lowest: "coupang" },
  ],
  criteria: [
    { title: "가장 적게 결제하기 · 좋음", result: "7월 기준 쿠팡 15,000원으로 비교 판매처 중 최저가예요." },
    { title: "지금 사기 좋은지 · 저점매수", result: "7월 최저가 15,000원은 1~7월 전체 구간 중 가장 낮은 가격이에요." },
    { title: "세일 타이밍 · 중요", result: "2·4·5월은 올리브영, 1·3월은 무신사, 6·7월은 쿠팡이 최저가였어요." },
  ],
  recommendedStores: [
    { name: "쿠팡", price: "15,000원", description: "7월 기준 최저가이며 1월보다 20.6% 낮아요.", purchaseUrl: "https://www.coupang.com" },
    { name: "올리브영", price: "17,500원", description: "일곱 달 중 세 번 최저가로 가장 자주 선정됐어요.", purchaseUrl: "https://www.oliveyoung.co.kr" },
    { name: "무신사", price: "17,900원", description: "1월과 3월에 최저가였던 판매처예요.", purchaseUrl: "https://www.musinsa.com/beauty" },
  ],
  lowestStores: [
    { name: "쿠팡", price: "15,000원", description: "7월 조사 가격 기준 최저가", purchaseUrl: "https://www.coupang.com" },
    { name: "올리브영", price: "17,500원", description: "7월 조사 가격 기준 두 번째", purchaseUrl: "https://www.oliveyoung.co.kr" },
    { name: "무신사", price: "17,900원", description: "7월 조사 가격 기준 세 번째", purchaseUrl: "https://www.musinsa.com/beauty" },
  ],
} as const;

export const similarProductsMock = [
  { name: "유사 선크림 A", platform: "올리브영", price: "가격 확인 전", reason: "같은 선케어 유형의 비교 후보" },
  { name: "유사 선크림 B", platform: "무신사", price: "가격 확인 전", reason: "같은 선케어 유형의 비교 후보" },
  { name: "유사 선크림 C", platform: "쿠팡", price: "가격 확인 전", reason: "비슷한 사용감의 비교 후보" },
] as const;
