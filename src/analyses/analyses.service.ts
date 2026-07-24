import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  calculateAllowedConclusions,
  compareOfferToAnchor,
  findLowestEffectivePriceOffer,
  findLowestUnitPriceOffer,
  isPriceHistorySufficient,
} from '../domain/offer-analysis';
import { PriceHistoryPoint, ProductComponent, SellerOffer } from '../domain/types';
import { Json, Row } from '../database/database.types';
import {
  AnalysisRepository,
  PriceHistoryRepository,
  ProductComponentRepository,
  ProductRepository,
  SellerOfferRepository,
  UserPreferenceRepository,
} from '../database/repositories/repository.interfaces';
import {
  ANALYSIS_REPOSITORY,
  PRICE_HISTORY_REPOSITORY,
  PRODUCT_COMPONENT_REPOSITORY,
  PRODUCT_REPOSITORY,
  SELLER_OFFER_REPOSITORY,
  USER_PREFERENCE_REPOSITORY,
} from '../database/repositories/repository.tokens';

export type CreateAnalysisInput = {
  userId: string;
  sourceUrl: string;
  productId: string;
};

export type AnalysisCalculationResult = {
  lowestEffectivePriceOffer: { id: string; userEffectivePrice: number | null } | null;
  lowestUnitPriceOffer: { id: string; unit: 'ML' | 'G'; unitPrice: number } | null;
  unitPriceComparison: {
    ml: { id: string; unitPrice: number } | null;
    g: { id: string; unitPrice: number } | null;
  };
  priceHistorySufficient: boolean;
  offerCount: number;
};

export type AnalysisResponse = {
  id: string;
  userId: string | null;
  sourceUrl: string;
  productId: string | null;
  status: string;
  verdict: string | null;
  allowedConclusions: string[];
  selectedCriteria: string[];
  warningCodes: string[];
  result: Json | null;
};

@Injectable()
export class AnalysesService {
  constructor(
    @Inject(USER_PREFERENCE_REPOSITORY)
    private readonly preferences: UserPreferenceRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    @Inject(PRODUCT_COMPONENT_REPOSITORY)
    private readonly productComponents: ProductComponentRepository,
    @Inject(SELLER_OFFER_REPOSITORY)
    private readonly sellerOffers: SellerOfferRepository,
    @Inject(PRICE_HISTORY_REPOSITORY)
    private readonly priceHistory: PriceHistoryRepository,
    @Inject(ANALYSIS_REPOSITORY)
    private readonly analyses: AnalysisRepository,
  ) {}

  async create(input: CreateAnalysisInput): Promise<AnalysisResponse> {
    const preferences = await this.preferences.findByUserId(input.userId);
    if (!preferences) {
      throw new NotFoundException(`User preferences not found: ${input.userId}`);
    }

    const product = await this.products.findById(input.productId);
    if (!product) {
      throw new NotFoundException(`Product not found: ${input.productId}`);
    }

    const pending = await this.analyses.create({
      user_id: input.userId,
      source_url: input.sourceUrl,
      product_id: input.productId,
      status: 'PENDING',
      verdict: null,
      allowed_conclusions: [],
      selected_criteria: preferences.selected_criteria,
      warning_codes: [],
      result_json: null,
    });

    try {
      const result = await this.calculateResult(product);
      const completed = await this.analyses.updateResult(pending.id, {
        status: 'COMPLETED',
        verdict: null,
        allowed_conclusions: result.allowedConclusions,
        warning_codes: result.warningCodes,
        result_json: result.resultJson,
      });
      return toAnalysisResponse(completed);
    } catch (error) {
      await this.analyses.updateResult(pending.id, {
        status: 'FAILED',
        verdict: null,
        allowed_conclusions: [],
        warning_codes: ['OTHER'],
        result_json: null,
      });
      throw new InternalServerErrorException('Analysis calculation failed');
    }
  }

  async findById(id: string): Promise<AnalysisResponse> {
    const row = await this.analyses.findById(id);
    if (!row) {
      throw new NotFoundException(`Analysis not found: ${id}`);
    }
    return toAnalysisResponse(row);
  }

