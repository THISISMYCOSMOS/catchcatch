import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { spawnSync } from 'child_process';
import { join } from 'path';
import {
  InMemoryAnalysisOfferRepository,
  InMemoryAnalysisRepository,
  InMemoryDatabase,
  InMemoryProductComponentRepository,
  InMemoryProductRepository,
  InMemorySearchQuotaRepository,
  InMemorySellerOfferComponentRepository,
  InMemorySellerOfferRepository,
  InMemoryUserPreferenceRepository,
} from '../database/repositories/in-memory.repositories';
import { calculateMarketEffectivePrice } from '../domain/calculations';
import { SearchQuotaService } from '../search-quota/search-quota.service';
import { CoreIntegrationService } from './core-integration.service';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('CoreIntegrationService', () => {
  let database: InMemoryDatabase;
  let products: InMemoryProductRepository;
  let components: InMemoryProductComponentRepository;
  let sellerOffers: InMemorySellerOfferRepository;
  let sellerOfferComponents: InMemorySellerOfferComponentRepository;
  let preferences: InMemoryUserPreferenceRepository;
  let analyses: InMemoryAnalysisRepository;
  let analysisOffers: InMemoryAnalysisOfferRepository;
  let searchQuota: SearchQuotaService;
  let service: CoreIntegrationService;

  beforeEach(() => {
    database = new InMemoryDatabase();
    products = new InMemoryProductRepository(database);
    components = new InMemoryProductComponentRepository(database);
    sellerOffers = new InMemorySellerOfferRepository(database);
    sellerOfferComponents = new InMemorySellerOfferComponentRepository(database);
    preferences = new InMemoryUserPreferenceRepository(database);
    analyses = new InMemoryAnalysisRepository(database);
    analysisOffers = new InMemoryAnalysisOfferRepository(database);
    searchQuota = new SearchQuotaService(new InMemorySearchQuotaRepository(database));
    service = new CoreIntegrationService(
      products,
      components,
      sellerOffers,
      sellerOfferComponents,
      preferences,
      analyses,
      analysisOffers,
      searchQuota,
    );
  });

  it('resolves IDENTIFIED products with a UUID productId and reuses the same product', async () => {
    const first = await resolveProduct(resolveProductRequest());
    const second = await resolveProduct(resolveProductRequest('request-2'));

    expect(first).toEqual({
      productId: expect.stringMatching(UUID_V4_PATTERN),
      brandId: null,
      cachedSellerOffers: [],
    });
    expect(second).toEqual({
      productId: first.productId,
      brandId: null,
      cachedSellerOffers: [],
    });
    expect(await products.findById(first.productId)).toMatchObject({
      canonical_name: 'Round Lab Sun Cream',
      product_key: expect.stringMatching(/^identity:v2:[0-9a-f]{32}$/),
    });
    expect(await components.findByProductId(first.productId)).toHaveLength(1);
  });

  it('accepts Zigzag as an identified source seller', async () => {
    const request = resolveProductRequest();
    request.identification.preview.seller = 'ZIGZAG';

    await expect(resolveProduct(request)).resolves.toMatchObject({
      productId: expect.stringMatching(UUID_V4_PATTERN),
    });
  });

  it('separates product identity variants while reusing canonical equivalent identities', async () => {
    const fiftyMl = resolveProductRequest();
    const hundredMl = resolveProductRequest('request-100ml');
    hundredMl.identification.anchor_product!.components[0].capacity_value = 100;
    const sameFiftyDifferentOrder = resolveProductRequest('request-50ml-same');
    sameFiftyDifferentOrder.identification.anchor_product!.brand = ' round   lab ';
    (sameFiftyDifferentOrder.identification.anchor_product!.components as unknown[]) = [
      {
        type: 'OTHER_COSMETIC',
        name: 'gift',
        capacity_value: null,
        capacity_unit: null,
        quantity: 1,
      },
      sameFiftyDifferentOrder.identification.anchor_product!.components[0],
    ];
    const firstFiftyWithGift = resolveProductRequest('request-50ml-gift');
    (firstFiftyWithGift.identification.anchor_product!.components as unknown[]) = [
      {
        type: 'OTHER_COSMETIC',
        name: 'gift',
        capacity_value: null,
        capacity_unit: null,
        quantity: 1,
      },
      firstFiftyWithGift.identification.anchor_product!.components[0],
    ];

    const first = await resolveProduct(firstFiftyWithGift);
    const same = await resolveProduct(sameFiftyDifferentOrder);
    const different = await resolveProduct(hundredMl);

    expect(same.productId).toBe(first.productId);
    expect(different.productId).not.toBe(first.productId);
  });

  it('rejects non-IDENTIFIED products instead of creating a backend product id', async () => {
    const request = resolveProductRequest();
    request.identification.identification_status = 'AMBIGUOUS';
    (request.identification as Record<string, unknown>).anchor_product = null;

    await expect(resolveProduct(request)).rejects.toBeInstanceOf(BadRequestException);
    expect(database.store.products).toHaveLength(0);
    await expect(searchQuota.findForUser('user-1')).resolves.toMatchObject({
      used: 0,
      remaining: 10,
    });
  });

  it('rejects malformed identification payloads without creating products', async () => {
    const request = resolveProductRequest();
    request.identification.anchor_product!.components[0].quantity = 0;

    await expect(resolveProduct(request)).rejects.toBeInstanceOf(BadRequestException);
    expect(database.store.products).toHaveLength(0);
    await expect(searchQuota.findForUser('user-1')).resolves.toMatchObject({
      used: 0,
      remaining: 10,
    });
  });

  it('ingests only CONTENT_VERIFIED seller offers and returns stored values', async () => {
    const product = await resolveProduct(resolveProductRequest());

    const first = await service.ingestOffers(product.productId, ingestOffersRequest());
    const second = await service.ingestOffers(product.productId, ingestOffersRequest('same-request-again'));

    expect(first.productId).toBe(product.productId);
    expect(first.offers).toEqual([
      {
        id: expect.stringMatching(UUID_V4_PATTERN),
        sellerName: 'COUPANG',
        sellerUrl: 'https://example.com/coupang',
        purchaseUrl: 'https://example.com/coupang',
        marketEffectivePrice: 10000,
        reusedExisting: false,
      },
    ]);
    expect(second.offers).toEqual([
      {
        ...first.offers[0],
        reusedExisting: true,
      },
    ]);
    expect(await sellerOffers.findByProductId(product.productId)).toHaveLength(1);
    expect(database.store.priceHistory).toHaveLength(0);
  });

  it('keeps old seller URLs as history but returns only the newest URL for refresh', async () => {
    const product = await resolveProduct(resolveProductRequest());
    await service.ingestOffers(product.productId, ingestOffersRequest());

    const next = ingestOffersRequest('new-coupang-url');
    next.search.seller_results[0].source!.source_url = 'https://example.com/coupang-new';
    next.search.seller_results[0].source!.observed_at = '2026-08-11T00:00:00.000Z';
    next.search.seller_results[0].candidate_offer!.listed_sale_price = 9_000;
    await service.ingestOffers(product.productId, next);

    expect(await sellerOffers.findByProductId(product.productId)).toHaveLength(1);
    expect(await sellerOffers.findAllByProductId(product.productId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ seller_url: 'https://example.com/coupang', is_active: false }),
      expect.objectContaining({ seller_url: 'https://example.com/coupang-new', is_active: true }),
    ]));
    await expect(resolveProduct(resolveProductRequest('resolve-after-refresh'))).resolves.toMatchObject({
      cachedSellerOffers: [expect.objectContaining({
        seller: 'COUPANG',
        source_url: 'https://example.com/coupang-new',
        observed_at: '2026-08-11T00:00:00.000Z',
        candidate_offer: expect.objectContaining({ listed_sale_price: 9_000 }),
      })],
    });
  });

  it('reuses a stored Coupang Partners URL without converting the same source URL again', async () => {
    const convert = jest.fn().mockResolvedValue('https://link.coupang.com/a/test');
    service = new CoreIntegrationService(
      products,
      components,
      sellerOffers,
      sellerOfferComponents,
      preferences,
      analyses,
      analysisOffers,
      searchQuota,
      undefined,
      { convert } as never,
    );
    const product = await resolveProduct(resolveProductRequest());

    const first = await service.ingestOffers(product.productId, ingestOffersRequest());
    const second = await service.ingestOffers(product.productId, ingestOffersRequest('same-coupang-url'));

    expect(convert).toHaveBeenCalledTimes(1);
    expect(first.offers[0].purchaseUrl).toBe('https://link.coupang.com/a/test');
    expect(second.offers[0].purchaseUrl).toBe('https://link.coupang.com/a/test');
  });

  it('adds Bigroom single and same-product 1+1 offers without replacing verified sellers', async () => {
    const findVerifiedOffers = jest.fn().mockResolvedValue([
      {
        seller: 'BIGROOM',
        productName: 'Round Lab Sun Cream 50ml',
        productUrl: 'https://bgroom.co.kr/product/round-lab-sun-cream-50ml/100/',
        listedPrice: 20000,
        listedSalePrice: 12000,
        publicCouponAmount: null,
        shippingFee: 0,
        components: [{ type: 'MAIN', name: 'Round Lab Sun Cream', capacity_value: 50, capacity_unit: 'ML', quantity: 1 }],
        appBenefitAdvertised: true,
        observedAt: '2026-09-03T00:00:00.000Z',
      },
      {
        seller: 'BIGROOM',
        productName: 'Round Lab Sun Cream 50ml 1+1',
        productUrl: 'https://bgroom.co.kr/product/round-lab-sun-cream-50ml-1-plus-1/101/',
        listedPrice: 40000,
        listedSalePrice: 18000,
        publicCouponAmount: null,
        shippingFee: 0,
        components: [{ type: 'MAIN', name: 'Round Lab Sun Cream', capacity_value: 50, capacity_unit: 'ML', quantity: 2 }],
        appBenefitAdvertised: false,
        observedAt: '2026-09-03T00:00:00.000Z',
      },
    ]);
    service = new CoreIntegrationService(
      products,
      components,
      sellerOffers,
      sellerOfferComponents,
      preferences,
      analyses,
      analysisOffers,
      searchQuota,
      { findVerifiedOffers } as never,
    );
    const product = await resolveProduct(resolveProductRequest());

    const result = await service.ingestOffers(product.productId, ingestOffersRequest());

    expect(findVerifiedOffers).toHaveBeenCalledTimes(1);
    expect(result.offers.map((offer) => offer.sellerName)).toEqual(['COUPANG', 'BIGROOM', 'BIGROOM']);
    const bigroomOfferIds = result.offers
      .filter((offer) => offer.sellerName === 'BIGROOM')
      .map((offer) => offer.id);
    const storedComponents = await sellerOfferComponents.findBySellerOfferIds(bigroomOfferIds);
    expect(storedComponents.map((component) => component.quantity).sort()).toEqual([1, 2]);
    const storedBigroomOffers = await sellerOffers.findByProductId(product.productId);
    expect(storedBigroomOffers.find((offer) => offer.seller_url.endsWith('/100'))?.app_benefit_advertised).toBe(true);
    expect(storedBigroomOffers.find((offer) => offer.seller_url.endsWith('/101'))?.app_benefit_advertised).toBe(false);
    expect(storedBigroomOffers.find((offer) => offer.seller_url.endsWith('/100'))?.comparison_status).toBe('DIRECTLY_COMPARABLE');
    expect(storedBigroomOffers.find((offer) => offer.seller_url.endsWith('/101'))?.comparison_status).toBe('UNIT_COMPARABLE');
  });

  it('keeps an identity-verified legacy seller comparable when capacity evidence is incomplete', async () => {
    const product = await resolveProduct(resolveProductRequest());
    const request = ingestOffersRequest('missing-capacity');

    await service.ingestOffers(product.productId, request);

    const [stored] = await sellerOffers.findByProductId(product.productId);
    expect(stored.comparison_status).toBe('DIRECTLY_COMPARABLE');
  });

  it('keeps verified sellers when the zero-AI Bigroom adapter fails', async () => {
    service = new CoreIntegrationService(
      products,
      components,
      sellerOffers,
      sellerOfferComponents,
      preferences,
      analyses,
      analysisOffers,
      searchQuota,
      { findVerifiedOffers: jest.fn().mockRejectedValue(new Error('Bigroom unavailable')) } as never,
    );
    const product = await resolveProduct(resolveProductRequest());

    const result = await service.ingestOffers(product.productId, ingestOffersRequest());

    expect(result.offers.map((offer) => offer.sellerName)).toEqual(['COUPANG']);
  });

  it('stores different seller offer components and replaces stale components on re-search', async () => {
    const product = await resolveProduct(resolveProductRequest());
    const request = ingestOffersRequest();
    request.search.seller_results[1].source!.verification_status = 'CONTENT_VERIFIED';
    (request.search.seller_results[0].candidate_offer!.components as unknown[]) = [
      { type: 'MAIN', name: 'main', capacity_value: 50, capacity_unit: 'ML', quantity: 1 },
      { type: 'NON_COSMETIC_GIFT', name: 'gift pouch', capacity_value: null, capacity_unit: null, quantity: 1 },
    ];
    (request.search.seller_results[1].candidate_offer!.components as unknown[]) = [
      { type: 'MAIN', name: 'main', capacity_value: 50, capacity_unit: 'ML', quantity: 1 },
    ];

    const first = await service.ingestOffers(product.productId, request);
    const firstComponents = await sellerOfferComponents.findBySellerOfferIds(first.offers.map((offer) => offer.id));
    expect(firstComponents.filter((component) => component.seller_offer_id === first.offers[0].id)).toHaveLength(2);
    expect(firstComponents.filter((component) => component.seller_offer_id === first.offers[1].id)).toHaveLength(1);

    const secondRequest = ingestOffersRequest('component-refresh');
    secondRequest.search.seller_results[1].source!.verification_status = 'CONTENT_VERIFIED';
    (secondRequest.search.seller_results[0].candidate_offer!.components as unknown[]) = [
      { type: 'MAIN', name: 'main', capacity_value: 50, capacity_unit: 'ML', quantity: 1 },
    ];
    (secondRequest.search.seller_results[1].candidate_offer!.components as unknown[]) = [
      { type: 'MAIN', name: 'main', capacity_value: 50, capacity_unit: 'ML', quantity: 1 },
    ];
    const second = await service.ingestOffers(product.productId, secondRequest);
    expect(second.offers[0].id).toBe(first.offers[0].id);
    const refreshed = await sellerOfferComponents.findBySellerOfferIds([first.offers[0].id]);
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0].component_type).toBe('MAIN');

    await service.ingestOffers(product.productId, secondRequest);
    await expect(sellerOfferComponents.findBySellerOfferIds([first.offers[0].id])).resolves.toHaveLength(1);
  });

  it.each([
    ['invalid seller', (request: ReturnType<typeof ingestOffersRequest>) => {
      (request.search.seller_results[0] as Record<string, unknown>).seller = 'UNKNOWN_SELLER';
    }],
    ['AVAILABLE without candidate_offer', (request: ReturnType<typeof ingestOffersRequest>) => {
      (request.search.seller_results[0] as Record<string, unknown>).candidate_offer = null;
    }],
    ['AVAILABLE without source', (request: ReturnType<typeof ingestOffersRequest>) => {
      (request.search.seller_results[0] as Record<string, unknown>).source = null;
    }],
    ['invalid CONTENT_VERIFIED URL', (request: ReturnType<typeof ingestOffersRequest>) => {
      request.search.seller_results[0].source!.source_url = 'not a url';
    }],
    ['negative price', (request: ReturnType<typeof ingestOffersRequest>) => {
      request.search.seller_results[0].candidate_offer!.listed_sale_price = -1;
    }],
    ['invalid datetime', (request: ReturnType<typeof ingestOffersRequest>) => {
      request.search.seller_results[0].source!.observed_at = 'not-a-date';
    }],
    ['invalid component quantity', (request: ReturnType<typeof ingestOffersRequest>) => {
      (request.search.seller_results[0].candidate_offer!.components as unknown[]) = [{
        type: 'MAIN',
        name: 'main',
        capacity_value: 50,
        capacity_unit: 'ML',
        quantity: 0,
      }];
    }],
    ['duplicated seller', (request: ReturnType<typeof ingestOffersRequest>) => {
      (request.search.seller_results[1] as Record<string, unknown>).seller = request.search.seller_results[0].seller;
    }],
  ])('rejects malformed search payloads without storing offers: %s', async (_name, mutate) => {
    const product = await resolveProduct(resolveProductRequest());
    const request = ingestOffersRequest();
    mutate(request);

    await expect(service.ingestOffers(product.productId, request)).rejects.toBeInstanceOf(BadRequestException);
    expect(await sellerOffers.findByProductId(product.productId)).toHaveLength(0);
    expect(database.store.priceHistory).toHaveLength(0);
  });

  it('updates an existing seller offer price while preserving the offer id', async () => {
    const product = await resolveProduct(resolveProductRequest());

    const first = await service.ingestOffers(product.productId, ingestOffersRequest());
    const secondRequest = ingestOffersRequest('updated-price');
    secondRequest.search.seller_results[0].candidate_offer!.listed_sale_price = 15000;
    secondRequest.search.seller_results[0].candidate_offer!.public_coupon_amount = 0;
    const second = await service.ingestOffers(product.productId, secondRequest);

    expect(second.offers).toEqual([
      {
        ...first.offers[0],
        marketEffectivePrice: 15000,
        reusedExisting: true,
      },
    ]);
    const stored = await sellerOffers.findByProductId(product.productId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: first.offers[0].id,
      listed_sale_price: 15000,
      market_effective_price: 15000,
    });
  });

  it('uses the domain market effective price calculation for ingested offers', async () => {
    const product = await resolveProduct(resolveProductRequest());

    const result = await service.ingestOffers(product.productId, ingestOffersRequest());

    expect(result.offers[0].marketEffectivePrice).toBe(calculateMarketEffectivePrice({
      listedSalePrice: 11000,
      shippingFee: 0,
      discounts: [
        {
          id: 'public-coupon',
          amount: 1000,
          applicationStatus: 'APPLICABLE',
          exclusiveGroup: null,
          includedInBasePrice: false,
        },
      ],
    }));
  });

  it('ingests a content-verified Zigzag offer', async () => {
    const product = await resolveProduct(resolveProductRequest());
    const request = ingestOffersRequest();
    request.search.seller_results[0].seller = 'ZIGZAG';
    request.search.seller_results[0].source!.source_url = 'https://zigzag.kr/catalog/products/1';

    const result = await service.ingestOffers(product.productId, request);

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({ sellerName: 'ZIGZAG' });
  });

  it('builds judgment context from real snapshots and excludes non CONTENT_VERIFIED snapshots', async () => {
    const { analysisId, productId } = await seedJudgmentReadyAnalysis();

    const result = await service.buildJudgmentInput(analysisId, 'user-1');

    expect(result).toMatchObject({
      product_data_mode: 'web_search',
      product: {
        product_id: productId,
        identity: {
          normalized_product_name: 'Round Lab Sun Cream',
          product_type: 'SUNSCREEN',
          option: 'SPF50',
          shade_or_scent: 'Unscented',
          version_or_renewal: '2026',
        },
      },
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
      cheapest_offer_id: 'offer-lowest',
      comparison_price_basis: 'PERSONALIZED',
      allowed_conclusions: ['LOW_POINT_BUY'],
    });
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      offer_id: 'offer-lowest',
      seller: 'COUPANG',
      public_effective_price: 10000,
      personalized_effective_price: 9000,
      unit_price: 180,
      source: { verification_status: 'CONTENT_VERIFIED' },
    });
    expect(result.allowed_offer_ids).toEqual(['offer-lowest']);
    expect(result.facts[0].id).toBe('offer:offer-lowest:price');
    expect(result.facts[0].numeric_values).toContain(9000);
    expect(result.criterion_assessments).toEqual([
      { criterion: 'FINAL_PAYMENT_AMOUNT', status: 'NEUTRAL', fact_ids: ['offer:offer-lowest:price'] },
      { criterion: 'PURCHASE_TIMING', status: 'UNKNOWN', fact_ids: [] },
      { criterion: 'UNIT_PRICE', status: 'NEUTRAL', fact_ids: ['offer:offer-lowest:price'] },
    ]);
    expectAgentSchemaParse('judgmentInputSchema', result);
  });

  it('uses PUBLIC comparison basis when only some offers have personalized prices', async () => {
    const { analysisId } = await seedJudgmentReadyAnalysis({
      includeSecondVerifiedOffer: true,
      lowestResultId: 'offer-public-lowest',
    });

    const result = await service.buildJudgmentInput(analysisId, 'user-1');

    expect(result.comparison_price_basis).toBe('PUBLIC');
    expect(result.cheapest_offer_id).toBe('offer-public-lowest');
    expect(result.allowed_offer_ids).toEqual(['offer-public-lowest', 'offer-lowest']);
    expectAgentSchemaParse('judgmentInputSchema', result);
  });

  it('preserves case-sensitive seller link paths and query values', async () => {
    const product = await resolveProduct(resolveProductRequest());
    const request = ingestOffersRequest('case-sensitive-link');
    request.search.seller_results[0].source!.source_url = 'https://link.coupang.com/a/AbCd?lptag=CaseSensitive';

    const result = await service.ingestOffers(product.productId, request);

    expect(result.offers[0].sellerUrl).toBe('https://link.coupang.com/a/AbCd?lptag=CaseSensitive');
  });

  it('limits judgment recommendations to the deterministic global top three order', async () => {
    const { analysisId } = await seedJudgmentReadyAnalysis({
      includeSecondVerifiedOffer: true,
      recommendedOfferIds: ['offer-public-lowest', 'offer-lowest'],
    });

    const result = await service.buildJudgmentInput(analysisId, 'user-1');

    expect(result.allowed_offer_ids).toEqual(['offer-public-lowest', 'offer-lowest']);
    expectAgentSchemaParse('judgmentInputSchema', result);
  });

  it('passes Bigroom direct-page evidence through the judgment schema without broadening AI search sellers', async () => {
    const { analysisId } = await seedJudgmentReadyAnalysis({
      includeSecondVerifiedOffer: true,
      secondSellerName: 'BIGROOM',
      recommendedOfferIds: ['offer-public-lowest'],
    });

    const result = await service.buildJudgmentInput(analysisId, 'user-1');
    const bigroom = result.offers.find((offer) => offer.seller === 'BIGROOM');

    expect(bigroom?.source.acquisition_method).toBe('DIRECT_HTTP');
    expect(result.allowed_offer_ids).toEqual(['offer-public-lowest']);
    expectAgentSchemaParse('judgmentInputSchema', result);
  });

  it('preserves Zigzag as a seller in the Agent judgment contract', async () => {
    const { analysisId } = await seedJudgmentReadyAnalysis({
      includeSecondVerifiedOffer: true,
      secondSellerName: 'ZIGZAG',
    });

    const result = await service.buildJudgmentInput(analysisId, 'user-1');
    const zigzag = result.offers.find((offer) => offer.seller === 'ZIGZAG');

    expect(zigzag).toBeDefined();
    expect(zigzag?.source.acquisition_method).toBe('AI_WEB_SEARCH');
    expectAgentSchemaParse('judgmentInputSchema', result);
  });

  it('connects criterion assessments only to matching fact types', async () => {
    const { analysisId } = await seedJudgmentReadyAnalysis();
    await preferences.upsert({
      user_id: 'user-1',
      selected_criteria: [
        'SET_AND_GIFTS',
        'FAST_DELIVERY',
        'PURCHASE_TIMING',
      ],
    });
    const analysis = await analyses.findById(analysisId);
    await analyses.updateResult(analysisId, {
      status: analysis!.status,
      verdict: analysis!.verdict,
      allowed_conclusions: analysis!.allowed_conclusions,
      warning_codes: [],
      result_json: {
        ...(analysis!.result_json as Record<string, unknown>),
        recentAveragePrice: 12000,
      },
    });
    const [snapshot] = await analysisOffers.findByAnalysisId(analysisId);
    snapshot.offer_snapshot = {
      ...(snapshot.offer_snapshot as Record<string, unknown>),
      components: [
        { type: 'MAIN', name: 'main', capacity_value: 50, capacity_unit: 'ML', quantity: 1 },
        { type: 'NON_COSMETIC_GIFT', name: 'gift', capacity_value: null, capacity_unit: null, quantity: 1 },
      ],
      deliveryDays: 1,
    };

    const result = await service.buildJudgmentInput(analysisId, 'user-1');

    expect(result.facts.map((fact) => fact.id)).toEqual(expect.arrayContaining([
      'offer:offer-lowest:price',
      'offer:offer-lowest:composition',
      'offer:offer-lowest:delivery',
      'history:recent-average',
    ]));
    expect(result.criterion_assessments).toEqual([
      { criterion: 'SET_AND_GIFTS', status: 'NEUTRAL', fact_ids: ['offer:offer-lowest:composition'] },
      { criterion: 'FAST_DELIVERY', status: 'NEUTRAL', fact_ids: ['offer:offer-lowest:delivery'] },
      { criterion: 'PURCHASE_TIMING', status: 'NEUTRAL', fact_ids: ['history:recent-average'] },
    ]);
    expectAgentSchemaParse('judgmentInputSchema', result);
  });

  it('validates and saves AI judgment results into the existing analysis row', async () => {
    const { analysisId } = await seedJudgmentReadyAnalysis();

    const saved = await service.saveJudgmentResult(analysisId, 'user-1', {
      schemaVersion: 'ai-judgment.v1',
      judgment: validJudgment(),
    });

    expect(saved).toMatchObject({
      id: analysisId,
      status: 'COMPLETED',
      verdict: 'LOW_POINT_BUY',
    });
    expect(saved.result).toMatchObject({
      lowestEffectivePriceOffer: { id: 'offer-lowest' },
      aiJudgment: {
        conclusion: 'LOW_POINT_BUY',
        recommended_offer_id: 'offer-lowest',
      },
      aiMetadata: {
        schemaVersion: 'ai-judgment.v1',
      },
    });
    await expect(analyses.findById(analysisId)).resolves.toMatchObject({
      verdict: 'LOW_POINT_BUY',
      result_json: expect.objectContaining({
        aiJudgment: expect.objectContaining({
          recommended_offer_id: 'offer-lowest',
        }),
      }),
    });
  });

  it('rejects unsupported judgment values and foreign ownership', async () => {
    const { analysisId } = await seedJudgmentReadyAnalysis();

    await expect(service.buildJudgmentInput(analysisId, 'user-2'))
      .rejects
      .toBeInstanceOf(ForbiddenException);
    await expect(service.saveJudgmentResult(analysisId, 'user-1', {
      schemaVersion: 'ai-judgment.v1',
      judgment: { ...validJudgment(), recommended_offer_id: 'not-allowed' },
    }))
      .rejects
      .toBeInstanceOf(BadRequestException);
    await expect(service.saveJudgmentResult(analysisId, 'user-1', {
      schemaVersion: 'ai-judgment.v1',
      judgment: { ...validJudgment(), used_fact_ids: ['missing-fact'] },
    }))
      .rejects
      .toBeInstanceOf(BadRequestException);
    await expect(service.saveJudgmentResult(analysisId, 'user-1', {
      schemaVersion: 'ai-judgment.v1',
      judgment: {
        ...validJudgment(),
        criteria_results: validJudgment().criteria_results.slice(0, 2),
      },
    }))
      .rejects
      .toBeInstanceOf(BadRequestException);
    await expect(service.saveJudgmentResult(analysisId, 'user-1', {
      schemaVersion: 'ai-judgment.v1',
      judgment: {
        ...validJudgment(),
        criteria_results: [
          validJudgment().criteria_results[0],
          validJudgment().criteria_results[0],
          validJudgment().criteria_results[2],
        ],
      },
    }))
      .rejects
      .toBeInstanceOf(BadRequestException);
    await expect(service.buildJudgmentInput('00000000-0000-4000-8000-000000000000', 'user-1'))
      .rejects
      .toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['missing confidence', () => {
      const judgment = validJudgment() as Record<string, unknown>;
      delete judgment.confidence;
      return judgment;
    }],
    ['missing evidence_review', () => {
      const judgment = validJudgment() as Record<string, unknown>;
      delete judgment.evidence_review;
      return judgment;
    }],
    ['missing conclusion_reason', () => {
      const judgment = validJudgment() as Record<string, unknown>;
      delete judgment.conclusion_reason;
      return judgment;
    }],
    ['criteria 4개', () => ({
      ...validJudgment(),
      criteria_results: [
        ...validJudgment().criteria_results,
        { ...validJudgment().criteria_results[0], criterion: 'FAST_DELIVERY' },
      ],
    })],
    ['unknown status', () => ({
      ...validJudgment(),
      criteria_results: [
        { ...validJudgment().criteria_results[0], status: 'VERY_GOOD' },
        validJudgment().criteria_results[1],
        validJudgment().criteria_results[2],
      ],
    })],
    ['invalid decision/conclusion combination', () => ({
      ...validJudgment(),
      decision_status: 'INSUFFICIENT_EVIDENCE',
      conclusion: 'LOW_POINT_BUY',
    })],
    ['supporting and contradicting overlap', () => ({
      ...validJudgment(),
      evidence_review: {
        supporting_fact_ids: ['offer:offer-lowest:price'],
        contradicting_fact_ids: ['offer:offer-lowest:price'],
        missing_evidence: [],
      },
    })],
  ])('rejects invalid AI judgment shape: %s', async (_name, makeJudgment) => {
    const { analysisId } = await seedJudgmentReadyAnalysis();

    await expect(service.saveJudgmentResult(analysisId, 'user-1', {
      schemaVersion: 'ai-judgment.v1',
      judgment: makeJudgment() as Record<string, unknown>,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps fixture AI judgment compatible with the latest Agent schema', () => {
    expectAgentSchemaParse('aiJudgmentSchema', validJudgment());
  });

  function resolveProductRequest(idempotencyKey = 'request-1') {
    return {
      schemaVersion: 'product-identification.v1' as const,
      sourceUrl: 'https://example.com/source',
      idempotencyKey,
      identification: {
        identification_status: 'IDENTIFIED',
        anchor_product: {
          brand: 'Round Lab',
          normalized_product_name: 'Round Lab Sun Cream',
          product_type: 'SUNSCREEN',
          option: null,
          shade_or_scent: null,
          version_or_renewal: null,
          components: [
            {
              type: 'MAIN',
              name: 'main',
              capacity_value: 50,
              capacity_unit: 'ML',
              quantity: 1,
            },
          ],
        },
        preview: {
          seller: 'COUPANG',
          listed_price: 12000,
          image_url: null,
        },
        source: {
          source_url: 'https://example.com/source',
          verification_status: 'URL_VERIFIED',
        },
        warnings: [],
      },
    };
  }

  function resolveProduct(input: ReturnType<typeof resolveProductRequest>, userId = 'user-1') {
    return service.resolveProduct(input, userId);
  }

  function ingestOffersRequest(idempotencyKey = 'request-1') {
    return {
      schemaVersion: 'product-search.v1' as const,
      idempotencyKey,
      search: {
        anchor_product: resolveProductRequest().identification.anchor_product,
        seller_results: [
          {
            seller: 'COUPANG',
            availability: 'AVAILABLE',
            candidate_offer: {
              list_price: 12000,
              listed_sale_price: 11000,
              public_coupon_amount: 1000,
              automatic_discount_amount: null,
              shipping_fee: 0,
              product_name: 'Round Lab Sun Cream',
              brand: 'Round Lab',
              product_type: 'SUNSCREEN',
              option: null,
              shade_or_scent: null,
              version_or_renewal: null,
              discount_conditions: [],
              shipping_condition: null,
              components: [],
            },
            match_evidence: ['same product name'],
            mismatch_reasons: [],
            source: {
              source_type: 'SELLER_PAGE',
              source_url: 'https://example.com/coupang',
              acquisition_method: 'AI_WEB_SEARCH',
              observed_at: '2026-08-10T00:00:00.000Z',
              verification_status: 'CONTENT_VERIFIED',
            },
          },
          {
            seller: 'MUSINSA_BEAUTY',
            availability: 'AVAILABLE',
            candidate_offer: {
              list_price: 13000,
              listed_sale_price: 12500,
              public_coupon_amount: null,
              automatic_discount_amount: null,
              shipping_fee: 0,
              product_name: 'Round Lab Sun Cream',
              brand: 'Round Lab',
              product_type: 'SUNSCREEN',
              option: null,
              shade_or_scent: null,
              version_or_renewal: null,
              discount_conditions: [],
              shipping_condition: null,
              components: [],
            },
            match_evidence: ['same product name'],
            mismatch_reasons: [],
            source: {
              source_type: 'SELLER_PAGE',
              source_url: 'https://example.com/musinsa',
              acquisition_method: 'AI_WEB_SEARCH',
              observed_at: '2026-08-10T00:00:00.000Z',
              verification_status: 'URL_VERIFIED',
            },
          },
        ],
        warnings: [],
      },
    };
  }

  function validJudgment() {
    return {
      evidence_review: {
        supporting_fact_ids: ['offer:offer-lowest:price'],
        contradicting_fact_ids: [],
        missing_evidence: [],
      },
      decision_status: 'DECIDED',
      conclusion: 'LOW_POINT_BUY',
      conclusion_reason: 'Fixture judgment from Core integration test.',
      confidence: {
        level: 'HIGH',
        reason: 'Fixture confidence.',
        used_fact_ids: ['offer:offer-lowest:price'],
      },
      criteria_results: [
        {
          criterion: 'FINAL_PAYMENT_AMOUNT',
          status: 'POSITIVE',
          reason: 'Lowest offer.',
          used_fact_ids: ['offer:offer-lowest:price'],
        },
        {
          criterion: 'PURCHASE_TIMING',
          status: 'UNKNOWN',
          reason: 'No timing decision in fixture.',
          used_fact_ids: ['offer:offer-lowest:price'],
        },
        {
          criterion: 'UNIT_PRICE',
          status: 'POSITIVE',
          reason: 'Unit price fact is present.',
          used_fact_ids: ['offer:offer-lowest:price'],
        },
      ],
      recommended_offer_id: 'offer-lowest',
      recommendation_reason: 'Lowest verified offer.',
      warnings: [],
      used_fact_ids: ['offer:offer-lowest:price'],
    };
  }

  async function seedJudgmentReadyAnalysis(options: {
    includeSecondVerifiedOffer?: boolean;
    lowestResultId?: string;
    recommendedOfferIds?: string[];
    secondSellerName?: string;
  } = {}) {
    await preferences.upsert({
      user_id: 'user-1',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });
    const product = await products.create({
      id: '00000000-0000-4000-8000-000000000001',
      canonical_name: 'Round Lab Sun Cream',
      brand: 'Round Lab',
      product_key: 'round-lab-sun-cream',
      product_type: 'SUNSCREEN',
      option: 'SPF50',
      shade_or_scent: 'Unscented',
      version_or_renewal: '2026',
      package_type: 'single',
    });
    await components.createMany([
      {
        product_id: product.id,
        component_type: 'MAIN',
        capacity_value: 50,
        capacity_unit: 'ML',
        quantity: 1,
      },
    ]);
    const analysis = await analyses.create({
      id: '00000000-0000-4000-8000-000000000002',
      user_id: 'user-1',
      source_url: 'https://example.com/source',
      product_id: product.id,
      status: 'COMPLETED',
      verdict: null,
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
      allowed_conclusions: ['LOW_POINT_BUY'],
      warning_codes: [],
      result_json: {
        lowestEffectivePriceOffer: {
          id: options.lowestResultId ?? 'offer-lowest',
          userEffectivePrice: 9000,
        },
        ...(options.recommendedOfferIds
          ? { recommendedOfferIds: options.recommendedOfferIds }
          : {}),
      },
    });
    await analysisOffers.createMany([
      {
        analysis_id: analysis.id,
        seller_identifier: 'offer-lowest',
        seller_name: 'COUPANG',
        original_list_price: 12000,
        sale_price: 11000,
        market_effective_price: 10000,
        user_effective_price: 9000,
        shipping_fee: 0,
        public_discount: 1000,
        user_discount: 1000,
        quantity: 1,
        total_amount: 50,
        unit: 'ML',
        calculated_unit_price: 180,
        offer_snapshot: {
          comparisonStatus: 'DIRECTLY_COMPARABLE',
          components: [],
          sourceUrl: 'https://example.com/offer-lowest',
          observedAt: '2026-08-10T00:00:00.000Z',
          verificationStatus: 'CONTENT_VERIFIED',
        },
      },
      ...(options.includeSecondVerifiedOffer
        ? [{
            analysis_id: analysis.id,
            seller_identifier: 'offer-public-lowest',
            seller_name: options.secondSellerName ?? 'MUSINSA_BEAUTY',
            original_list_price: 12000,
            sale_price: 8000,
            market_effective_price: 8000,
            user_effective_price: 8000,
            shipping_fee: 0,
            public_discount: 4000,
            user_discount: null,
            quantity: 1,
            total_amount: 50,
            unit: 'ML' as const,
            calculated_unit_price: 160,
            offer_snapshot: {
              comparisonStatus: 'DIRECTLY_COMPARABLE',
              components: [],
              sourceUrl: 'https://example.com/offer-public-lowest',
              observedAt: '2026-08-10T00:00:00.000Z',
              verificationStatus: 'CONTENT_VERIFIED',
            },
          }]
        : []),
      {
        analysis_id: analysis.id,
        seller_identifier: 'offer-unverified',
        seller_name: 'MUSINSA_BEAUTY',
        market_effective_price: 12500,
        user_effective_price: 12500,
        offer_snapshot: {
          comparisonStatus: 'DIRECTLY_COMPARABLE',
          sourceUrl: 'https://example.com/unverified',
          verificationStatus: 'URL_VERIFIED',
        },
      },
    ]);
    return { analysisId: analysis.id, productId: product.id };
  }
});

function expectAgentSchemaParse(schemaName: 'judgmentInputSchema' | 'aiJudgmentSchema', payload: unknown): void {
  const command = process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : 'npm';
  const code = [
    "const schema = require('./src/ai-judgment/ai-judgment.schema.ts');",
    'const payload = JSON.parse(process.env.CATCHCATCH_SCHEMA_PAYLOAD ?? "null");',
    `schema.${schemaName}.parse(payload);`,
  ].join(' ');
  const args = process.platform === 'win32'
    ? ['/c', 'npm.cmd', 'exec', '--', 'tsx', '-e', code]
    : ['exec', '--', 'tsx', '-e', code];
  const result = spawnSync(command, args, {
    cwd: join(process.cwd(), 'agent'),
    env: {
      ...process.env,
      CATCHCATCH_SCHEMA_PAYLOAD: JSON.stringify(payload),
    },
    encoding: 'utf8',
  });
  expect({
    status: result.status,
    error: result.error?.message,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toEqual({
    status: 0,
    error: undefined,
    stdout: '',
    stderr: '',
  });
}
