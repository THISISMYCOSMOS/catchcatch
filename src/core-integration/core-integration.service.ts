import { randomUUID } from 'crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Json, Row } from '../database/database.types';
import {
  AnalysisOfferRepository,
  AnalysisRepository,
  ProductComponentRepository,
  ProductRepository,
  SellerOfferRepository,
  UserPreferenceRepository,
} from '../database/repositories/repository.interfaces';
import {
  ANALYSIS_OFFER_REPOSITORY,
  ANALYSIS_REPOSITORY,
  PRODUCT_COMPONENT_REPOSITORY,
  PRODUCT_REPOSITORY,
  SELLER_OFFER_REPOSITORY,
  USER_PREFERENCE_REPOSITORY,
} from '../database/repositories/repository.tokens';
import { AllowedConclusion, CapacityUnit, ComparisonStatus, UserCriterion, Verdict, WarningCode } from '../domain/types';
import { PersistProductDto } from './dto/persist-product.dto';
import { PersistSellerOfferDto } from './dto/persist-seller-offers.dto';
import { SaveJudgmentResultDto } from './dto/save-judgment-result.dto';

export type PersistProductResponse = {
  productId: string;
  reusedExisting: boolean;
};

export type PersistSellerOffersResponse = {
  productId: string;
  offers: SellerOfferPersistenceResponse[];
};

export type SellerOfferPersistenceResponse = {
  id: string;
  sellerName: string;
  sellerUrl: string;
  reusedExisting: boolean;
};

export type JudgmentInputResponse = {
  analysis_id: string;
  user_id: string;
  product: {
    product_id: string;
    identity: {
      brand: string | null;
      normalized_product_name: string | null;
      components: {
        type: string;
        name: string | null;
        capacity_value: number | null;
        capacity_unit: CapacityUnit | null;
        quantity: number | null;
      }[];
    };
  };
  offers: {
    offer_id: string;
    seller: string;
    product_name: string;
    comparison_status: ComparisonStatus;
    public_effective_price: number | null;
    personalized_effective_price: number | null;
    unit_price: number | null;
    shipping_fee: number | null;
    source: {
      source_type: 'SELLER_PAGE';
      source_url: string;
      acquisition_method: 'AI_WEB_SEARCH';
      observed_at: string;
      verification_status: 'CONTENT_VERIFIED';
    };
  }[];
  facts: {
    id: string;
    description: string;
    numeric_values?: number[];
    source_urls: string[];
  }[];
  selected_criteria: UserCriterion[];
  comparison_price_basis: 'PUBLIC' | 'PERSONALIZED';
  cheapest_offer_id: string | null;
  price_history_status: 'SUFFICIENT' | 'INSUFFICIENT' | 'UNAVAILABLE';
  data_quality: {
    status: 'COMPLETE' | 'PARTIAL' | 'LIMITED';
    warnings: string[];
  };
  allowed_conclusions: AllowedConclusion[];
  allowed_offer_ids: string[];
  calculation_result: Json | null;
};

