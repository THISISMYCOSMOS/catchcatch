import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Row } from '../database/database.types';
import {
  ProductRepository,
  SavedProductRepository,
} from '../database/repositories/repository.interfaces';
import {
  PRODUCT_REPOSITORY,
  SAVED_PRODUCT_REPOSITORY,
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
};

@Injectable()
export class SavedProductsService {
  constructor(
    @Inject(SAVED_PRODUCT_REPOSITORY)
    private readonly savedProducts: SavedProductRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
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
  };
}
