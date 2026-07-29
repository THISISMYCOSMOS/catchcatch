export const DATA_MODE = "frontend_mock" as const;

const DEMO_ACCOUNT = {
  username: "catchcatch",
  password: "catch1234",
} as const;

const MOCK_ACCOUNTS_STORAGE_KEY = "catchcatch:mock-accounts";

type StoredMockAccount = {
  username: string;
  password: string;
  email?: string;
};

function readMockAccounts(): StoredMockAccount[] {
  try {
    const storedAccounts = localStorage.getItem(MOCK_ACCOUNTS_STORAGE_KEY);
    if (!storedAccounts) return [];
    const parsedAccounts: unknown = JSON.parse(storedAccounts);
    return Array.isArray(parsedAccounts)
      ? parsedAccounts.filter((account): account is StoredMockAccount => (
          Boolean(account)
          && typeof account === "object"
          && typeof account.username === "string"
          && typeof account.password === "string"
          && (account.email === undefined || typeof account.email === "string")
        ))
      : [];
  } catch {
    return [];
  }
}

const wait = (milliseconds = 350) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export async function mockLogin(username: string, password: string) {
  await wait();
  const normalizedUsername = username.trim().toLowerCase();
  const account = readMockAccounts().find(
    (storedAccount) => storedAccount.username === normalizedUsername,
  );
  const expectedPassword = account?.password
    ?? (normalizedUsername === DEMO_ACCOUNT.username ? DEMO_ACCOUNT.password : null);
  return expectedPassword === password
    ? { ok: true as const, username: normalizedUsername }
    : { ok: false as const };
}

export async function mockChangePassword(username: string, currentPassword: string, newPassword: string) {
  await wait(420);
  const normalizedUsername = username.trim().toLowerCase();
  const accounts = readMockAccounts();
  const account = accounts.find((storedAccount) => storedAccount.username === normalizedUsername);
  const expectedPassword = account?.password
    ?? (normalizedUsername === DEMO_ACCOUNT.username ? DEMO_ACCOUNT.password : null);

  if (expectedPassword === null) {
    return { ok: false as const, reason: "account_not_found" as const };
  }
  if (expectedPassword !== currentPassword) {
    return { ok: false as const, reason: "invalid_current_password" as const };
  }

  const updatedAccount: StoredMockAccount = {
    ...account,
    username: normalizedUsername,
    password: newPassword,
  };

  try {
    localStorage.setItem(MOCK_ACCOUNTS_STORAGE_KEY, JSON.stringify(account
      ? accounts.map((storedAccount) => storedAccount.username === normalizedUsername ? updatedAccount : storedAccount)
      : [...accounts, updatedAccount]));
    return { ok: true as const };
  } catch {
    return { ok: false as const, reason: "storage_error" as const };
  }
}

export function getMockAccountEmail(username: string) {
  const normalizedUsername = username.trim().toLowerCase();
  return readMockAccounts().find(
    (storedAccount) => storedAccount.username === normalizedUsername,
  )?.email ?? null;
}

export function isMockAccountEmailInUse(email: string, excludedUsername: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedExcludedUsername = excludedUsername.trim().toLowerCase();
  return readMockAccounts().some((storedAccount) => (
    storedAccount.username !== normalizedExcludedUsername
    && storedAccount.email?.toLowerCase() === normalizedEmail
  ));
}

export async function mockSignup(username: string, password: string, email: string) {
  await wait();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = readMockAccounts();
  if (
    normalizedUsername === DEMO_ACCOUNT.username
    || accounts.some((account) => account.username === normalizedUsername)
  ) {
    return { ok: false as const, reason: "duplicate_username" as const };
  }

  localStorage.setItem(MOCK_ACCOUNTS_STORAGE_KEY, JSON.stringify([
    ...accounts,
    { username: normalizedUsername, password, email: normalizedEmail },
  ]));
  return { ok: true as const };
}

export async function mockSavePriorities() {
  await wait();
  return { ok: true as const };
}
