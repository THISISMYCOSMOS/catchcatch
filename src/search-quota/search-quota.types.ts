export const SEARCH_LIMIT = 10;
export const SEARCH_QUOTA_EXCEEDED_CODE = 'SEARCH_QUOTA_EXCEEDED';

export type SearchQuotaResponse = {
  limit: number;
  used: number;
  remaining: number;
  windowStartedAt: string | null;
  resetsAt: string | null;
};
