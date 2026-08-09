export type SaleStatus = "ongoing" | "upcoming";

export type SaleCalendarItem = {
  id: string;
  title: string;
  sellerName: string;
  shortDescription: string;
  description: string;
  status: SaleStatus;
  statusLabel: string;
  startDate: string;
  endDate: string;
  maxDiscountLabel: string;
  dDayLabel: string;
  imageUrl: string | null;
  targetCategory: string | null;
  conditions: string | null;
  markedDates: readonly string[];
};

export const SALE_CALENDAR_MONTH = "2026-07";

export const SALE_CALENDAR_ITEMS: readonly SaleCalendarItem[] = [
  {
    id: "sale-oliveyoung-summer",
    title: "여름 피부 진정템 특별 세일",
    sellerName: "올리브영",
    shortDescription: "세일 일정과 할인 정보를 한눈에 확인해보세요.",
    description: "현재 화면은 프론트엔드 mock 일정 정보를 사용하고 있어요. 실제 적용 상품과 세부 이용 조건은 백엔드 데이터 연결 후 제공됩니다.",
    status: "ongoing",
    statusLabel: "진행 중",
    startDate: "2026-07-27",
    endDate: "2026-08-02",
    maxDiscountLabel: "최대 35%",
    dDayLabel: "진행 중",
    imageUrl: null,
    targetCategory: null,
    conditions: null,
    markedDates: ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"],
  },
  {
    id: "sale-musinsa-beauty",
    title: "무신사 뷰티 위크 여름 결산",
    sellerName: "무신사 뷰티",
    shortDescription: "세일 일정과 할인 정보를 한눈에 확인해보세요.",
    description: "현재 화면은 프론트엔드 mock 일정 정보를 사용하고 있어요. 실제 적용 상품과 세부 이용 조건은 백엔드 데이터 연결 후 제공됩니다.",
    status: "upcoming",
    statusLabel: "진행 예정",
    startDate: "2026-07-31",
    endDate: "2026-08-06",
    maxDiscountLabel: "최대 40%",
    dDayLabel: "D-2",
    imageUrl: null,
    targetCategory: null,
    conditions: null,
    markedDates: ["2026-07-31", "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"],
  },
  {
    id: "sale-brand-mall",
    title: "공식몰 베스트 스킨케어 브랜드전",
    sellerName: "브랜드 공식몰",
    shortDescription: "세일 일정과 할인 정보를 한눈에 확인해보세요.",
    description: "현재 화면은 프론트엔드 mock 일정 정보를 사용하고 있어요. 실제 적용 상품과 세부 이용 조건은 백엔드 데이터 연결 후 제공됩니다.",
    status: "upcoming",
    statusLabel: "진행 예정",
    startDate: "2026-08-06",
    endDate: "2026-08-12",
    maxDiscountLabel: "최대 30%",
    dDayLabel: "D-8",
    imageUrl: null,
    targetCategory: null,
    conditions: null,
    markedDates: ["2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"],
  },
];
