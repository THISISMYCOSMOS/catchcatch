"use client";

import { apiRequest } from "@/lib/api/client";

export type AnalysisUsageViewModel = {
  limit: number;
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

export async function getAnalysisUsage(): Promise<AnalysisUsageViewModel> {
  const response = await apiRequest<SearchQuotaResponse>("/api/v1/search-quota/me");
  return {
    limit: response.limit,
    usedCount: response.used,
    remainingCount: response.remaining,
    limitReached: response.remaining <= 0,
    resetsAt: response.resetsAt,
  };
}
