import { CoreError } from './errors.js';

export function resolveAllowedProductDomains(
  rawUrl: string,
  configuredDomains: readonly string[],
): string[] {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CoreError(400, 'INVALID_PRODUCT_URL', '상품 URL 형식이 올바르지 않습니다.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.port !== '' && url.port !== '443')
  ) {
    throw new CoreError(400, 'INVALID_PRODUCT_URL', 'HTTPS 상품 URL만 사용할 수 있습니다.');
  }

  const hostname = normalizeHostname(url.hostname);
  const matchedDomain = configuredDomains
    .map(normalizeHostname)
    .find((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (!matchedDomain) {
    throw new CoreError(422, 'UNSUPPORTED_PRODUCT_DOMAIN', '지원하지 않는 판매처입니다.');
  }
  return [matchedDomain];
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '');
}
