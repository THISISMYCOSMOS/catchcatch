import { Seller } from './product-data.schema';

export const FIXED_SELLER_DOMAINS: Readonly<Record<Exclude<Seller, 'BRAND_OFFICIAL'>, string>> = {
  OLIVE_YOUNG: 'oliveyoung.co.kr',
  MUSINSA_BEAUTY: 'musinsa.com',
  COUPANG: 'coupang.com',
};

const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'ref',
  'referrer',
  'tracking',
]);

export function normalizeDomain(value: string): string {
  const withProtocol = value.includes('://') ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'https:') {
    throw new Error('Seller domain must use HTTPS');
  }
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

export function normalizeSellerPageUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('Seller page URL must use HTTPS');
  }
  url.hash = '';
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith('utm_') || TRACKING_QUERY_KEYS.has(normalizedKey)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

export function assertAllowedSellerUrl(
  value: string,
  allowedDomains: readonly string[],
): void {
  const hostname = hostnameOf(value);
  const isAllowed = allowedDomains.some((rawDomain) => {
    const domain = normalizeDomain(rawDomain);
    return hostname === domain || hostname.endsWith(`.${domain}`);
  });
  if (!isAllowed) {
    throw new Error('URL is outside registered seller domains');
  }
}

export function assertSellerMatchesUrl(
  seller: Seller,
  value: string,
  brandOfficialDomain: string | null,
): void {
  const expectedDomain = seller === 'BRAND_OFFICIAL'
    ? brandOfficialDomain && normalizeDomain(brandOfficialDomain)
    : FIXED_SELLER_DOMAINS[seller];
  if (!expectedDomain) {
    throw new Error('Brand official domain is not registered');
  }
  assertAllowedSellerUrl(value, [expectedDomain]);
}

export function inferBrandOfficialDomain(
  allowedDomains: readonly string[],
): string | null {
  const fixedDomains = new Set(Object.values(FIXED_SELLER_DOMAINS));
  const candidates = [...new Set(
    allowedDomains
      .map(normalizeDomain)
      .filter((domain) => !fixedDomains.has(domain)),
  )];
  return candidates.length === 1 ? candidates[0] : null;
}

export function parseBrandOfficialDomainRegistry(
  rawValue: string | undefined,
): ReadonlyMap<string, string> {
  if (!rawValue?.trim()) {
    return new Map();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error('BRAND_OFFICIAL_DOMAINS_JSON must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('BRAND_OFFICIAL_DOMAINS_JSON must be an object');
  }
  const registry = new Map<string, string>();
  for (const [brandId, rawDomain] of Object.entries(parsed)) {
    if (!brandId.trim() || typeof rawDomain !== 'string') {
      throw new Error('Brand official domain registry contains an invalid entry');
    }
    registry.set(brandId, normalizeDomain(rawDomain));
  }
  return registry;
}

function hostnameOf(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('Seller page URL must use HTTPS');
  }
  return url.hostname.toLowerCase().replace(/^www\./, '');
}
