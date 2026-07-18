// Data source: frontend_mock. The API contract is not yet provided.
// This provisional view model is for the result-screen demo only.
// Official-store values are user-approved mock supplements; the source CSV has no official-store column.
export const analysisMock = {
  product: { sourceUrl: "데모 데이터", name: "라운드랩 독도 선크림", platform: "쿠팡", price: "15,000원", description: "2026년 7월 세 판매처 중 쿠팡에서 가장 낮은 가격으로 확인된 선크림이에요." },
  verdict: { title: "저점매수", summary: "7월 최저가 15,000원은 1~7월 비교 구간에서 가장 낮은 가격이에요. 다만 실제 구매 전에는 쿠폰과 배송비를 함께 확인하세요." },
  discount: { displayed: null, actual: null },
  baseData: { averagePrice: "확인 전", previousSalePrice: "확인 전", shippingIncluded: "확인 전", unitPrice: "확인 전" },
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
    { title: "가장 적게 결제하기 · 좋음", result: "7월 기준 쿠팡 15,000원으로 세 판매처 중 최저가예요." },
    { title: "지금 사기 좋은지 · 저점매수에 가까움", result: "7월 최저가 15,000원은 1~7월 전체 구간 중 가장 낮은 가격이에요." },
    { title: "세일 타이밍 · 중요", result: "2·4·5월은 올리브영, 1·3월은 무신사, 6·7월은 쿠팡이 최저가였어요." },
  ],
  recommendedStores: [
    { name: "쿠팡", price: "15,000원", description: "7월 기준 최저가이며 1월보다 20.6% 낮아요.", url: "https://www.coupang.com" },
    { name: "올리브영", price: "17,500원", description: "일곱 달 중 세 번 최저가로 가장 자주 선정됐어요.", url: "https://www.oliveyoung.co.kr" },
    { name: "무신사", price: "17,900원", description: "1월과 3월에 최저가였던 판매처예요.", url: "https://www.musinsa.com/beauty" },
    { name: "브랜드 공식몰", price: "18,500원", description: "CSV 미제공으로 임시 보완한 데모 가격이에요.", url: "https://roundlab.co.kr" },
  ],
  lowestStores: [
    { name: "쿠팡", price: "15,000원", description: "7월 조사 가격 기준 최저가", url: "https://www.coupang.com" },
    { name: "올리브영", price: "17,500원", description: "7월 조사 가격 기준 두 번째", url: "https://www.oliveyoung.co.kr" },
    { name: "무신사", price: "17,900원", description: "7월 조사 가격 기준 세 번째", url: "https://www.musinsa.com/beauty" },
    { name: "브랜드 공식몰", price: "18,500원", description: "CSV 미제공으로 임시 보완한 데모 가격", url: "https://roundlab.co.kr" },
  ],
} as const;

export const similarProductsMock = [
  { name: "유사 선크림 A", platform: "올리브영", price: "가격 확인 전", reason: "유사상품 API 연결 대기" },
  { name: "유사 선크림 B", platform: "무신사", price: "가격 확인 전", reason: "유사상품 API 연결 대기" },
  { name: "유사 선크림 C", platform: "쿠팡", price: "가격 확인 전", reason: "유사상품 API 연결 대기" },
] as const;
