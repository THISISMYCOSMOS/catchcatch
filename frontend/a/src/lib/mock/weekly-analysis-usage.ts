// 프론트엔드 데모 전용 사용량 저장소입니다.
// 실제 사용자별 주간 제한과 초기화는 백엔드에서 검증해야 하며, 이 값은 보안 수단이 아닙니다.
export const FRONTEND_MOCK_WEEKLY_ANALYSIS_LIMIT = 10;
const FRONTEND_MOCK_USAGE_STORAGE_KEY = "catchcatch:analysis-remaining-by-user";

export type WeeklyAnalysisUsageViewModel = {
  usedCount: number;
  limit: number;
  remainingCount: number;
  limitReached: boolean;
  resetAt: string | null;
};

type RemainingAnalysesByUsername = Record<string, unknown>;

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function readStoredRemainingAnalyses(): RemainingAnalysesByUsername {
  try {
    const storedValue = window.localStorage.getItem(FRONTEND_MOCK_USAGE_STORAGE_KEY);
    if (!storedValue) return {};
    const parsedValue: unknown = JSON.parse(storedValue);
    return parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
      ? parsedValue as RemainingAnalysesByUsername
      : {};
  } catch {
    return {};
  }
}

function sanitizeRemainingCount(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) return FRONTEND_MOCK_WEEKLY_ANALYSIS_LIMIT;
  return Math.min(FRONTEND_MOCK_WEEKLY_ANALYSIS_LIMIT, Math.max(0, value));
}

function toViewModel(remainingCount: number): WeeklyAnalysisUsageViewModel {
  return {
    usedCount: FRONTEND_MOCK_WEEKLY_ANALYSIS_LIMIT - remainingCount,
    limit: FRONTEND_MOCK_WEEKLY_ANALYSIS_LIMIT,
    remainingCount,
    limitReached: remainingCount === 0,
    resetAt: null,
  };
}

export function getFrontendMockWeeklyAnalysisUsage(username: string) {
  const storedRemaining = readStoredRemainingAnalyses()[normalizeUsername(username)];
  return toViewModel(sanitizeRemainingCount(storedRemaining));
}

export function consumeFrontendMockWeeklyAnalysis(username: string) {
  const normalizedUsername = normalizeUsername(username);
  const remainingByUsername = readStoredRemainingAnalyses();
  const currentRemaining = sanitizeRemainingCount(remainingByUsername[normalizedUsername]);
  const nextRemaining = Math.max(0, currentRemaining - 1);

  try {
    window.localStorage.setItem(FRONTEND_MOCK_USAGE_STORAGE_KEY, JSON.stringify({
      ...remainingByUsername,
      [normalizedUsername]: nextRemaining,
    }));
  } catch {
    // 저장이 불가능해도 이미 성공한 분석 요청의 결과 흐름은 유지합니다.
  }

  return toViewModel(nextRemaining);
}
