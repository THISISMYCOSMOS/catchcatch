export const DEFAULT_COUPANG_PRODUCT_URL = "https://www.coupang.com";
export const ANALYSIS_RESULT_PATH = "/analysis/result";

export type ProductUrlValidation =
  | { ok: true; productUrl: string; platform: "쿠팡" }
  | { ok: false; error: "empty" | "invalid" | "unsupported"; message: string };

export function validateCoupangProductUrl(inputUrl: string): ProductUrlValidation {
  const normalizedUrl = inputUrl.trim().replace(/\/+$/, "");

  if (!normalizedUrl) {
    return { ok: false, error: "empty", message: "상품 링크를 입력해 주세요." };
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return { ok: false, error: "invalid", message: "올바른 상품 링크를 입력해 주세요." };
    }

    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
    const isCoupang = hostname === "coupang.com" || hostname.endsWith(".coupang.com");

    if (!isCoupang) {
      return { ok: false, error: "unsupported", message: "현재는 쿠팡 상품 링크를 분석할 수 있어요." };
    }

    return { ok: true, productUrl: normalizedUrl, platform: "쿠팡" };
  } catch {
    return { ok: false, error: "invalid", message: "올바른 상품 링크를 입력해 주세요." };
  }
}

