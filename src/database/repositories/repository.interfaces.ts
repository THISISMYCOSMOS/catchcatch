import { Insert, Json, Row, Update } from '../database.types';

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
  upsertMany(inputs: Insert<'seller_offers'>[]): Promise<Row<'seller_offers'>[]>;
}

export interface SellerOfferComponentRepository {
  findBySellerOfferIds(sellerOfferIds: string[]): Promise<Row<'seller_offer_components'>[]>;
  replaceForSellerOffer(
    sellerOfferId: string,
    inputs: Insert<'seller_offer_components'>[],
  ): Promise<Row<'seller_offer_components'>[]>;
}

export interface SellerOfferBenefitRepository {
  findBySellerOfferIds(sellerOfferIds: string[]): Promise<Row<'seller_offer_benefits'>[]>;
  createMany(inputs: Insert<'seller_offer_benefits'>[]): Promise<Row<'seller_offer_benefits'>[]>;
}

export interface PriceHistoryRepository {
  findByProductId(productId: string): Promise<Row<'price_history'>[]>;
  createMany(inputs: Insert<'price_history'>[]): Promise<Row<'price_history'>[]>;
}

export interface SaleCalendarRepository {
  findActive(now: Date): Promise<Row<'sale_calendar'>[]>;
  findUpcoming(now: Date, limit: number): Promise<Row<'sale_calendar'>[]>;
  findAll(): Promise<Row<'sale_calendar'>[]>;
  findById(id: string): Promise<Row<'sale_calendar'> | null>;
}

export type AnalysisPersistencePayload = {
  userId: string;
  productId: string;
  sourceUrl: string;
  idempotencyKey: string | null;
  status: Row<'analyses'>['status'];
  verdict: Row<'analyses'>['verdict'];
  allowedConclusions: Row<'analyses'>['allowed_conclusions'];
  selectedCriteria: Row<'analyses'>['selected_criteria'];
  warningCodes: Row<'analyses'>['warning_codes'];
  resultJson: Json | null;
  offerSnapshots: Omit<Row<'analysis_offers'>, 'id' | 'analysis_id' | 'created_at'>[];
  priceHistoryEntries: Omit<Row<'price_history'>, 'id' | 'analysis_id' | 'created_at'>[];
};

export interface AnalysisPersistenceRepository {
  persistAnalysisAtomically(payload: AnalysisPersistencePayload): Promise<Row<'analyses'>>;
}

export interface AnalysisRepository {
  create(input: Insert<'analyses'>): Promise<Row<'analyses'>>;
  findById(id: string): Promise<Row<'analyses'> | null>;
  findRecentByUserId(userId: string, limit: number): Promise<Row<'analyses'>[]>;
  deleteByIdForUser(id: string, userId: string): Promise<boolean>;
  updateResult(
    id: string,
    input: Pick<
      Update<'analyses'>,
      'status' | 'verdict' | 'allowed_conclusions' | 'result_json' | 'warning_codes'
    >,
  ): Promise<Row<'analyses'>>;
}

export interface AnalysisOfferRepository {
  createMany(inputs: Insert<'analysis_offers'>[]): Promise<Row<'analysis_offers'>[]>;
  findByAnalysisId(analysisId: string): Promise<Row<'analysis_offers'>[]>;
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

export interface UserMembershipRepository {
  findByUserId(userId: string): Promise<Row<'user_memberships'>[]>;
  replaceForUser(
    userId: string,
    inputs: Insert<'user_memberships'>[],
  ): Promise<Row<'user_memberships'>[]>;
}

export interface UserShoppingGradeRepository {
  findByUserId(userId: string): Promise<Row<'user_shopping_grades'>[]>;
  replaceForUser(
    userId: string,
    inputs: Insert<'user_shopping_grades'>[],
  ): Promise<Row<'user_shopping_grades'>[]>;
}

export interface UserCardRepository {
  findByUserId(userId: string): Promise<Row<'user_cards'>[]>;
  replaceForUser(
    userId: string,
    inputs: Insert<'user_cards'>[],
  ): Promise<Row<'user_cards'>[]>;
}

export type SearchQuotaSnapshot = {
  limit: number;
  used: number;
  remaining: number;
  windowStartedAt: string | null;
  resetsAt: string | null;
};

export type SearchQuotaConsumeResult = SearchQuotaSnapshot & {
  allowed: boolean;
  consumed: boolean;
  idempotent: boolean;
};

export interface SearchQuotaRepository {
  findByUserId(userId: string): Promise<Row<'user_search_quotas'> | null>;
  consume(
    userId: string,
    idempotencyKey: string,
    now?: Date,
  ): Promise<SearchQuotaConsumeResult>;
}