  private async calculateResult(product: Row<'products'>): Promise<{
    allowedConclusions: Row<'analyses'>['allowed_conclusions'];
    warningCodes: Row<'analyses'>['warning_codes'];
    resultJson: Json;
  }> {
    const [componentRows, offerRows, historyRows] = await Promise.all([
      this.productComponents.findByProductId(product.id),
      this.sellerOffers.findByProductId(product.id),
      this.priceHistory.findByProductId(product.id),
    ]);
    const components = componentRows.map(toProductComponent);
    const domainOffers = offerRows.map((offer) => toDomainOffer(product, offer, components));
    const anchorOffer = domainOffers[0] ?? toAnchorOffer(product, components);
    const comparisonResults = domainOffers.map((offer) => compareOfferToAnchor(anchorOffer, offer));
    const lowestEffectivePriceOffer = findLowestEffectivePriceOffer(domainOffers, comparisonResults);
    const lowestMlUnitPrice = findLowestUnitPriceOffer(domainOffers, comparisonResults, 'ML');
    const lowestGUnitPrice = findLowestUnitPriceOffer(domainOffers, comparisonResults, 'G');
    const lowestUnitPrice = lowestMlUnitPrice ?? lowestGUnitPrice;
    const priceHistoryPoints = historyRows.map(toPriceHistoryPoint);
    const analysisDate = new Date();
    const priceHistorySufficient = isPriceHistorySufficient(priceHistoryPoints, analysisDate);
    const recentAveragePrice = averagePrice(historyRows);
    const previousSalePrice = historyRows.at(-1)?.market_effective_price ?? null;
    const currentMarketEffectivePrice = lowestEffectivePriceOffer?.userEffectivePrice ?? null;
    const allowedConclusions = calculateAllowedConclusions({
      offers: domainOffers,
      anchorOffer,
      priceHistory: priceHistoryPoints,
      currentMarketEffectivePrice,
      recentAveragePrice,
      previousSalePrice,
      hasSufficientCompositionData: false,
      hasSetOrGiftEvidence: false,
    }, analysisDate);
    const warningCodes: Row<'analyses'>['warning_codes'] = priceHistorySufficient
      ? []
      : ['PRICE_HISTORY_INSUFFICIENT'];
    const result: AnalysisCalculationResult = {
      lowestEffectivePriceOffer: lowestEffectivePriceOffer
        ? {
            id: lowestEffectivePriceOffer.id,
            userEffectivePrice: lowestEffectivePriceOffer.userEffectivePrice,
          }
        : null,
      lowestUnitPriceOffer: lowestUnitPrice
        ? {
            id: lowestUnitPrice.offer.id,
            unit: lowestUnitPrice.unit,
            unitPrice: lowestUnitPrice.unitPrice,
          }
        : null,
      unitPriceComparison: {
        ml: lowestMlUnitPrice
          ? { id: lowestMlUnitPrice.offer.id, unitPrice: lowestMlUnitPrice.unitPrice }
          : null,
        g: lowestGUnitPrice
          ? { id: lowestGUnitPrice.offer.id, unitPrice: lowestGUnitPrice.unitPrice }
          : null,
      },
      priceHistorySufficient,
      offerCount: offerRows.length,
    };

    return {
      allowedConclusions,
      warningCodes,
      resultJson: result as unknown as Json,
    };
  }
}

function toAnalysisResponse(row: Row<'analyses'>): AnalysisResponse {
  return {
    id: row.id,
    userId: row.user_id,
    sourceUrl: row.source_url,
    productId: row.product_id,
    status: row.status,
    verdict: row.verdict,
    allowedConclusions: row.allowed_conclusions,
    selectedCriteria: row.selected_criteria,
    warningCodes: row.warning_codes,
    result: row.result_json,
  };
}

function toDomainOffer(
  product: Row<'products'>,
  offer: Row<'seller_offers'>,
  components: readonly ProductComponent[],
): SellerOffer {
  return {
    id: offer.id,
    productKey: product.product_key,
    userEffectivePrice: offer.user_effective_price,
    components,
    officialSellerStatus: offer.official_seller_status ?? 'unconfirmed',
    returnPolicyStatus: offer.return_policy_status ?? 'unconfirmed',
    deliveryDays: offer.delivery_days,
    packageType: product.package_type ?? 'unknown',
  };
}

function toAnchorOffer(
  product: Row<'products'>,
  components: readonly ProductComponent[],
): SellerOffer {
  return {
    id: `anchor:${product.id}`,
    productKey: product.product_key,
    userEffectivePrice: null,
    components,
    officialSellerStatus: 'unconfirmed',
    returnPolicyStatus: 'unconfirmed',
    deliveryDays: null,
    packageType: product.package_type ?? 'unknown',
  };
}

function toProductComponent(row: Row<'product_components'>): ProductComponent {
  return {
    type: row.component_type,
    capacityValue: row.capacity_value,
    capacityUnit: row.capacity_unit,
    quantity: row.quantity,
  };
}

function toPriceHistoryPoint(row: Row<'price_history'>): PriceHistoryPoint {
  return {
    observedAt: new Date(row.observed_at),
    marketEffectivePrice: row.market_effective_price,
  };
}

function averagePrice(rows: readonly Row<'price_history'>[]): number | null {
  const prices = rows
    .map((row) => row.market_effective_price)
    .filter((price): price is number => price !== null);
  if (prices.length === 0) {
    return null;
  }
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}
