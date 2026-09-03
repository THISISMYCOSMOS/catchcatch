import {
  BigroomCatalogService,
  extractBigroomSearchRows,
  extractBigroomSellerPageFacts,
  extractBigroomSitemapRows,
  isMixedBigroomSet,
  parseBigroomTitleComponents,
  selectBigroomVerificationCandidates,
} from './bigroom-catalog.service';
import { Row } from '../database/database.types';
import { ConfigService } from '@nestjs/config';
import { CatchCatchSupabaseClient } from '../database/supabase.client';

const anchor = {
  brand: '비플레인',
  normalized_product_name: '시카테롤 크림',
  components: [{
    type: 'MAIN',
    name: '시카테롤 크림',
    capacity_value: 60,
    capacity_unit: 'ML' as const,
    quantity: 1,
  }],
};

describe('Bigroom catalog parsing', () => {
  it('indexes only Bigroom product URLs from sitemap rows', () => {
    const rows = extractBigroomSitemapRows(`
      <urlset>
        <url><loc>https://bgroom.co.kr/product/%EB%B9%84%ED%94%8C%EB%A0%88%EC%9D%B8-%EC%8B%9C%EC%B9%B4%ED%85%8C%EB%A1%A4-%ED%81%AC%EB%A6%BC-60ml/1172/</loc><lastmod>2026-09-01T00:00:00+09:00</lastmod></url>
        <url><loc>https://bgroom.co.kr/board/free/list.html</loc></url>
        <url><loc>https://example.com/product/not-bigroom/1/</loc></url>
      </urlset>
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      external_product_id: '1172',
      product_url: 'https://bgroom.co.kr/product/%EB%B9%84%ED%94%8C%EB%A0%88%EC%9D%B8-%EC%8B%9C%EC%B9%B4%ED%85%8C%EB%A1%A4-%ED%81%AC%EB%A6%BC-60ml/1172/',
      product_slug: '비플레인 시카테롤 크림 60ml',
      search_text: '비플레인시카테롤크림60ml',
      sitemap_indexed: true,
    });
  });

  it('deduplicates product URLs discovered through Bigroom internal search', () => {
    const rows = extractBigroomSearchRows(`
      <a href="/product/beplain-cicaterol-cream-60ml/1172/">상품</a>
      <a href="/product/beplain-cicaterol-cream-60ml/1172/?cate_no=1">중복</a>
      <a href="/product/rank_prd_category.html?cate_no=1">랭킹</a>
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0].external_product_id).toBe('1172');
  });

  it('extracts only public web prices and records app benefit text separately', () => {
    const facts = extractBigroomSellerPageFacts(`
      <meta property="og:title" content="[비플레인] 시카테롤 크림 60ml - 비그룸">
      <meta property="product:sale_price:amount" content="15900">
      <span id="span_product_price_custom"><strike>28,000원</strike></span>
      <span id="span_optimum_discount_price_text">쿠폰 적용가 14,900원</span>
      <table><tr><th>배송비</th><td>무료</td></tr></table>
      <a class="btnSubmit actionBuy">구매하기</a>
      <span>앱에서 혜택보기</span>
    `);

    expect(facts).toEqual({
      productName: '[비플레인] 시카테롤 크림 60ml',
      listedSalePrice: 15900,
      listPrice: 28000,
      publicCouponAmount: 1000,
      shippingFee: 0,
      available: true,
      appBenefitAdvertised: true,
    });
  });

  it('does not treat conditional free shipping as zero and parses the final displayed coupon price', () => {
    const facts = extractBigroomSellerPageFacts(`
      <meta property="og:title" content="[비플레인] 시카테롤 크림 60ml - 비그룸">
      <meta property="product:sale_price:amount" content="15900">
      <span id="span_optimum_discount_price_text">10% 쿠폰 적용가 14,900원</span>
      <table><tr><th>배송비</th><td>3,000원 (30,000원 이상 구매 시 무료)</td></tr></table>
      <a class="actionBuy">구매하기</a>
    `);

    expect(facts.publicCouponAmount).toBe(1000);
    expect(facts.shippingFee).toBeNull();
  });

  it('uses the displayed price rather than a later discount or surcharge amount', () => {
    const facts = extractBigroomSellerPageFacts(`
      <meta property="og:title" content="[비플레인] 시카테롤 크림 60ml - 비그룸">
      <meta property="product:sale_price:amount" content="15900.00">
      <span id="span_optimum_discount_price_text">쿠폰 적용가 14,900원 (1,000원 할인)</span>
      <table><tr><th>배송비</th><td>3,000원 / 도서산간 5,000원</td></tr></table>
      <a class="actionBuy">구매하기</a>
    `);

    expect(facts.listedSalePrice).toBe(15900);
    expect(facts.publicCouponAmount).toBe(1000);
    expect(facts.shippingFee).toBe(3000);
  });

  it('keeps single and same-product 1+1 variants but identifies mixed sets', () => {
    expect(parseBigroomTitleComponents('[비플레인] 시카테롤 크림 60ml', anchor)[0].quantity).toBe(1);
    expect(parseBigroomTitleComponents('[비플레인] 시카테롤 크림 60ml 1+1', anchor)[0].quantity).toBe(2);
    expect(parseBigroomTitleComponents('[비플레인] 시카테롤 크림 60ml 2+1', anchor)[0].quantity).toBe(3);
    expect(parseBigroomTitleComponents('[비플레인] 시카테롤 크림 60ml 3개입', anchor)[0].quantity).toBe(3);
    expect(isMixedBigroomSet('[비플레인] 시카테롤 크림 60ml 1+1')).toBe(false);
    expect(isMixedBigroomSet('[비플레인] 시카테롤 크림 60ml 1+1 세트')).toBe(false);
    expect(isMixedBigroomSet('[비플레인] 시카테롤 크림 60ml 1+1 + 토너 150ml 세트')).toBe(true);
    expect(isMixedBigroomSet('[비플레인] 시카테롤 크림 60ml + 토너 150ml 세트')).toBe(true);
    expect(isMixedBigroomSet('[비플레인] 시카테롤 크림 60ml + 토너 150ml 기획')).toBe(true);
  });

  it('reserves verification slots for both a single item and same-product multi packs', () => {
    const candidates = [
      catalogRow('single-new', '[비플레인] 시카테롤 크림 60ml'),
      catalogRow('single-old', '[비플레인] 시카테롤 크림 60ml 리뉴얼'),
      catalogRow('two-pack', '[비플레인] 시카테롤 크림 60ml x 2개'),
      catalogRow('mixed', '[비플레인] 시카테롤 크림 토너 세트'),
    ];

    expect(selectBigroomVerificationCandidates(candidates, 2).map((row) => row.id)).toEqual([
      'single-new',
      'two-pack',
    ]);
  });
});

