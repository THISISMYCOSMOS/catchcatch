import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  InMemoryAnalysisOfferRepository,
  InMemoryAnalysisRepository,
  InMemoryDatabase,
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
  let preferences: InMemoryUserPreferenceRepository;
  let analyses: InMemoryAnalysisRepository;
  let analysisOffers: InMemoryAnalysisOfferRepository;
  let service: CoreIntegrationService;

  beforeEach(() => {
    database = new InMemoryDatabase();
    products = new InMemoryProductRepository(database);
    components = new InMemoryProductComponentRepository(database);
    sellerOffers = new InMemorySellerOfferRepository(database);
    preferences = new InMemoryUserPreferenceRepository(database);
    analyses = new InMemoryAnalysisRepository(database);
    analysisOffers = new InMemoryAnalysisOfferRepository(database);
    service = new CoreIntegrationService(
      products,
      components,
      sellerOffers,
      preferences,
      analyses,
      analysisOffers,
    );
  });

  it('persists a product, returns a UUID productId, and reuses the same product key', async () => {
    const first = await service.persistProduct({
      canonicalName: 'Round Lab Sun Cream',
      brand: 'Round Lab',
      components: [
        {
          componentType: 'MAIN',
          capacityValue: 50,
          capacityUnit: 'ML',
          quantity: 1,
        },
      ],
    });
    const second = await service.persistProduct({
      canonicalName: 'Round Lab Sun Cream',
      brand: 'Round Lab',
    });

    expect(first.productId).toMatch(UUID_V4_PATTERN);
    expect(second).toEqual({
      productId: first.productId,
      reusedExisting: true,
    });
    expect(await products.findById(first.productId)).toMatchObject({
      canonical_name: 'Round Lab Sun Cream',
    });
    expect(await components.findByProductId(first.productId)).toHaveLength(1);
  });

  it('persists seller offers, returns stored offer IDs, and prevents duplicate product seller URL rows', async () => {
    const product = await service.persistProduct({
      canonicalName: 'Product',
      productKey: 'product-key',
    });

    const first = await service.persistSellerOffers(product.productId, [
      {
        sellerName: 'Coupang',
        sellerUrl: 'https://example.com/offer/',
        listedPrice: 12000,
        listedSalePrice: 11000,
        marketEffectivePrice: 10000,
        shippingFee: 0,
        comparisonStatus: 'DIRECTLY_COMPARABLE',
      },
      {
        sellerName: 'Musinsa',
        sellerUrl: 'https://example.com/musinsa',
        listedPrice: 13000,
        listedSalePrice: 12500,
        marketEffectivePrice: 12500,
        shippingFee: 0,
        comparisonStatus: 'UNIT_COMPARABLE',
      },
    ]);
    const second = await service.persistSellerOffers(product.productId, [
      {
        sellerName: 'Coupang',
        sellerUrl: 'https://example.com/offer',
        listedPrice: 99999,
      },
    ]);

    expect(first.offers).toHaveLength(2);
    expect(first.offers[0]).toMatchObject({
      sellerName: 'Coupang',
      sellerUrl: 'https://example.com/offer',
      reusedExisting: false,
    });
    expect(second.offers).toEqual([
      {
        id: first.offers[0].id,
        sellerName: 'Coupang',
        sellerUrl: 'https://example.com/offer',
        reusedExisting: true,
      },
    ]);
    expect(await sellerOffers.findByProductId(product.productId)).toHaveLength(2);
  });

  it('builds judgment input from persisted analysis values and does not call AI', async () => {
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
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0]).toMatchObject({
      offer_id: 'offer-lowest',
      seller: 'COUPANG',
      public_effective_price: 10000,
      personalized_effective_price: 9000,
      unit_price: 180,
    });
    expect(result.allowed_offer_ids).toEqual(['offer-lowest', 'offer-second']);
    expect(result.facts[0].numeric_values).toContain(9000);
  });

  it('saves AI judgment result into the existing analysis row and returns the verdict/result_json', async () => {
    const { analysisId } = await seedJudgmentReadyAnalysis();

    const saved = await service.saveJudgmentResult(analysisId, 'user-1', {
      verdict: 'LOW_POINT_BUY',
      resultJson: {
        decision_status: 'DECIDED',
        conclusion_reason: 'Fixture judgment from Core integration test.',
        recommended_offer_id: 'offer-lowest',
      },
      model: 'test-model',
      promptVersion: 'test-prompt',
    });

    expect(saved).toMatchObject({
      id: analysisId,
      status: 'COMPLETED',
      verdict: 'LOW_POINT_BUY',
    });
    expect(saved.result).toMatchObject({
      lowestEffectivePriceOffer: { id: 'offer-lowest' },
      aiJudgment: {
        decision_status: 'DECIDED',
        recommended_offer_id: 'offer-lowest',
      },
      aiMetadata: {
        model: 'test-model',
        promptVersion: 'test-prompt',
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

  it('enforces analysis ownership for judgment input and result persistence', async () => {
    const { analysisId } = await seedJudgmentReadyAnalysis();

    await expect(service.buildJudgmentInput(analysisId, 'user-2'))
      .rejects
      .toBeInstanceOf(ForbiddenException);
    await expect(service.saveJudgmentResult(analysisId, 'user-2', {
      verdict: 'LOW_POINT_BUY',
      resultJson: { decision_status: 'DECIDED' },
    }))
      .rejects
      .toBeInstanceOf(ForbiddenException);
    await expect(service.buildJudgmentInput('00000000-0000-4000-8000-000000000000', 'user-1'))
      .rejects
      .toBeInstanceOf(NotFoundException);
  });

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
        seller_name: 'Coupang',
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
        },
      },
      {
        analysis_id: analysis.id,
        seller_identifier: 'offer-second',
        seller_name: 'Musinsa',
        original_list_price: 13000,
        sale_price: 12500,
        market_effective_price: 12500,
        user_effective_price: 12500,
        shipping_fee: 0,
        public_discount: null,
        user_discount: null,
        quantity: 1,
        total_amount: 50,
        unit: 'ML',
        calculated_unit_price: 250,
        offer_snapshot: {
          comparisonStatus: 'UNIT_COMPARABLE',
          sourceUrl: 'https://example.com/offer-second',
          observedAt: '2026-08-10T00:00:00.000Z',
        },
      },
    ]);
    return { analysisId: analysis.id, productId: product.id };
  }
});
