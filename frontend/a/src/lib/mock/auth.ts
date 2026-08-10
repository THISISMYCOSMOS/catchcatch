export const DATA_MODE = "frontend_mock" as const;

const DEMO_ACCOUNT = {
  accountId: "catchcatch",
  email: "catchcatch@test.test",
  password: "catch1234",
} as const;

const MOCK_ACCOUNTS_STORAGE_KEY = "catchcatch:mock-accounts";

type StoredMockAccount = {
  accountId: string;
  password: string;
  email: string | null;
};

function readMockAccounts(): StoredMockAccount[] {
  try {
    const storedAccounts = localStorage.getItem(MOCK_ACCOUNTS_STORAGE_KEY);
    if (!storedAccounts) return [];
    const parsedAccounts: unknown = JSON.parse(storedAccounts);
    if (!Array.isArray(parsedAccounts)) return [];

    return parsedAccounts.flatMap((account): StoredMockAccount[] => {
      if (!account || typeof account !== "object") return [];
      const storedAccount = account as Record<string, unknown>;
      const accountId = typeof storedAccount.accountId === "string"
        ? storedAccount.accountId
        : typeof storedAccount.username === "string"
          ? storedAccount.username
          : null;
      if (!accountId || typeof storedAccount.password !== "string") return [];
      return [{
        accountId: accountId.trim().toLowerCase(),
        password: storedAccount.password,
        email: typeof storedAccount.email === "string" ? storedAccount.email.trim().toLowerCase() : null,
      }];
    });
  } catch {
    return [];
  }
}

const wait = (milliseconds = 350) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export async function mockLogin(email: string, password: string) {
  await wait();
  const normalizedEmail = email.trim().toLowerCase();
  const account = readMockAccounts().find(
    (storedAccount) => storedAccount.email === normalizedEmail,
  );
  const expectedPassword = account?.password
    ?? (normalizedEmail === DEMO_ACCOUNT.email ? DEMO_ACCOUNT.password : null);
  const accountId = account?.accountId
    ?? (normalizedEmail === DEMO_ACCOUNT.email ? DEMO_ACCOUNT.accountId : null);
  return expectedPassword === password
    ? { ok: true as const, accountId: accountId! }
    : { ok: false as const };
}

export async function mockChangePassword(accountId: string, currentPassword: string, newPassword: string) {
  await wait(420);
  const normalizedAccountId = accountId.trim().toLowerCase();
  const accounts = readMockAccounts();
  const account = accounts.find((storedAccount) => storedAccount.accountId === normalizedAccountId);
  const expectedPassword = account?.password
    ?? (normalizedAccountId === DEMO_ACCOUNT.accountId ? DEMO_ACCOUNT.password : null);

  if (expectedPassword === null) {
    return { ok: false as const, reason: "account_not_found" as const };
  }
  if (expectedPassword !== currentPassword) {
    return { ok: false as const, reason: "invalid_current_password" as const };
  }

  const updatedAccount: StoredMockAccount = {
    ...account,
    accountId: normalizedAccountId,
    email: account?.email ?? (normalizedAccountId === DEMO_ACCOUNT.accountId ? DEMO_ACCOUNT.email : null),
    password: newPassword,
  };

  try {
    localStorage.setItem(MOCK_ACCOUNTS_STORAGE_KEY, JSON.stringify(account
      ? accounts.map((storedAccount) => storedAccount.accountId === normalizedAccountId ? updatedAccount : storedAccount)
      : [...accounts, updatedAccount]));
    return { ok: true as const };
  } catch {
    return { ok: false as const, reason: "storage_error" as const };
  }
}

export function getMockAccountEmail(accountId: string) {
  const normalizedAccountId = accountId.trim().toLowerCase();
  return readMockAccounts().find(
    (storedAccount) => storedAccount.accountId === normalizedAccountId,
  )?.email ?? (normalizedAccountId === DEMO_ACCOUNT.accountId ? DEMO_ACCOUNT.email : null);
}

export function isMockAccountEmailInUse(email: string, excludedAccountId: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedExcludedAccountId = excludedAccountId.trim().toLowerCase();
  return (
    normalizedEmail === DEMO_ACCOUNT.email && normalizedExcludedAccountId !== DEMO_ACCOUNT.accountId
  ) || readMockAccounts().some((storedAccount) => (
    storedAccount.accountId !== normalizedExcludedAccountId
    && storedAccount.email?.toLowerCase() === normalizedEmail
  ));
}

export async function mockSignup(email: string, password: string) {
  await wait();
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = readMockAccounts();
  if (
    normalizedEmail === DEMO_ACCOUNT.email
    || accounts.some((account) => account.email === normalizedEmail)
  ) {
    return { ok: false as const, reason: "duplicate_email" as const };
  }

  const accountId = window.crypto.randomUUID();
  localStorage.setItem(MOCK_ACCOUNTS_STORAGE_KEY, JSON.stringify([
    ...accounts,
    { accountId, password, email: normalizedEmail },
  ]));
  return { ok: true as const, accountId };
}

export async function mockSavePriorities() {
  await wait();
  return { ok: true as const };
}
