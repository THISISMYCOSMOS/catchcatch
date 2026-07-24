import { Insert, Row, Update } from '../database.types';

export interface UserPreferenceRepository {
  findByUserId(userId: string): Promise<Row<'user_preferences'> | null>;
  upsert(input: Insert<'user_preferences'>): Promise<Row<'user_preferences'>>;
}

export interface ProductRepository {
  findById(id: string): Promise<Row<'products'> | null>;
  findByProductKey(productKey: string): Promise<Row<'products'> | null>;
  create(input: Insert<'products'>): Promise<Row<'products'>>;
}

export interface ProductComponentRepository {
  findByProductId(productId: string): Promise<Row<'product_components'>[]>;
  createMany(inputs: Insert<'product_components'>[]): Promise<Row<'product_components'>[]>;
}

export interface SellerOfferRepository {
  findByProductId(productId: string): Promise<Row<'seller_offers'>[]>;
  createMany(inputs: Insert<'seller_offers'>[]): Promise<Row<'seller_offers'>[]>;
}

export interface PriceHistoryRepository {
  findByProductId(productId: string): Promise<Row<'price_history'>[]>;
  createMany(inputs: Insert<'price_history'>[]): Promise<Row<'price_history'>[]>;
}

export interface AnalysisRepository {
  create(input: Insert<'analyses'>): Promise<Row<'analyses'>>;
  findById(id: string): Promise<Row<'analyses'> | null>;
  updateResult(
    id: string,
    input: Pick<
      Update<'analyses'>,
      'status' | 'verdict' | 'allowed_conclusions' | 'result_json' | 'warning_codes'
    >,
  ): Promise<Row<'analyses'>>;
}

export interface SavedProductRepository {
  save(input: Insert<'saved_products'>): Promise<Row<'saved_products'>>;
  findByUserId(userId: string): Promise<Row<'saved_products'>[]>;
  remove(userId: string, productId: string): Promise<void>;
}

export interface PriceAlertRepository {
  create(input: Insert<'price_alerts'>): Promise<Row<'price_alerts'>>;
  findByUserId(userId: string): Promise<Row<'price_alerts'>[]>;
  updateEnabled(id: string, enabled: boolean): Promise<Row<'price_alerts'>>;
}
