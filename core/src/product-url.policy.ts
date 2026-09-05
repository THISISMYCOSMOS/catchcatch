import { CoreError } from './errors.js';
import { isIP } from 'node:net';

/**
 * Returns the one public hostname that may be used to identify the submitted
 * product page. Cross-seller search has its own registered-seller allowlist;
 * accepting a source page must not make that host a comparison target.
 */
export function resolveProductSourceDomain(rawUrl: string): string[] {
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
  if (!isPublicHostname(hostname)) {
    throw new CoreError(400, 'INVALID_PRODUCT_URL', '공개 HTTPS 상품 링크만 사용할 수 있습니다.');
  }
  return [hostname];
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function isPublicHostname(hostname: string): boolean {
  if (isIP(hostname) !== 0) return false;
  if (!hostname.includes('.')) return false;
  return !(
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.example') ||
    hostname.endsWith('.invalid')
  );
}
