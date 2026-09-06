export const PRIORITIES = [
  {
    id: "FINAL_PAYMENT_AMOUNT",
    label: "배송비 포함 최종가",
    description: "상품 가격에 확인 가능한 배송비까지 더해 실제 결제 금액을 비교해요.",
  },
  {
    id: "PURCHASE_TIMING",
    label: "지금 사기 좋은 시점",
    description: "현재 가격과 최근 가격 흐름을 함께 보고 지금 구매할 만한 시점인지 판단해요.",
  },
  {
    id: "UNIT_PRICE",
    label: "용량 대비 가성비",
    description: "용량이나 수량이 달라도 같은 기준으로 나눠 어떤 구성이 더 경제적인지 비교해요.",
  },
  {
    id: "SET_AND_GIFTS",
    label: "기획세트·증정품",
    description: "본품 구성뿐 아니라 함께 제공되는 증정품까지 포함해 전체 가치를 비교해요.",
  },
  {
    id: "RIGHT_SIZED_PURCHASE",
    label: "필요한 만큼만 구매",
    description: "대용량이 더 저렴해도 과한 구매가 되지 않도록 필요한 양과 가격을 함께 봐요.",
  },
  {
    id: "SIMPLE_DISCOUNT",
    label: "할인 여부",
    description: "현재 확인할 수 있는 할인이나 쿠폰이 적용되는 상품을 우선 살펴봐요.",
  },
  {
    id: "FAST_DELIVERY",
    label: "빠른 배송",
    description: "비슷한 조건이라면 더 빠르게 받을 수 있는 판매처를 중요하게 비교해요.",
  },
  {
    id: "REWARDS_AND_MEMBERSHIP",
    label: "적립·멤버십 혜택",
    description: "등록한 멤버십과 등급 등 확인 가능한 혜택을 구매 판단에 함께 반영해요.",
  },
] as const;

export type PriorityId = (typeof PRIORITIES)[number]["id"];
export const PRIORITY_STORAGE_KEY = "catchcatch:selected-priorities";

type PrioritiesByUsername = Record<string, unknown>;

const PRIORITY_IDS = new Set<string>(PRIORITIES.map((priority) => priority.id));

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function filterPriorityIds(value: unknown): PriorityId[] {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(value.filter((id): id is PriorityId => (
    typeof id === "string" && PRIORITY_IDS.has(id)
  )))).slice(0, 3);
}

function readJson(storage: Storage, key: string): unknown {
  try {
    const stored = storage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function getStoredPriorities(username: string): PriorityId[] {
  const normalizedUsername = normalizeUsername(username);
  const localValue = readJson(localStorage, PRIORITY_STORAGE_KEY);

  if (Array.isArray(localValue)) return filterPriorityIds(localValue);
  if (localValue && typeof localValue === "object") {
    const prioritiesByUsername = localValue as PrioritiesByUsername;
    return normalizedUsername in prioritiesByUsername
      ? filterPriorityIds(prioritiesByUsername[normalizedUsername])
      : [];
  }

  return filterPriorityIds(readJson(sessionStorage, PRIORITY_STORAGE_KEY));
}

export function savePriorities(username: string, priorities: readonly PriorityId[]) {
  const normalizedUsername = normalizeUsername(username);
  const sanitizedPriorities = filterPriorityIds(priorities);
  const localValue = readJson(localStorage, PRIORITY_STORAGE_KEY);
  const prioritiesByUsername = localValue && typeof localValue === "object" && !Array.isArray(localValue)
    ? localValue as PrioritiesByUsername
    : {};

  localStorage.setItem(PRIORITY_STORAGE_KEY, JSON.stringify({
    ...prioritiesByUsername,
    [normalizedUsername]: sanitizedPriorities,
  }));
  sessionStorage.setItem(PRIORITY_STORAGE_KEY, JSON.stringify(sanitizedPriorities));
}
