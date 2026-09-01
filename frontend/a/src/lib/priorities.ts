export const PRIORITIES = [
  { id: "FINAL_PAYMENT_AMOUNT", label: "배송비 포함 최종가" },
  { id: "PURCHASE_TIMING", label: "지금 사기 좋은 시점" },
  { id: "UNIT_PRICE", label: "용량 대비 가성비" },
  { id: "SET_AND_GIFTS", label: "기획세트·증정품" },
  { id: "RIGHT_SIZED_PURCHASE", label: "필요한 만큼만 구매" },
  { id: "SIMPLE_DISCOUNT", label: "할인 여부" },
  { id: "FAST_DELIVERY", label: "빠른 배송" },
  { id: "REWARDS_AND_MEMBERSHIP", label: "적립·멤버십 혜택" },
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
