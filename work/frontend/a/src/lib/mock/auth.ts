export const DATA_MODE = "frontend_mock" as const;

const DEMO_ACCOUNT = {
  username: "catchcatch",
  password: "catch1234",
} as const;

const MOCK_ACCOUNTS_STORAGE_KEY = "catchcatch:mock-accounts";

type StoredMockAccount = {
  username: string;
  password: string;
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
  if (normalizedUsername === DEMO_ACCOUNT.username && password === DEMO_ACCOUNT.password) {
    return { ok: true as const, username: DEMO_ACCOUNT.username };
  }

  const account = readMockAccounts().find(
    (storedAccount) => storedAccount.username === normalizedUsername,
  );
  return account?.password === password
    ? { ok: true as const, username: account.username }
    : { ok: false as const };
}

export async function mockSignup(username: string, password: string) {
  await wait();
  const normalizedUsername = username.trim().toLowerCase();
  const accounts = readMockAccounts();
  if (
    normalizedUsername === DEMO_ACCOUNT.username
    || accounts.some((account) => account.username === normalizedUsername)
  ) {
    return { ok: false as const, reason: "duplicate_username" as const };
  }

  localStorage.setItem(MOCK_ACCOUNTS_STORAGE_KEY, JSON.stringify([
    ...accounts,
    { username: normalizedUsername, password },
  ]));
  return { ok: true as const };
}

export async function mockSavePriorities() {
  await wait();
  return { ok: true as const };
}