@Injectable()
export class CoreIntegrationService {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    @Inject(PRODUCT_COMPONENT_REPOSITORY)
    private readonly productComponents: ProductComponentRepository,
    @Inject(SELLER_OFFER_REPOSITORY)
    private readonly sellerOffers: SellerOfferRepository,
    @Inject(USER_PREFERENCE_REPOSITORY)
    private readonly preferences: UserPreferenceRepository,
    @Inject(ANALYSIS_REPOSITORY)
    private readonly analyses: AnalysisRepository,
    @Inject(ANALYSIS_OFFER_REPOSITORY)
    private readonly analysisOffers: AnalysisOfferRepository,
  ) {}

  async persistProduct(input: PersistProductDto): Promise<PersistProductResponse> {
    const productKey = input.productKey ?? createProductKey(input.brand ?? null, input.canonicalName);
    const existing = await this.products.findByProductKey(productKey);
    if (existing) {
      return { productId: existing.id, reusedExisting: true };
    }

    const product = await this.products.create({
      id: randomUUID(),
      canonical_name: input.canonicalName,
      brand: input.brand ?? null,
      image_url: input.imageUrl ?? null,
      product_key: productKey,
      package_type: input.packageType ?? null,
    });
    if (input.components?.length) {
      await this.productComponents.createMany(input.components.map((component) => ({
        id: randomUUID(),
        product_id: product.id,
        component_type: component.componentType,
        name: component.name ?? null,
        capacity_value: component.capacityValue ?? null,
        capacity_unit: component.capacityUnit ?? null,
        quantity: component.quantity ?? null,
      })));
    }
    return { productId: product.id, reusedExisting: false };
  }

  async persistSellerOffers(
    productId: string,
    inputs: readonly PersistSellerOfferDto[],
  ): Promise<PersistSellerOffersResponse> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException(`Product not found: ${productId}`);
    }

    const existingOffers = await this.sellerOffers.findByProductId(productId);
    const existingByKey = new Map(existingOffers.map((offer) => [sellerOfferKey(offer), offer]));
    const seenInputKeys = new Set<string>();
    const rowsToCreate = inputs.filter((input) => {
      const key = sellerOfferInputKey(productId, input);
      if (seenInputKeys.has(key) || existingByKey.has(key)) {
        seenInputKeys.add(key);
        return false;
      }
      seenInputKeys.add(key);
      return true;
    }).map((input) => ({
      id: randomUUID(),
      product_id: productId,
      seller_name: input.sellerName,
      seller_url: normalizeUrl(input.sellerUrl),
      listed_price: input.listedPrice ?? null,
      listed_sale_price: input.listedSalePrice ?? null,
      market_effective_price: input.marketEffectivePrice ?? null,
      user_effective_price: null,
      shipping_fee: input.shippingFee ?? null,
      public_discount_amount: input.publicDiscountAmount ?? null,
      automatic_discount_amount: input.automaticDiscountAmount ?? null,
      reward_value: input.rewardValue ?? null,
      official_seller_status: input.officialSellerStatus ?? null,
      return_policy_status: input.returnPolicyStatus ?? null,
      delivery_days: input.deliveryDays ?? null,
      comparison_status: input.comparisonStatus ?? null,
      observed_at: input.observedAt ?? null,
    }));
    const created = await this.sellerOffers.createMany(rowsToCreate);
    const allOffersByKey = new Map<string, { row: Row<'seller_offers'>; reusedExisting: boolean }>();
    for (const offer of existingOffers) {
      allOffersByKey.set(sellerOfferKey(offer), { row: offer, reusedExisting: true });
    }
    for (const offer of created) {
      allOffersByKey.set(sellerOfferKey(offer), { row: offer, reusedExisting: false });
    }
    return {
      productId,
      offers: uniqueBy(inputs, (input) => sellerOfferInputKey(productId, input))
        .map((input) => allOffersByKey.get(sellerOfferInputKey(productId, input)))
        .filter((item): item is { row: Row<'seller_offers'>; reusedExisting: boolean } => item !== undefined)
        .map((item) => ({
          id: item.row.id,
          sellerName: item.row.seller_name,
          sellerUrl: item.row.seller_url,
          reusedExisting: item.reusedExisting,
        })),
    };
  }

  async buildJudgmentInput(analysisId: string, userId: string): Promise<JudgmentInputResponse> {
    const analysis = await this.findOwnedAnalysis(analysisId, userId);
    if (!analysis.product_id) {
      throw new NotFoundException(`Analysis product not found: ${analysisId}`);
    }
    const [product, components, snapshots, preferences] = await Promise.all([
      this.products.findById(analysis.product_id),
      this.productComponents.findByProductId(analysis.product_id),
      this.analysisOffers.findByAnalysisId(analysis.id),
      this.preferences.findByUserId(userId),
    ]);
    if (!product) {
      throw new NotFoundException(`Product not found: ${analysis.product_id}`);
    }
    const selectedCriteria = preferences?.selected_criteria ?? analysis.selected_criteria;
    const allowedOfferIds = snapshots
      .filter((snapshot) => isComparable(snapshot))
      .map((snapshot) => snapshot.seller_identifier);
    return {
      analysis_id: analysis.id,
      user_id: userId,
      product: {
        product_id: product.id,
        identity: {
          brand: product.brand,
          normalized_product_name: product.canonical_name,
          components: components.map((component) => ({
            type: component.component_type,
            name: component.name,
            capacity_value: component.capacity_value,
            capacity_unit: component.capacity_unit,
            quantity: component.quantity,
          })),
        },
      },
      offers: snapshots.map((snapshot) => ({
        offer_id: snapshot.seller_identifier,
        seller: toAiSeller(snapshot.seller_name),
        product_name: product.canonical_name,
        comparison_status: getSnapshotComparisonStatus(snapshot),
        public_effective_price: snapshot.market_effective_price,
        personalized_effective_price: snapshot.user_effective_price,
        unit_price: snapshot.calculated_unit_price,
        shipping_fee: snapshot.shipping_fee,
        source: {
          source_type: 'SELLER_PAGE',
          source_url: getSnapshotSourceUrl(snapshot) ?? analysis.source_url,
          acquisition_method: 'AI_WEB_SEARCH',
          observed_at: getSnapshotObservedAt(snapshot) ?? snapshot.created_at,
          verification_status: 'CONTENT_VERIFIED',
        },
      })),
      facts: buildFacts(analysis, product, snapshots),
      selected_criteria: selectedCriteria,
      comparison_price_basis: snapshots.some((snapshot) => snapshot.user_discount !== null)
        ? 'PERSONALIZED'
        : 'PUBLIC',
      cheapest_offer_id: getCheapestOfferId(analysis.result_json),
      price_history_status: analysis.warning_codes.includes('PRICE_HISTORY_INSUFFICIENT')
        ? 'INSUFFICIENT'
        : snapshots.length === 0 ? 'UNAVAILABLE' : 'SUFFICIENT',
      data_quality: {
        status: snapshots.length === 0 ? 'LIMITED' : analysis.warning_codes.length > 0 ? 'PARTIAL' : 'COMPLETE',
        warnings: analysis.warning_codes,
      },
      allowed_conclusions: analysis.allowed_conclusions,
      allowed_offer_ids: allowedOfferIds,
      calculation_result: analysis.result_json,
    };
  }

  async saveJudgmentResult(
    analysisId: string,
    userId: string,
    input: SaveJudgmentResultDto,
  ) {
    const analysis = await this.findOwnedAnalysis(analysisId, userId);
    const resultJson = {
      ...(isJsonObject(analysis.result_json) ? analysis.result_json : {}),
      aiJudgment: input.resultJson,
      aiMetadata: {
        model: input.model ?? null,
        promptVersion: input.promptVersion ?? null,
      },
    };
    const updated = await this.analyses.updateResult(analysis.id, {
      status: 'COMPLETED',
      verdict: input.verdict ?? null,
      allowed_conclusions: input.allowedConclusions ?? analysis.allowed_conclusions,
      warning_codes: input.warningCodes ?? analysis.warning_codes,
      result_json: resultJson as Json,
    });
    return {
      id: updated.id,
      userId: updated.user_id,
      status: updated.status,
      verdict: updated.verdict,
      allowedConclusions: updated.allowed_conclusions,
      warningCodes: updated.warning_codes,
      result: updated.result_json,
    };
  }

  private async findOwnedAnalysis(analysisId: string, userId: string): Promise<Row<'analyses'>> {
    const analysis = await this.analyses.findById(analysisId);
    if (!analysis) {
      throw new NotFoundException(`Analysis not found: ${analysisId}`);
    }
    if (analysis.user_id !== userId) {
      throw new ForbiddenException('Cannot access another user analysis');
    }
    return analysis;
  }
}

