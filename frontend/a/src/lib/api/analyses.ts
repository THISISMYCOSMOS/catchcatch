"use client";

import { apiRequest, ApiError } from "@/lib/api/client";

export type AnalysisFailureStatus =
  | "NEEDS_MORE_DATA"
  | "INVALID_LINK"
  | "PRODUCT_MISMATCH"
  | "AI_JUDGMENT_FAILED"
  | "INTERNAL_ERROR";

export type AnalysisOffer = {
  id: string;
  sellerOfferId: string | null;
  sellerIdentifier: string;
  sellerName: string;
  originalListPrice: number | null;
  salePrice: number | null;
  marketEffectivePrice: number | null;
  userEffectivePrice: number | null;
  shippingFee: number | null;
  quantity: number | null;
  totalAmount: number | null;
  unit: string | null;
  calculatedUnitPrice: number | null;
  offerSnapshot: unknown;
  createdAt: string;
};

export type AnalysisRecord = {
  id: string;
  sourceUrl?: string;
  status: string;
  verdict?: string | null;
  productId: string | null;
  selectedCriteria: string[];
  warningCodes: string[];
  result: unknown;
  createdAt?: string;
  product?: {
    id: string;
    canonicalName: string;
    brand: string | null;
    productKey: string;
    packageType: string | null;
    imageUrl: string | null;
  } | null;
  analysisOffers?: AnalysisOffer[];
};

export type RecentAnalysisItem = {
  id: string;
  productName: string;
  sellerName: string;
  analyzedAt: string;
  analyzedAtIso: string;
  price: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
};

type CreateAnalysisResponse = {
  analysisId: string;
  status: "COMPLETED";
  analysis: AnalysisRecord;
  judgment: unknown;
};

export async function createAnalysis(sourceUrl: string): Promise<CreateAnalysisResponse> {
  return apiRequest<CreateAnalysisResponse>("/api/v1/analyses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceUrl, idempotencyKey: crypto.randomUUID() }),
  });
}

export async function getAnalysis(analysisId: string): Promise<AnalysisRecord> {
  return apiRequest<AnalysisRecord>(`/api/v1/analyses/${encodeURIComponent(analysisId)}`);
}

export async function getRecentAnalyses(limit = 20): Promise<AnalysisRecord[]> {
  return apiRequest<AnalysisRecord[]>(`/api/v1/analyses/recent?limit=${limit}`);
}

export function toRecentAnalysisItem(record: AnalysisRecord): RecentAnalysisItem {
  const offers = [...(record.analysisOffers ?? [])].sort((left, right) => (
    (offerEffectivePrice(left) ?? Number.MAX_SAFE_INTEGER) - (offerEffectivePrice(right) ?? Number.MAX_SAFE_INTEGER)
  ));
  const bestOffer = offers[0] ?? null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : null;
  const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;
  return {
    id: record.id,
    productName: record.product?.canonicalName ?? "상품명 확인 필요",
    sellerName: bestOffer?.sellerName ?? "판매처 확인 필요",
    analyzedAt: validCreatedAt
      ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(validCreatedAt).replaceAll(". ", ".").replace(/\.$/, "")
      : "날짜 확인 필요",
    analyzedAtIso: validCreatedAt ? validCreatedAt.toISOString().slice(0, 10) : "",
    price: bestOffer ? offerEffectivePrice(bestOffer) : null,
    imageUrl: record.product?.imageUrl ?? null,
    sourceUrl: record.sourceUrl ?? null,
  };
}

export async function deleteAnalysis(analysisId: string): Promise<void> {
  await apiRequest<null>(`/api/v1/analyses/${encodeURIComponent(analysisId)}`, { method: "DELETE" });
}

export function toAnalysisFailureStatus(error: unknown): AnalysisFailureStatus {
  if (!(error instanceof ApiError)) return "INTERNAL_ERROR";
  if (error.status === 400 || error.status === 415) return "INVALID_LINK";
  if (error.code.includes("IDENTIFICATION") || error.code.includes("AMBIGUOUS")) return "PRODUCT_MISMATCH";
  if (error.code.includes("JUDGMENT")) return "AI_JUDGMENT_FAILED";
  if (error.status === 422) return "NEEDS_MORE_DATA";
  return "INTERNAL_ERROR";
}

function offerEffectivePrice(offer: AnalysisOffer): number | null {
  return offer.userEffectivePrice ?? offer.marketEffectivePrice ?? offer.salePrice ?? offer.originalListPrice;
}
