"use client";

import { apiRequest, AuthUser } from "@/lib/api/client";

type AuthResponse = {
  user: AuthUser;
  expiresAt: number | null;
};

export type PhoneAuthPurpose = "login" | "signup";

export async function sendPhoneOtp(phone: string, purpose: PhoneAuthPurpose): Promise<void> {
  await apiRequest<{ sent: true }>("/api/v1/auth/phone/send-otp", {
    method: "POST",
    authenticated: false,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, purpose }),
  });
}

export async function verifyPhoneOtp(
  phone: string,
  token: string,
  acceptTerms: boolean,
): Promise<AuthUser> {
  const response = await apiRequest<AuthResponse>("/api/v1/auth/phone/verify-otp", {
    method: "POST",
    authenticated: false,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, token, acceptTerms }),
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
