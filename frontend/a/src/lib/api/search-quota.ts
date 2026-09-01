"use client";

import { apiRequest } from "@/lib/api/client";

export type WeeklyAnalysisUsageViewModel = {
  weeklyLimit: number;
  usedCount: number;
  remainingCount: number;
  limitReached: boolean;
  resetsAt: string | null;
};

type SearchQuotaResponse = {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string | null;
};

export async function getWeeklyAnalysisUsage(): Promise<WeeklyAnalysisUsageViewModel> {
  const response = await apiRequest<SearchQuotaResponse>("/api/v1/search-quota/me");
  return {
    weeklyLimit: response.limit,
    usedCount: response.used,
    remainingCount: response.remaining,
    limitReached: response.remaining <= 0,
    resetsAt: response.resetsAt,
  };
}
