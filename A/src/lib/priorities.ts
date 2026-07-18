export const PRIORITIES = [
  { id: "final_payment_amount", label: "최종 결제금액" },
  { id: "buying_timing", label: "지금 사기 좋은지" },
  { id: "price_per_volume", label: "용량 대비 가격" },
  { id: "set_and_gifts", label: "기획세트·증정품" },
  { id: "needed_quantity", label: "필요한 만큼 구매" },
  { id: "simple_discount", label: "간편한 할인" },
  { id: "fast_delivery", label: "빠른 배송" },
  { id: "rewards_membership", label: "적립·멤버십 혜택" },
] as const;

export type PriorityId = (typeof PRIORITIES)[number]["id"];
export const PRIORITY_STORAGE_KEY = "catchcatch:selected-priorities";
