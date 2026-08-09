export type SavedProduct = {
  id: string;
  brand: string;
  name: string;
  price: number;
};

export const SAVED_PRODUCTS: readonly SavedProduct[] = [
  { id: "saved-1", brand: "스킨케어", name: "수분 진정 크림", price: 21000 },
  { id: "saved-2", brand: "선케어", name: "데일리 선 에센스", price: 18900 },
  { id: "saved-3", brand: "헤어케어", name: "손상모 단백질 트리트먼트", price: 24000 },
  { id: "saved-4", brand: "스킨케어", name: "저자극 클렌징 오일", price: 19800 },
  { id: "saved-5", brand: "메이크업", name: "롱래스팅 쿠션", price: 32000 },
  { id: "saved-6", brand: "바디케어", name: "퍼퓸 바디 로션", price: 17500 },
  { id: "saved-7", brand: "스킨케어", name: "비타민 세럼", price: 27800 },
  { id: "saved-8", brand: "메이크업", name: "소프트 블러 틴트", price: 15000 },
  { id: "saved-9", brand: "헤어케어", name: "두피 쿨링 샴푸", price: 22500 },
  { id: "saved-10", brand: "클렌징", name: "약산성 젤 클렌저", price: 16000 },
  { id: "saved-11", brand: "마스크팩", name: "진정 수분 마스크", price: 12000 },
  { id: "saved-12", brand: "향수", name: "시그니처 오 드 퍼퓸", price: 49000 },
];
