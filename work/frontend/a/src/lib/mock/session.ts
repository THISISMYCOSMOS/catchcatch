export const MOCK_AUTH_SESSION_KEY = "catchcatch:authenticated";
const MOCK_AUTH_USER_KEY = "catchcatch:authenticated-user";
const MOCK_ONBOARDING_STATUS_KEY = "catchcatch:onboarding-status";
const LEGACY_DEFAULT_USERNAME = "catchcatch";

type OnboardingStatusByUsername = Record<string, boolean>;

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function readOnboardingStatuses(): OnboardingStatusByUsername {
  try {
    const storedStatuses = localStorage.getItem(MOCK_ONBOARDING_STATUS_KEY);
    if (!storedStatuses) return {};
    const parsedStatuses: unknown = JSON.parse(storedStatuses);
    return parsedStatuses && typeof parsedStatuses === "object"
      ? parsedStatuses as OnboardingStatusByUsername
      : {};
  } catch {
    return {};
  }
}

function writeOnboardingStatus(username: string, hasCompletedOnboarding: boolean) {
  const normalizedUsername = normalizeUsername(username);
  const statuses = readOnboardingStatuses();
  localStorage.setItem(MOCK_ONBOARDING_STATUS_KEY, JSON.stringify({
    ...statuses,
    [normalizedUsername]: hasCompletedOnboarding,
  }));
}

export function setMockAuthenticated(username: string, rememberLogin = false) {
  sessionStorage.removeItem(MOCK_AUTH_SESSION_KEY);
  localStorage.removeItem(MOCK_AUTH_SESSION_KEY);
  sessionStorage.removeItem(MOCK_AUTH_USER_KEY);
  localStorage.removeItem(MOCK_AUTH_USER_KEY);
  const storage = rememberLogin ? localStorage : sessionStorage;
  storage.setItem(MOCK_AUTH_SESSION_KEY, "true");
  storage.setItem(MOCK_AUTH_USER_KEY, normalizeUsername(username));
}

export function isMockAuthenticated() {
  return getMockAuthenticatedUsername() !== null;
}

export function getMockAuthenticatedUsername() {
  if (sessionStorage.getItem(MOCK_AUTH_SESSION_KEY) === "true") {
    return sessionStorage.getItem(MOCK_AUTH_USER_KEY) || LEGACY_DEFAULT_USERNAME;
  }
  if (localStorage.getItem(MOCK_AUTH_SESSION_KEY) === "true") {
    return localStorage.getItem(MOCK_AUTH_USER_KEY) || LEGACY_DEFAULT_USERNAME;
  }
  return null;
}

export function clearMockAuthentication() {
  sessionStorage.removeItem(MOCK_AUTH_SESSION_KEY);
  localStorage.removeItem(MOCK_AUTH_SESSION_KEY);
  sessionStorage.removeItem(MOCK_AUTH_USER_KEY);
  localStorage.removeItem(MOCK_AUTH_USER_KEY);
}

export function initializeMockOnboarding(username: string) {
  writeOnboardingStatus(username, false);
}

export function hasCompletedMockOnboarding(username: string) {
  const status = readOnboardingStatuses()[normalizeUsername(username)];
  // Accounts that existed before onboarding was introduced are treated as completed.
  return status ?? true;
}

export function completeMockOnboarding() {
  const username = getMockAuthenticatedUsername();
  if (!username) return false;
  writeOnboardingStatus(username, true);
  return true;
}

export type MockAuthenticatedRoute = "/login" | "/priorities" | "/home";

export function getMockAuthenticatedRoute(): MockAuthenticatedRoute {
  const username = getMockAuthenticatedUsername();
  if (!username) return "/login";
  return hasCompletedMockOnboarding(username) ? "/home" : "/priorities";
}
