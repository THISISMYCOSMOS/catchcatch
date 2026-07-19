export const DATA_MODE = "frontend_mock" as const;

const DEMO_ACCOUNT = {
  username: "catchcatch",
  password: "catch2026",
} as const;

const wait = (milliseconds = 350) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export async function mockLogin(username: string, password: string) {
  await wait();
  return username === DEMO_ACCOUNT.username && password === DEMO_ACCOUNT.password;
}

export async function mockSignup() {
  await wait();
  return { ok: true as const };
}

export async function mockSavePriorities() {
  await wait();
  return { ok: true as const };
}
