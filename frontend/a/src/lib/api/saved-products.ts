"use client";

import { apiRequest } from "@/lib/api/client";

export type SavedProductCard = {
  productId: string;
  canonicalName: string;
  brand: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  previousPrice: number | null;
  discountRate: number | null;
  sellerName: string | null;
  isPriceAlertEnabled: boolean;
  savedAt: string;
};

export async function getSavedProducts(): Promise<SavedProductCard[]> {
  return apiRequest<SavedProductCard[]>("/api/v1/saved-products/me/cards");
}

export async function saveProduct(productId: string): Promise<void> {
  await apiRequest("/api/v1/saved-products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId }),
  });
}

export async function removeSavedProduct(userId: string, productId: string): Promise<void> {
  await apiRequest(`/api/v1/saved-products/${encodeURIComponent(userId)}/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
}
