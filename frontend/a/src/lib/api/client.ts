"use client";

const CORE_BASE_URL = (process.env.NEXT_PUBLIC_CORE_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
const LEGACY_SESSION_KEY = "catchcatch:auth-session";

export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { authenticated?: boolean; retryAuth?: boolean } = {},
): Promise<T> {
  clearLegacySession();
  const { authenticated = true, retryAuth = true, headers: inputHeaders, ...requestOptions } = options;
  const headers = new Headers(inputHeaders);
  headers.set("accept", "application/json");

  const response = await fetch(`${CORE_BASE_URL}${path}`, {
    ...requestOptions,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && authenticated && retryAuth && await refreshHttpOnlySession()) {
    return apiRequest<T>(path, { ...options, retryAuth: false });
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    throw new ApiError(
      response.status,
      typeof record.code === "string" ? record.code : "REQUEST_FAILED",
      typeof record.message === "string" ? record.message : "요청을 처리하지 못했습니다.",
      payload,
    );
  }
  return payload as T;
}

export async function refreshHttpOnlySession(): Promise<boolean> {
  clearLegacySession();
  try {
    const response = await fetch(`${CORE_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      credentials: "include",
      body: "{}",
    });
    const payload = await readPayload(response);
    return response.ok && isAuthPayload(payload);
  } catch {
    return false;
  }
}

function clearLegacySession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
  window.localStorage.removeItem(LEGACY_SESSION_KEY);
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAuthPayload(value: unknown): value is { user: AuthUser } {
  return isRecord(value) && isRecord(value.user) && typeof value.user.id === "string";
}
