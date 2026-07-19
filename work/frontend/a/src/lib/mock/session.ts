export const MOCK_AUTH_SESSION_KEY = "catchcatch:authenticated";

export function setMockAuthenticated(rememberLogin = false) {
  sessionStorage.removeItem(MOCK_AUTH_SESSION_KEY);
  localStorage.removeItem(MOCK_AUTH_SESSION_KEY);
  const storage = rememberLogin ? localStorage : sessionStorage;
  storage.setItem(MOCK_AUTH_SESSION_KEY, "true");
}

export function isMockAuthenticated() {
  return sessionStorage.getItem(MOCK_AUTH_SESSION_KEY) === "true"
    || localStorage.getItem(MOCK_AUTH_SESSION_KEY) === "true";
}

export function clearMockAuthentication() {
  sessionStorage.removeItem(MOCK_AUTH_SESSION_KEY);
  localStorage.removeItem(MOCK_AUTH_SESSION_KEY);
}
