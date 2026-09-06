"use client";

import { apiRequest, AuthUser } from "@/lib/api/client";

type AuthResponse = {
  user: AuthUser;
  expiresAt: number | null;
};

type AccountIdAvailabilityResponse = {
  available: boolean;
};

type SendPhoneOtpResponse = {
  sent: true;
  expiresIn?: number;
  expiresAt?: string | number | null;
};

export type SendPhoneOtpResult = {
  sent: true;
  expiresAtMs: number | null;
};

const MILLISECOND_TIMESTAMP_THRESHOLD = 100_000_000_000;

function normalizeOtpExpiresAtMs(response: unknown, nowMs = Date.now()): number | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const { expiresAt, expiresIn } = response as Partial<SendPhoneOtpResponse>;

  const absoluteExpiresAtMs = normalizeTimestampMs(expiresAt);
  if (absoluteExpiresAtMs !== null) return absoluteExpiresAtMs;

  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn < 0) return null;
  const relativeExpiresAtMs = nowMs + expiresIn * 1000;
  return Number.isFinite(relativeExpiresAtMs) ? Math.trunc(relativeExpiresAtMs) : null;
}

function normalizeTimestampMs(value: unknown): number | null {
  if (typeof value === "string") {
    if (!value.trim()) return null;
    const parsedTimestamp = Date.parse(value);
    return Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const timestampMs = value < MILLISECOND_TIMESTAMP_THRESHOLD ? value * 1000 : value;
  return Number.isFinite(timestampMs) ? Math.trunc(timestampMs) : null;
}

export async function checkAccountIdAvailability(accountId: string): Promise<boolean> {
  const response = await apiRequest<AccountIdAvailabilityResponse>("/api/v1/auth/account-id/check", {
    method: "POST",
    authenticated: false,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId }),
  });

  if (typeof response.available !== "boolean") {
    throw new TypeError("Invalid account ID availability response");
  }
  return response.available;
}

export async function login(accountId: string, password: string): Promise<AuthUser> {
  const response = await apiRequest<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    authenticated: false,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, password }),
  });
  return response.user;
}

export async function sendPhoneOtp(phone: string): Promise<SendPhoneOtpResult> {
  const response = await apiRequest<SendPhoneOtpResponse>("/api/v1/auth/phone/send-otp", {
    method: "POST",
    authenticated: false,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  return {
    sent: true,
    expiresAtMs: normalizeOtpExpiresAtMs(response),
  };
}

export async function verifyPhoneOtp(
  phone: string,
  token: string,
  accountId: string,
  password: string,
): Promise<AuthUser> {
  const response = await apiRequest<AuthResponse>("/api/v1/auth/phone/verify-otp", {
    method: "POST",
    authenticated: false,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, token, accountId, password, acceptTerms: true }),
  });
  return response.user;
}

export async function restoreAuthenticatedUser(): Promise<AuthUser | null> {

  try {
    return await apiRequest<AuthUser>("/api/v1/auth/me");
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await apiRequest<{ success: true }>("/api/v1/auth/logout", { method: "POST" });
}

export async function sendWithdrawalOtp(): Promise<void> {
  await apiRequest<{ sent: true }>("/api/v1/auth/account/reauth/send-otp", {
    method: "POST",
  });
}

export async function withdrawAccount(token: string): Promise<void> {
  await apiRequest<{ success: true }>("/api/v1/auth/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}
