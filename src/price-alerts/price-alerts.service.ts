import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Row } from '../database/database.types';
import {
  PriceAlertRepository,
  ProductRepository,
} from '../database/repositories/repository.interfaces';
import {
  PRICE_ALERT_REPOSITORY,
  PRODUCT_REPOSITORY,
} from '../database/repositories/repository.tokens';

export type PriceAlertResponse = {
  id: string;
  userId: string;
  productId: string;
  targetPrice: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  product: ProductSummary | null;
};

type ProductSummary = {
  id: string;
  canonicalName: string;
  brand: string | null;
  productKey: string;
};

@Injectable()
export class PriceAlertsService {
  constructor(
    @Inject(PRICE_ALERT_REPOSITORY)
    private readonly priceAlerts: PriceAlertRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
  ) {}

  async create(
    userId: string,
    productId: string,
    targetPrice: number | null = null,
  ): Promise<PriceAlertResponse> {
    if (targetPrice !== null && targetPrice < 0) {
      throw new BadRequestException('targetPrice must be greater than or equal to 0');
    }
    const product = await this.findProductOrThrow(productId);
    try {
      const row = await this.priceAlerts.create({
        user_id: userId,
        product_id: productId,
        target_price: targetPrice,
        enabled: true,
      });
      return toPriceAlertResponse(row, product);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create price alert');
    }
  }

  async findByUserId(userId: string): Promise<PriceAlertResponse[]> {
    const rows = await this.priceAlerts.findByUserId(userId);
    return Promise.all(rows.map(async (row) => {
      const product = await this.products.findById(row.product_id);
      return toPriceAlertResponse(row, product);
    }));
  }

  async updateEnabled(alertId: string, enabled: boolean): Promise<PriceAlertResponse> {
    try {
      const row = await this.priceAlerts.updateEnabled(alertId, enabled);
      const product = await this.products.findById(row.product_id);
      return toPriceAlertResponse(row, product);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Price alert not found')) {
        throw new NotFoundException(`Price alert not found: ${alertId}`);
      }
      throw new InternalServerErrorException('Failed to update price alert');
    }
  }

  private async findProductOrThrow(productId: string): Promise<Row<'products'>> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException(`Product not found: ${productId}`);
    }
    return product;
  }
}

function toPriceAlertResponse(
  row: Row<'price_alerts'>,
  product: Row<'products'> | null,
): PriceAlertResponse {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    targetPrice: row.target_price,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    product: product ? toProductSummary(product) : null,
  };
}

function toProductSummary(product: Row<'products'>): ProductSummary {
  return {
    id: product.id,
    canonicalName: product.canonical_name,
    brand: product.brand,
    productKey: product.product_key,
  };
}
