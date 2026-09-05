"use client";

import { apiRequest } from "@/lib/api/client";

export type ProductPreview = {
  sourceUrl: string;
  productName: string;
  brand: string | null;
  seller: string | null;
  listedPrice: number | null;
  imageUrl: string | null;
  analysisCategory: "COSMETIC" | "NON_COSMETIC" | "UNKNOWN";
  analysisEligible: boolean;
};

export async function previewProduct(sourceUrl: string): Promise<ProductPreview> {
  return apiRequest<ProductPreview>("/api/v1/products/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceUrl }),
  });
}
