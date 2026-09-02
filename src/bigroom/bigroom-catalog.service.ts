import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Insert, Row, Update } from '../database/database.types';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../database/supabase.client';

const BIGROOM_ORIGIN = 'https://bgroom.co.kr';

export type BigroomAnchorProduct = {
  brand: string | null;
  normalized_product_name: string | null;
  components: Array<{
    type: string;
    name: string | null;
    capacity_value: number | null;
    capacity_unit: 'ML' | 'G' | null;
    quantity: number | null;
  }>;
};

export type BigroomVerifiedOffer = {
  seller: 'BIGROOM';
  productName: string;
  productUrl: string;
  listedPrice: number | null;
  listedSalePrice: number;
  publicCouponAmount: number | null;
  shippingFee: number | null;
  components: BigroomAnchorProduct['components'];
  appBenefitAdvertised: boolean;
  observedAt: string;
};

@Injectable()
export class BigroomCatalogService {
  private readonly logger = new Logger(BigroomCatalogService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
    private readonly config: ConfigService,
  ) {}

  async findVerifiedOffers(anchor: BigroomAnchorProduct): Promise<BigroomVerifiedOffer[]> {
    if (!anchor.normalized_product_name) return [];
    await this.ensureManifestIndex();
    let candidates = await this.findIndexedCandidates(anchor);
    if (candidates.length === 0) {
      const discovered = await this.discoverFromInternalSearch(anchor);
      if (discovered.length > 0) {
        await this.upsertManifestRows(discovered);
        candidates = await this.findIndexedCandidates(anchor);
      }
    }

    const maximum = boundedInteger(
      this.config.get<string>('BIGROOM_DETAIL_CANDIDATE_LIMIT'),
      5,
      1,
      10,
    );
    const results = await Promise.allSettled(
      selectBigroomVerificationCandidates(candidates, maximum)
        .map((candidate) => this.verifyCandidate(anchor, candidate)),
    );
    return results.flatMap((result) => (
      result.status === 'fulfilled' && result.value ? [result.value] : []
    ));
  }

  async syncManifest(): Promise<{ indexed: number }> {
    const response = await this.fetchPage(`${BIGROOM_ORIGIN}/sitemap.xml`, 'catalog-sync');
    const rows = extractBigroomSitemapRows(response);
    await this.upsertManifestRows(rows);
    return { indexed: rows.length };
  }

