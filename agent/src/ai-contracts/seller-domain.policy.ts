import { Seller } from './product-data.schema';

export const FIXED_SELLER_DOMAINS: Readonly<Record<Exclude<Seller, 'BRAND_OFFICIAL'>, string>> = {
  OLIVE_YOUNG: 'oliveyoung.co.kr',
  MUSINSA_BEAUTY: 'musinsa.com',
  COUPANG: 'coupang.com',
};

// Hosts that carry many different brands' storefronts under one domain
// (marketplaces, department-store platforms, open-mall builders). A
// model-proposed "brand official store" candidate landing on one of these is
// tenancy, not a brand's own site, and must never be promoted to
// BRAND_OFFICIAL. Kept as a single named, exported list (not inline in the
// gate function) so it is one place to extend as new platforms come up.
//
// This list is maintained by hand and is therefore never complete: a host
// nobody has added yet is still promotable. It bounds a known class of bad
// candidate; it does not prove a surviving candidate is good.
export const BRAND_OFFICIAL_DOMAIN_BLOCKLIST: readonly string[] = [
  // Open marketplaces and price aggregators
  'smartstore.naver.com',
  'brand.naver.com',
  'shopping.naver.com',
  '11st.co.kr',
  'gmarket.co.kr',
  'auction.co.kr',
  'interpark.com',
  'qoo10.com',
  'aliexpress.com',
  'amazon.com',
  // Department-store and home-shopping platforms
  'ssg.com',
  'lotteon.com',
  'lotteimall.com',
  'gsshop.com',
  'cjonstyle.com',
  'hmall.com',
  'tmon.co.kr',
  'wemakeprice.com',
  // Storefront builders' default hosts. A brand that really does run its
  // own store on one of these normally serves it from its own domain, so
  // rejecting the builder's shared host costs an occasional real store and
  // fails closed (BRAND_OFFICIAL stays UNKNOWN) rather than trusting a host
  // any tenant can obtain.
  'cafe24.com',
  'myshopify.com',
  'imweb.me',
  'sixshop.com',
  'wixsite.com',
];

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

export type BrandOfficialDomainGateResult =
  | { accepted: true; domain: string; warning: string | null }
  | { accepted: false; reason: string };

// Rule-based promotion gate for a brand-official domain the model proposes
// from the identified brand name (see product-search's brand-official
// discovery step). The model can propose; only this function decides
// whether the proposal is ever treated as a trustworthy BRAND_OFFICIAL
// search domain. It never confirms the domain actually belongs to the
// brand or is reachable — it only rejects the classes of candidate that are
// definitely wrong (tenancy platforms, one of our own fixed sellers,
// malformed input).
export function gateBrandOfficialDomainCandidate(
  rawCandidate: string,
): BrandOfficialDomainGateResult {
  let domain: string;
  try {
    domain = normalizeDomain(rawCandidate);
  } catch {
    return { accepted: false, reason: 'Candidate is not a valid HTTPS hostname' };
  }
  // normalizeDomain runs the candidate through URL, which encodes any
  // non-ASCII hostname as punycode. So this one check catches both a raw
  // unicode candidate and an already-encoded "xn--" one. Such a domain can
  // render as a visually identical copy of a brand's real domain, which is
  // exactly the homograph case this gate cannot otherwise see: nothing else
  // here compares the candidate against the brand at all. Korean cosmetics
  // brands do not sell from IDN hosts, so rejecting the whole class costs
  // nothing real and fails closed.
  if (domain.includes('xn--')) {
    return {
      accepted: false,
      reason: `${domain} is an internationalized (punycode) domain; too easy to pass off as a brand's real domain`,
    };
  }
  const isBlockedTenancyHost = BRAND_OFFICIAL_DOMAIN_BLOCKLIST.some((rawBlocked) => {
    const blocked = normalizeDomain(rawBlocked);
    return domain === blocked || domain.endsWith(`.${blocked}`);
  });
  if (isBlockedTenancyHost) {
    return {
      accepted: false,
      reason: `${domain} is a marketplace/department-store host, not a brand's own site`,
    };
  }
  const isFixedSellerDomain = Object.values(FIXED_SELLER_DOMAINS).some(
    (fixed) => domain === fixed || domain.endsWith(`.${fixed}`),
  );
  if (isFixedSellerDomain) {
    return {
      accepted: false,
      reason: `${domain} is already one of the three fixed registered seller domains`,
    };
  }
  return { accepted: true, domain, warning: foreignStorefrontWarning(domain) };
}

// A non-.kr TLD is not rejected outright (plenty of Korean brands run their
// official store on a .com), but it is a real, cheap signal worth a warning:
// it is the one property that correlates with "this may not be the Korean
// storefront we mean" without also flagging the many legitimate .com brand
// sites, so it is used as a soft, non-blocking flag rather than a filter.
// Flags a candidate domain that carries no trace of the brand's own name.
// This catches a model proposing an unrelated or invented domain; it does
// NOT catch typosquatting, because a squatted domain normally embeds the
// brand name (`innisfree-kr.com` contains "innisfree" and passes). Telling
// those apart needs a source of truth about the brand's real domain, which
// this service does not have, so this is a warning rather than a rejection.
//
// Korean-only brand names have no latin tokens to compare against a latin
// domain, so they are treated as non-discriminating and skipped — the same
// choice T7 made for a null anchor product_type. Counting our own inability
// to compare as evidence against the candidate would only produce noise.
export function brandNameMismatchWarning(
  brand: string,
  domain: string,
): string | null {
  const tokens = brand
    .normalize('NFKC')
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
  if (tokens.length === 0) {
    return null;
  }
  const compactDomain = domain.replace(/[^a-z0-9]/g, '');
  const joinedBrand = tokens.join('');
  const isRelated = compactDomain.includes(joinedBrand)
    || tokens.some((token) => token.length >= 3 && compactDomain.includes(token));
  return isRelated
    ? null
    : `Brand-official candidate domain ${domain} contains no part of the brand name "${brand}"`;
}

export function foreignStorefrontWarning(domain: string): string | null {
  return domain.endsWith('.kr')
    ? null
    : `Brand-official candidate domain ${domain} does not end in .kr; treat as a possible foreign storefront`;
}

function hostnameOf(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('Seller page URL must use HTTPS');
  }
  return url.hostname.toLowerCase().replace(/^www\./, '');
}
