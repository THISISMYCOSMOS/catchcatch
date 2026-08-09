import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Row } from '../database/database.types';
import {
  PriceAlertRepository,
  PriceHistoryRepository,
  ProductRepository,
  SavedProductRepository,
  SellerOfferRepository,
} from '../database/repositories/repository.interfaces';
import {
  PRICE_ALERT_REPOSITORY,
  PRICE_HISTORY_REPOSITORY,
  PRODUCT_REPOSITORY,
  SAVED_PRODUCT_REPOSITORY,
  SELLER_OFFER_REPOSITORY,
} from '../database/repositories/repository.tokens';

export type SavedProductResponse = {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
  product: ProductSummary | null;
};

type ProductSummary = {
  id: string;
  canonicalName: string;
  brand: string | null;
  productKey: string;
  imageUrl: string | null;
};

export type SavedProductCardResponse = {
  productId: string;
  canonicalName: string;
  brand: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  previousPrice: number | null;
  discountRate: number | null;
  sellerName: string | null;
  isPriceAlertEnabled: boolean;
  savedAt: string;
};

@Injectable()
export class SavedProductsService {
  constructor(
    @Inject(SAVED_PRODUCT_REPOSITORY)
    private readonly savedProducts: SavedProductRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    @Inject(SELLER_OFFER_REPOSITORY)
    private readonly sellerOffers: SellerOfferRepository,
    @Inject(PRICE_HISTORY_REPOSITORY)
    private readonly priceHistory: PriceHistoryRepository,
    @Inject(PRICE_ALERT_REPOSITORY)
    private readonly priceAlerts: PriceAlertRepository,
  ) {}

  async save(userId: string, productId: string): Promise<SavedProductResponse> {
    const product = await this.findProductOrThrow(productId);
    try {
      const row = await this.savedProducts.save({
        user_id: userId,
        product_id: productId,
      });
      return toSavedProductResponse(row, product);
    } catch (error) {
      throw new InternalServerErrorException('Failed to save product');
    }
  }

  async findByUserId(userId: string): Promise<SavedProductResponse[]> {
    const rows = await this.savedProducts.findByUserId(userId);
    return Promise.all(rows.map(async (row) => {
      const product = await this.products.findById(row.product_id);
      return toSavedProductResponse(row, product);
    }));
  }

  async findCardsByUserId(userId: string): Promise<SavedProductCardResponse[]> {
    const [rows, alerts] = await Promise.all([
      this.savedProducts.findByUserId(userId),
      this.priceAlerts.findByUserId(userId),
    ]);
    const enabledAlertProductIds = new Set(
      alerts.filter((alert) => alert.enabled).map((alert) => alert.product_id),
    );
    const cards = await Promise.all(rows.map(async (row) => {
      const product = await this.products.findById(row.product_id);
      if (!product) {
        return null;
      }
      const [offers, history] = await Promise.all([
        this.sellerOffers.findByProductId(product.id),
        this.priceHistory.findByProductId(product.id),
      ]);
      const lowestOffer = findLowestMarketOffer(offers);
      const currentPrice = lowestOffer?.market_effective_price ?? null;
      const previousPrice = findPreviousPrice(history);
      return {
        productId: product.id,
        canonicalName: product.canonical_name,
        brand: product.brand,
        imageUrl: product.image_url,
        currentPrice,
        previousPrice,
        discountRate: calculateDiscountRate(currentPrice, previousPrice),
        sellerName: lowestOffer?.seller_name ?? null,
        isPriceAlertEnabled: enabledAlertProductIds.has(product.id),
        savedAt: row.created_at,
      };
    }));
    return cards
      .filter((card): card is SavedProductCardResponse => card !== null)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  }

  async remove(userId: string, productId: string): Promise<{ removed: true }> {
    await this.savedProducts.remove(userId, productId);
    return { removed: true };
  }

  private async findProductOrThrow(productId: string): Promise<Row<'products'>> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException(`Product not found: ${productId}`);
    }
    return product;
  }
}

function toSavedProductResponse(
  row: Row<'saved_products'>,
  product: Row<'products'> | null,
): SavedProductResponse {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    createdAt: row.created_at,
    product: product ? toProductSummary(product) : null,
  };
}

function toProductSummary(product: Row<'products'>): ProductSummary {
  return {
    id: product.id,
    canonicalName: product.canonical_name,
    brand: product.brand,
    productKey: product.product_key,
    imageUrl: product.image_url,
  };
}

function findLowestMarketOffer(offers: readonly Row<'seller_offers'>[]): Row<'seller_offers'> | null {
  const pricedOffers = offers.filter((offer) => offer.market_effective_price !== null);
  if (pricedOffers.length === 0) {
    return null;
  }
  return pricedOffers.reduce((lowest, offer) => (
    offer.market_effective_price! < lowest.market_effective_price! ? offer : lowest
  ));
}

function findPreviousPrice(history: readonly Row<'price_history'>[]): number | null {
  const pricedHistory = history
    .filter((row) => row.market_effective_price !== null)
    .sort((left, right) => right.observed_at.localeCompare(left.observed_at));
  return pricedHistory[0]?.market_effective_price ?? null;
}

function calculateDiscountRate(currentPrice: number | null, previousPrice: number | null): number | null {
  if (currentPrice === null || previousPrice === null || previousPrice <= 0) {
    return null;
  }
  return ((previousPrice - currentPrice) / previousPrice) * 100;
}
