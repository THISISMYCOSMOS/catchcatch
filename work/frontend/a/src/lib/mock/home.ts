export type RecentAnalysisItem = {
  id: string;
  productName: string;
  sellerName: string;
  analyzedAt: string;
  price: number;
  imageUrl: string | null;
};

export type ProductPreview = {
  id: string;
  productName: string;
  sellerName: string;
  price: number;
  description: string;
  imageUrl: null;
  sourceUrl: string;
};

type HomeNotificationBase = {
  id: string;
  title: string;
  message: string;
  createdAtLabel: string;
  isRead: boolean;
  type: "analysis" | "price" | "promotion" | "service";
};

export type HomeNotificationItem = HomeNotificationBase & (
  | { actionType: "navigate"; targetPath: string }
  | { actionType: "modal"; analysisId?: string }
  | { actionType: "none" }
);

export const DEMO_PRODUCT_URL = "https://catchcatch.example/products/demo";

export const DEMO_PRODUCT: ProductPreview = {
  id: "demo-product",
  productName: "상품명",
  sellerName: "플랫폼명",
  price: 100000,
  description: "상품에 대한 설명",
  imageUrl: null,
  sourceUrl: DEMO_PRODUCT_URL,
};

export const RECENT_ANALYSES: RecentAnalysisItem[] = [
  { id: "recent-1", productName: "상품명", sellerName: "플랫폼명", analyzedAt: "2026.07.16", price: 100000, imageUrl: null },
  { id: "recent-2", productName: "상품명", sellerName: "플랫폼명", analyzedAt: "2026.07.15", price: 100000, imageUrl: null },
  { id: "recent-3", productName: "상품명", sellerName: "플랫폼명", analyzedAt: "2026.07.14", price: 100000, imageUrl: null },
  { id: "recent-4", productName: "수분 진정 크림", sellerName: "플랫폼명", analyzedAt: "2026.07.10", price: 32800, imageUrl: null },
  { id: "recent-5", productName: "데일리 선크림 세트", sellerName: "플랫폼명", analyzedAt: "2026.07.03", price: 25900, imageUrl: null },
  { id: "recent-6", productName: "저자극 클렌징 오일 대용량", sellerName: "플랫폼명", analyzedAt: "2026.06.28", price: 41700, imageUrl: null },
];

export function getRecentAnalysisById(id: string) {
  return RECENT_ANALYSES.find((analysis) => analysis.id === id) ?? null;
}

export const HOME_NOTIFICATIONS: HomeNotificationItem[] = [
  { id: "notification-1", title: "분석이 완료되었어요", message: "000의 분석이 완료되었습니다.", createdAtLabel: "0분 전", isRead: false, type: "analysis", actionType: "modal", analysisId: "recent-1" },
  { id: "notification-2", title: "관심상품 가격이 변동되었어요", message: "000의 가격이 000원 내렸어요.", createdAtLabel: "0시간 전", isRead: false, type: "price", actionType: "none" },
  { id: "notification-3", title: "여름 세일이 시작됐어요!", message: "스킨케어 최대 00% 할인 중이에요.", createdAtLabel: "0시간 전", isRead: true, type: "promotion", actionType: "modal" },
  { id: "notification-4", title: "서비스 점검 안내", message: "0월 00일(일) 새벽 0시~0시 서비스 점검이 있어요.", createdAtLabel: "0일 전", isRead: true, type: "service", actionType: "modal" },
];
