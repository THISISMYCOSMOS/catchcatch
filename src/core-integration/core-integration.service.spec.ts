import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  InMemoryAnalysisOfferRepository,
  InMemoryAnalysisRepository,
  InMemoryDatabase,
  InMemoryPriceHistoryRepository,
  InMemoryProductComponentRepository,
  InMemoryProductRepository,
  InMemorySellerOfferRepository,
  InMemoryUserPreferenceRepository,
} from '../database/repositories/in-memory.repositories';
import { CoreIntegrationService } from './core-integration.service';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('CoreIntegrationService', () => {
  let database: InMemoryDatabase;
  let products: InMemoryProductRepository;
  let components: InMemoryProductComponentRepository;
  let sellerOffers: InMemorySellerOfferRepository;
  let priceHistory: InMemoryPriceHistoryRepository;
  let preferences: InMemoryUserPreferenceRepository;
  let analyses: InMemoryAnalysisRepository;
  let analysisOffers: InMemoryAnalysisOfferRepository;
  let service: CoreIntegrationService;

  beforeEach(() => {
    database = new InMemoryDatabase();
    products = new InMemoryProductRepository(database);
    components = new InMemoryProductComponentRepository(database);
    sellerOffers = new InMemorySellerOfferRepository(database);
    priceHistory = new InMemoryPriceHistoryRepository(database);
    preferences = new InMemoryUserPreferenceRepository(database);
    analyses = new InMemoryAnalysisRepository(database);
    analysisOffers = new InMemoryAnalysisOfferRepository(database);
    service = new CoreIntegrationService(
      products,
      components,
      sellerOffers,
      priceHistory,
      preferences,
      analyses,
      analysisOffers,
    );
  });

  it('resolves IDENTIFIED products with a UUID productId and reuses the same product', async () => {
    const first = await service.resolveProduct(resolveProductRequest());
    const second = await service.resolveProduct(resolveProductRequest('request-2'));

    expect(first).toEqual({ productId: expect.stringMatching(UUID_V4_PATTERN), brandId: null });
    expect(second).toEqual({ productId: first.productId, brandId: null });
    expect(await products.findById(first.productId)).toMatchObject({
      canonical_name: 'Round Lab Sun Cream',
      product_key: 'round-lab:round-lab-sun-cream',
    });
    expect(await components.findByProductId(first.productId)).toHaveLength(1);
  });

  it('rejects non-IDENTIFIED products instead of creating a backend product id', async () => {
    const request = resolveProductRequest();
    request.identification.identification_status = 'AMBIGUOUS';
    (request.identification as Record<string, unknown>).anchor_product = null;

    await expect(service.resolveProduct(request)).rejects.toBeInstanceOf(BadRequestException);
    expect(database.store.products).toHaveLength(0);
  });

  it('ingests only CONTENT_VERIFIED seller offers and returns stored values', async () => {
    const product = await service.resolveProduct(resolveProductRequest());

    const first = await service.ingestOffers(product.productId, ingestOffersRequest());
    const second = await service.ingestOffers(product.productId, ingestOffersRequest('same-request-again'));

    expect(first.productId).toBe(product.productId);
    expect(first.offers).toEqual([
      {
        id: expect.stringMatching(UUID_V4_PATTERN),
        sellerName: 'COUPANG',
        sellerUrl: 'https://example.com/coupang',
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
    expect(await priceHistory.findByProductId(product.productId)).toHaveLength(1);
  });

  it('builds judgment context from real snapshots and excludes non CONTENT_VERIFIED snapshots', async () => {
    const { analysisId, productId } = await seedJudgmentReadyAnalysis();

    const result = await service.buildJudgmentInput(analysisId, 'user-1');

    expect(result).toMatchObject({
      analysis_id: analysisId,
      user_id: 'user-1',
      product: {
        product_id: productId,
        identity: {
          normalized_product_name: 'Round Lab Sun Cream',
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
    await expect(service.buildJudgmentInput('00000000-0000-4000-8000-000000000000', 'user-1'))
      .rejects
      .toBeInstanceOf(NotFoundException);
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
              components: [],
            },
            source: {
              source_url: 'https://example.com/coupang',
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
              components: [],
            },
            source: {
              source_url: 'https://example.com/musinsa',
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
      ],
      recommended_offer_id: 'offer-lowest',
      recommendation_reason: 'Lowest verified offer.',
      warnings: [],
      used_fact_ids: ['offer:offer-lowest:price'],
    };
  }

  async function seedJudgmentReadyAnalysis() {
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
          id: 'offer-lowest',
          userEffectivePrice: 9000,
        },
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
          sourceUrl: 'https://example.com/offer-lowest',
          observedAt: '2026-08-10T00:00:00.000Z',
          verificationStatus: 'CONTENT_VERIFIED',
        },
      },
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