function createProductKey(brand: string | null, canonicalName: string): string {
  return [brand, canonicalName]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, ''))
    .join(':');
}

function sellerOfferKey(offer: Row<'seller_offers'>): string {
  return `${offer.product_id}:${offer.seller_name.trim().toLowerCase()}:${normalizeUrl(offer.seller_url)}`;
}

function sellerOfferInputKey(productId: string, offer: PersistSellerOfferDto): string {
  return `${productId}:${offer.sellerName.trim().toLowerCase()}:${normalizeUrl(offer.sellerUrl)}`;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isJsonObject(value: unknown): value is Record<string, Json | undefined> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getSnapshotValue(snapshot: Row<'analysis_offers'>, key: string): unknown {
  return isJsonObject(snapshot.offer_snapshot) ? snapshot.offer_snapshot[key] : undefined;
}

function getSnapshotComparisonStatus(snapshot: Row<'analysis_offers'>): ComparisonStatus {
  const value = getSnapshotValue(snapshot, 'comparisonStatus');
  return typeof value === 'string' && [
    'DIRECTLY_COMPARABLE',
    'UNIT_COMPARABLE',
    'NOT_COMPARABLE',
    'UNKNOWN',
  ].includes(value) ? value as ComparisonStatus : 'UNKNOWN';
}

function isComparable(snapshot: Row<'analysis_offers'>): boolean {
  const status = getSnapshotComparisonStatus(snapshot);
  return status === 'DIRECTLY_COMPARABLE' || status === 'UNIT_COMPARABLE';
}

function getSnapshotSourceUrl(snapshot: Row<'analysis_offers'>): string | null {
  const value = getSnapshotValue(snapshot, 'sourceUrl');
  return typeof value === 'string' ? value : null;
}

function getSnapshotObservedAt(snapshot: Row<'analysis_offers'>): string | null {
  const value = getSnapshotValue(snapshot, 'observedAt');
  return typeof value === 'string' ? value : null;
}

function toAiSeller(sellerName: string): string {
  const normalized = sellerName.toLowerCase();
  if (normalized.includes('coupang')) {
    return 'COUPANG';
  }
  if (normalized.includes('musinsa')) {
    return 'MUSINSA_BEAUTY';
  }
  if (normalized.includes('olive')) {
    return 'OLIVE_YOUNG';
  }
  return 'BRAND_OFFICIAL';
}

function buildFacts(
  analysis: Row<'analyses'>,
  product: Row<'products'>,
  snapshots: readonly Row<'analysis_offers'>[],
): JudgmentInputResponse['facts'] {
  if (snapshots.length === 0) {
    return [{
      id: `analysis:${analysis.id}:product`,
      description: `${product.canonical_name} analysis has no comparable seller offer snapshots.`,
      source_urls: [analysis.source_url],
    }];
  }
  return snapshots.map((snapshot) => ({
    id: `offer:${snapshot.seller_identifier}:price`,
    description: `${snapshot.seller_name} effective price snapshot for ${product.canonical_name}.`,
    numeric_values: [
      snapshot.market_effective_price,
      snapshot.user_effective_price,
      snapshot.calculated_unit_price,
    ].filter((value): value is number => typeof value === 'number'),
    source_urls: [getSnapshotSourceUrl(snapshot) ?? analysis.source_url],
  }));
}

function getCheapestOfferId(resultJson: Json | null): string | null {
  if (!isJsonObject(resultJson)) {
    return null;
  }
  const lowest = resultJson.lowestEffectivePriceOffer;
  if (!isJsonObject(lowest)) {
    return null;
  }
  return typeof lowest.id === 'string' ? lowest.id : null;
}
