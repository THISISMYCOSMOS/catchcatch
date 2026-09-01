"use client";

import { apiRequest, ApiError, AuthUser } from "@/lib/api/client";

export type UserPreferences = {
  userId: string;
  selectedCriteria: string[];
  memberships: Array<{ provider: string; membershipType: string; enabled: boolean }>;
  shoppingGrades: Array<{ provider: string; grade: string }>;
  cards: Array<{ issuer: string; cardProductCode: string }>;
};

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  try {
    return await apiRequest<UserPreferences>(`/api/v1/user-preferences/${encodeURIComponent(userId)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function saveUserPreferences(
  userId: string,
  selectedCriteria: readonly string[],
  benefits?: Pick<UserPreferences, "memberships" | "shoppingGrades" | "cards">,
): Promise<UserPreferences> {
  return apiRequest<UserPreferences>(`/api/v1/user-preferences/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ selectedCriteria, ...benefits }),
  });
}

export async function authenticatedRoute(user: AuthUser): Promise<"/priorities" | "/home"> {
  return await getUserPreferences(user.id) ? "/home" : "/priorities";
}