  private async ensureManifestIndex(): Promise<void> {
    const { data, error } = await this.client
      .from('bigroom_catalog_items')
      .select('last_seen_at')
      .eq('sitemap_indexed', true)
      .order('last_seen_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`Bigroom catalog freshness check failed: ${error.message}`);
    const newest = data?.[0]?.last_seen_at ? Date.parse(data[0].last_seen_at) : 0;
    const ttlHours = boundedInteger(
      this.config.get<string>('BIGROOM_MANIFEST_TTL_HOURS'),
      24,
      1,
      168,
    );
    if (newest === 0 || Date.now() - newest >= ttlHours * 60 * 60 * 1000) {
      await this.syncManifest();
    }
  }

  private async findIndexedCandidates(anchor: BigroomAnchorProduct): Promise<Row<'bigroom_catalog_items'>[]> {
    const needle = normalizeSearchText(anchor.normalized_product_name ?? '');
    if (!needle) return [];
    const { data, error } = await this.client
      .from('bigroom_catalog_items')
      .select('*')
      .like('search_text', `%${escapeLikePattern(needle)}%`)
      .order('external_product_id', { ascending: false })
      .limit(20);
    if (error) throw new Error(`Bigroom catalog lookup failed: ${error.message}`);
    const brand = normalizeSearchText(anchor.brand ?? '');
    return (data ?? [])
      .filter((row) => !brand || row.search_text.includes(brand))
      .sort((left, right) => candidatePriority(anchor, left) - candidatePriority(anchor, right));
  }

  private async discoverFromInternalSearch(anchor: BigroomAnchorProduct) {
    const queries = [
      [anchor.brand, anchor.normalized_product_name].filter(Boolean).join(' '),
      anchor.normalized_product_name ?? '',
    ].filter((query, index, values) => query && values.indexOf(query) === index);
    const rows = [] as ReturnType<typeof extractBigroomSearchRows>;
    for (const query of queries) {
      const html = await this.fetchPage(
        `${BIGROOM_ORIGIN}/product/search.html?keyword=${encodeURIComponent(query)}`,
        'seller-search-adapter',
      );
      for (const row of extractBigroomSearchRows(html)) {
        if (!rows.some((existing) => existing.external_product_id === row.external_product_id)) {
          rows.push(row);
        }
      }
      if (rows.length > 0) break;
    }
    return rows;
  }

  private async verifyCandidate(
    anchor: BigroomAnchorProduct,
    candidate: Row<'bigroom_catalog_items'>,
  ): Promise<BigroomVerifiedOffer | null> {
    try {
      const facts = extractBigroomSellerPageFacts(
        await this.fetchPage(candidate.product_url, 'seller-page-verifier'),
      );
      const observedAt = new Date().toISOString();
      const components = parseBigroomTitleComponents(
        facts.productName ?? candidate.product_slug,
        anchor,
      );
      const offerKind = facts.productName && isMixedBigroomSet(facts.productName)
        ? 'MIXED_SET'
        : components.length === 1 && (components[0].quantity ?? 1) > 1
          ? 'SAME_PRODUCT_MULTI'
          : components.length === 1 ? 'SINGLE' : 'UNKNOWN';
      await this.updateDetail(candidate.id, facts, components[0] ?? null, offerKind, observedAt);
      if (
        facts.available !== true ||
        !facts.productName ||
        facts.listedSalePrice === null ||
        offerKind === 'MIXED_SET' ||
        components.length !== 1
      ) {
        return null;
      }
      return {
        seller: 'BIGROOM',
        productName: facts.productName,
        productUrl: candidate.product_url,
        listedPrice: facts.listPrice,
        listedSalePrice: facts.listedSalePrice,
        publicCouponAmount: facts.publicCouponAmount,
        shippingFee: facts.shippingFee,
        components,
        appBenefitAdvertised: facts.appBenefitAdvertised,
        observedAt,
      };
    } catch (error) {
      this.logger.warn(`Bigroom detail verification failed for ${candidate.external_product_id}: ${safeError(error)}`);
      return null;
    }
  }

  private async fetchPage(url: string, purpose: string): Promise<string> {
    const timeoutMs = boundedInteger(
      this.config.get<string>('BIGROOM_HTTP_TIMEOUT_MS'),
      5000,
      1000,
      15000,
    );
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': `CatchCatch/1.0 ${purpose}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > 2_000_000) throw new Error('response exceeded 2 MB');
    return response.text();
  }

  private async upsertManifestRows(rows: Insert<'bigroom_catalog_items'>[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client
      .from('bigroom_catalog_items')
      .upsert(rows, { onConflict: 'external_product_id', ignoreDuplicates: false });
    if (error) throw new Error(`Bigroom catalog upsert failed: ${error.message}`);
  }

  private async updateDetail(
    id: string,
    facts: BigroomSellerPageFacts,
    component: BigroomAnchorProduct['components'][number] | null,
    offerKind: Row<'bigroom_catalog_items'>['offer_kind'],
    observedAt: string,
  ): Promise<void> {
    const update: Update<'bigroom_catalog_items'> = {
      product_name: facts.productName,
      listed_price: facts.listPrice,
      listed_sale_price: facts.listedSalePrice,
      public_coupon_amount: facts.publicCouponAmount,
      shipping_fee: facts.shippingFee,
      capacity_value: component?.capacity_value ?? null,
      capacity_unit: component?.capacity_unit ?? null,
      quantity: component?.quantity ?? null,
      offer_kind: offerKind,
      app_benefit_advertised: facts.appBenefitAdvertised,
      availability_status: facts.available === true
        ? 'AVAILABLE'
        : facts.available === false ? 'NOT_AVAILABLE' : 'UNKNOWN',
      detail_verified_at: observedAt,
      updated_at: observedAt,
    };
    const { error } = await this.client.from('bigroom_catalog_items').update(update).eq('id', id);
    if (error) throw new Error(`Bigroom detail cache update failed: ${error.message}`);
  }
}

export type BigroomSellerPageFacts = {
  productName: string | null;
  listedSalePrice: number | null;
  listPrice: number | null;
  publicCouponAmount: number | null;
  shippingFee: number | null;
  available: boolean | null;
  appBenefitAdvertised: boolean;
};

export function extractBigroomSitemapRows(html: string): Insert<'bigroom_catalog_items'>[] {
  const observedAt = new Date().toISOString();
  const rows: Insert<'bigroom_catalog_items'>[] = [];
  for (const block of html.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const loc = decodeXml(block[1].match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] ?? '');
    const parsed = parseBigroomProductUrl(loc);
    if (!parsed) continue;
    const lastModified = block[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim();
    rows.push({
      external_product_id: parsed.productId,
      product_url: parsed.url,
      product_slug: parsed.slug,
      search_text: normalizeSearchText(parsed.slug),
      sitemap_indexed: true,
      sitemap_last_modified_at: lastModified && !Number.isNaN(Date.parse(lastModified)) ? lastModified : null,
      last_seen_at: observedAt,
      updated_at: observedAt,
    });
  }
  return uniqueRows(rows);
}

export function extractBigroomSearchRows(html: string): Insert<'bigroom_catalog_items'>[] {
  const observedAt = new Date().toISOString();
  const rows: Insert<'bigroom_catalog_items'>[] = [];
  for (const match of html.matchAll(/href\s*=\s*(["'])(\/product\/(?!rank_prd_category\.html)[^"'?#]+\/\d+(?:\/[^"'?#]*)?)\1/gi)) {
    const parsed = parseBigroomProductUrl(`${BIGROOM_ORIGIN}${decodeXml(match[2])}`);
    if (!parsed) continue;
    rows.push({
      external_product_id: parsed.productId,
      product_url: parsed.url,
      product_slug: parsed.slug,
      search_text: normalizeSearchText(parsed.slug),
      last_seen_at: observedAt,
      updated_at: observedAt,
    });
  }
  return uniqueRows(rows);
}

export function extractBigroomSellerPageFacts(html: string): BigroomSellerPageFacts {
  const metadata = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = readAttribute(tag, 'property') ?? readAttribute(tag, 'name');
    const content = readAttribute(tag, 'content');
    if (key && content !== null) metadata.set(key.toLowerCase(), decodeXml(content.trim()));
  }
  const rawTitle = metadata.get('og:title') ?? null;
  const salePrice = parseMoney(metadata.get('product:sale_price:amount'))
    ?? parseMoney(metadata.get('product:price:amount'));
  const listPrice = parseMoney(stripTags(findById(html, 'span_product_price_custom')));
  const optimumPrice = parseMoney(stripTags(
    findById(html, 'span_optimum_discount_price_text')
      ?? findById(html, 'span_optimum_discount_price_mobile_text'),
  ));
  const shippingHtml = html.match(/<th[^>]*>\s*(?:<[^>]+>)*\s*배송비[\s\S]{0,500}?<td[^>]*>([\s\S]{0,300}?)<\/td>/i)?.[1] ?? '';
  const shippingText = stripTags(shippingHtml);
  const conditionalShipping = /(?:이상|이하|미만|초과|조건)/.test(shippingText);
  const explicitlyFreeShipping = /무료/.test(shippingText) && !conditionalShipping;
  const hasVisibleSoldOut = /<(?:button|a)\b(?![^>]*\bdisplaynone\b)[^>]*>[^<]*(?:SOLD\s*OUT|품절)/i.test(html);
  const hasBuyButton = /<a\b[^>]*class=["'][^"']*\bactionBuy\b[^"']*["'][^>]*>[\s\S]{0,180}?구매하기/i.test(html);
  return {
    productName: rawTitle?.replace(/\s*-\s*비그룸\s*$/i, '').trim() || null,
    listedSalePrice: salePrice,
    listPrice,
    publicCouponAmount: salePrice !== null && optimumPrice !== null && optimumPrice < salePrice
      ? salePrice - optimumPrice
      : null,
    shippingFee: explicitlyFreeShipping ? 0 : conditionalShipping ? null : parseMoney(shippingText),
    available: hasVisibleSoldOut ? false : hasBuyButton && salePrice !== null ? true : null,
    appBenefitAdvertised: /앱에서\s*혜택보기/.test(html),
  };
}

export function parseBigroomTitleComponents(
  productName: string,
  anchor: BigroomAnchorProduct,
): BigroomAnchorProduct['components'] {
  const anchorName = anchor.normalized_product_name;
  if (!anchorName) return [];
  if (!normalizeSearchText(productName).includes(normalizeSearchText(anchorName))) return [];
  const capacityMatch = productName.match(/(\d+(?:\.\d+)?)\s*(ml|g)\b/i);
  const anchorMain = anchor.components.find((component) => component.type === 'MAIN');
  const capacityValue = capacityMatch ? Number(capacityMatch[1]) : anchorMain?.capacity_value ?? null;
  const capacityUnit = capacityMatch
    ? capacityMatch[2].toUpperCase() as 'ML' | 'G'
    : anchorMain?.capacity_unit ?? null;
  if (capacityValue === null || capacityUnit === null) return [];
  const bonusQuantity = productName.match(/(\d+)\s*\+\s*(\d+)/);
  const quantity = bonusQuantity
    ? Number(bonusQuantity[1]) + Number(bonusQuantity[2])
    : Number(productName.match(/(?:x|×|\*)\s*(\d+)\b/i)?.[1]
      ?? productName.match(/(?:^|\D)(\d+)\s*개(?:입)?(?=\D|$)/i)?.[1]
      ?? '1');
  return [{
    type: 'MAIN',
    name: anchorName,
    capacity_value: capacityValue,
    capacity_unit: capacityUnit,
    quantity,
  }];
}

export function isMixedBigroomSet(productName: string): boolean {
  const hasNumericBonus = /\d+\s*\+\s*\d+/.test(productName);
  const capacityTokens = [...productName.matchAll(/\d+(?:\.\d+)?\s*(?:ml|g)\b/gi)];
  if (hasNumericBonus) {
    const withoutNumericBonus = productName.replace(/\d+\s*\+\s*\d+/g, ' ');
    return capacityTokens.length > 1 && (
      /(?:^|[\s\[\(])SET(?:[\s\]\)]|$)|세트/i.test(withoutNumericBonus)
      || /[+&]/.test(withoutNumericBonus)
    );
  }
  return /(?:^|[\s\[\(])SET(?:[\s\]\)]|$)|세트/i.test(productName)
    || /[+&]/.test(productName) && capacityTokens.length > 1;
}

function parseBigroomProductUrl(value: string): { productId: string; slug: string; url: string } | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const match = url.pathname.match(/^\/product\/([^/]+)\/(\d+)(?:\/.*)?$/i);
    if (hostname !== 'bgroom.co.kr' || !match) return null;
    return {
      productId: match[2],
      slug: decodeURIComponent(match[1]).replace(/-/g, ' '),
      url: `${BIGROOM_ORIGIN}/product/${match[1]}/${match[2]}/`,
    };
  } catch {
    return null;
  }
}

function candidatePriority(anchor: BigroomAnchorProduct, item: Row<'bigroom_catalog_items'>): number {
  const anchorMain = anchor.components.find((component) => component.type === 'MAIN');
  const slug = item.product_slug.toLowerCase();
  let score = 0;
  if (/\bset\b|세트/i.test(slug)) score += 100;
  if (anchorMain?.capacity_value && !slug.includes(String(anchorMain.capacity_value))) score += 5;
  return score;
}

export function selectBigroomVerificationCandidates(
  candidates: readonly Row<'bigroom_catalog_items'>[],
  maximum: number,
): Row<'bigroom_catalog_items'>[] {
  const eligible = candidates.filter((candidate) => !isMixedBigroomSet(candidate.product_slug));
  const single = eligible.find((candidate) => !/1\s*\+\s*1/i.test(candidate.product_slug));
  const sameProductMulti = eligible.find((candidate) => /1\s*\+\s*1/i.test(candidate.product_slug));
  return uniqueRowsById([
    ...(single ? [single] : []),
    ...(sameProductMulti ? [sameProductMulti] : []),
    ...eligible,
  ]).slice(0, maximum);
}

function uniqueRowsById(
  rows: readonly Row<'bigroom_catalog_items'>[],
): Row<'bigroom_catalog_items'>[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function uniqueRows(rows: Insert<'bigroom_catalog_items'>[]): Insert<'bigroom_catalog_items'>[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.external_product_id)) return false;
    seen.add(row.external_product_id);
    return true;
  });
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function findById(html: string, id: string): string | null {
  return html.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>([\\s\\S]{0,240}?)<\\/[^>]+>`, 'i'))?.[1] ?? null;
}

function readAttribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? null;
}

function stripTags(value: string | null): string {
  return decodeXml((value ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseMoney(value: string | undefined | null): number | null {
  if (!value) return null;
  const amountPattern = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
  const wonAmount = value.match(new RegExp(`(${amountPattern})\\s*원`, 'i'))?.[1];
  const firstAmount = wonAmount ?? value.match(new RegExp(amountPattern))?.[0];
  if (!firstAmount) return null;
  const parsed = Number(firstAmount.replaceAll(',', ''));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
