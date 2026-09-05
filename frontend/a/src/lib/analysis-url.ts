export const ANALYSIS_RESULT_PATH = "/analysis/result";

export type ProductUrlValidation =
  | { ok: true; productUrl: string }
  | { ok: false; error: "empty" | "invalid"; message: string };

export function validateProductUrl(inputUrl: string): ProductUrlValidation {
  const trimmedInput = inputUrl.trim();

  if (!trimmedInput) {
    return { ok: false, error: "empty", message: "상품 링크를 입력해 주세요." };
  }

  let foundHttpUrl = false;
  for (const candidate of extractUrlCandidates(trimmedInput)) {
    try {
      const parsedUrl = new URL(candidate);
      if (parsedUrl.protocol === "http:") {
        foundHttpUrl = true;
        continue;
      }
      if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password || parsedUrl.port) continue;
      return { ok: true, productUrl: parsedUrl.toString() };
    } catch {
      // Shared text can contain malformed URLs. Keep looking for a valid product URL.
    }
  }

  return foundHttpUrl
    ? { ok: false, error: "invalid", message: "HTTPS 상품 링크를 입력해 주세요." }
    : { ok: false, error: "invalid", message: "올바른 상품 링크를 입력해 주세요." };
}

function extractUrlCandidates(input: string): string[] {
  const sharedTextUrls = input.match(
    /https?:\/\/[^\s<>"'`\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u2000-\u206f\u3000-\u303f\uff00-\uffef]+/giu,
  ) ?? [];
  const candidates = sharedTextUrls.length > 0 ? sharedTextUrls : [input];
  return candidates.map(normalizeCandidateUrl);
}

function normalizeCandidateUrl(value: string): string {
  return value
    .replace(/[)\]}>.,!?;:]+$/u, "");
}