describe('Bigroom catalog synchronization', () => {
  const sitemap = `
    <urlset>
      <url>
        <loc>https://bgroom.co.kr/product/beplain-cicaterol-cream-60ml/1172/</loc>
        <lastmod>2026-09-01T00:00:00+09:00</lastmod>
      </url>
    </urlset>
  `;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deindexes manifest rows not seen by a successful non-empty sync', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(sitemap, { status: 200 }));
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const staleBuilder = chain({ data: [{ id: 'stale-row' }], error: null });
    const update = jest.fn(() => staleBuilder);
    const client = {
      from: jest.fn(() => ({ upsert, update })),
    } as unknown as CatchCatchSupabaseClient;
    const service = new BigroomCatalogService(client, new ConfigService());

    const result = await service.syncManifest();

    expect(result).toEqual({ indexed: 1, deindexed: 1 });
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ external_product_id: '1172' })]),
      { onConflict: 'external_product_id', ignoreDuplicates: false },
    );
    const syncedAt = (upsert.mock.calls[0][0] as Array<{ last_seen_at: string }>)[0].last_seen_at;
    expect(update).toHaveBeenCalledWith({ sitemap_indexed: false, updated_at: syncedAt });
    expect(staleBuilder.eq).toHaveBeenCalledWith('sitemap_indexed', true);
    expect(staleBuilder.lt).toHaveBeenCalledWith('last_seen_at', syncedAt);
    expect(staleBuilder.select).toHaveBeenCalledWith('id');
  });

  it('fails closed without changing catalog rows when the sitemap has no products', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('<urlset />', { status: 200 }));
    const client = { from: jest.fn() } as unknown as CatchCatchSupabaseClient;
    const service = new BigroomCatalogService(client, new ConfigService());

    await expect(service.syncManifest()).rejects.toThrow('contained no product rows');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('searches active sitemap rows and recently discovered internal-search rows only', async () => {
    const now = Date.parse('2026-09-04T00:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const queryBuilder = chain({ data: [], error: null });
    const client = {
      from: jest.fn(() => queryBuilder),
    } as unknown as CatchCatchSupabaseClient;
    const service = new BigroomCatalogService(
      client,
      new ConfigService({ BIGROOM_MANIFEST_TTL_HOURS: '24' }),
    );

    await (service as unknown as {
      findIndexedCandidates(value: typeof anchor): Promise<unknown>;
    }).findIndexedCandidates(anchor);

    expect(queryBuilder.or).toHaveBeenCalledWith(
      'sitemap_indexed.eq.true,last_seen_at.gte.2026-09-03T00:00:00.000Z',
    );
  });
});

function chain(result: unknown) {
  const builder = {
    eq: jest.fn(),
    lt: jest.fn(),
    select: jest.fn(),
    like: jest.fn(),
    or: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
  };
  builder.eq.mockReturnValue(builder);
  builder.lt.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.like.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockResolvedValue(result);
  builder.select.mockImplementation((columns: string) => (
    columns === 'id' ? Promise.resolve(result) : builder
  ));
  return builder;
}

function catalogRow(id: string, productSlug: string): Row<'bigroom_catalog_items'> {
  return {
    id,
    external_product_id: id,
    product_url: `https://bgroom.co.kr/product/${id}/${id}/`,
    product_slug: productSlug,
    search_text: productSlug,
    sitemap_indexed: true,
    product_name: null,
    listed_price: null,
    listed_sale_price: null,
    public_coupon_amount: null,
    shipping_fee: null,
    capacity_value: null,
    capacity_unit: null,
    quantity: null,
    offer_kind: 'UNKNOWN',
    app_benefit_advertised: false,
    availability_status: 'UNKNOWN',
    sitemap_last_modified_at: null,
    detail_verified_at: null,
    last_seen_at: new Date(0).toISOString(),
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}
