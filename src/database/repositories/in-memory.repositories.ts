import { validateSelectedCriteria } from '../../domain/calculations';
import { Insert, Json, Row, Update } from '../database.types';
import {
  AnalysisRepository,
  PriceAlertRepository,
  PriceHistoryRepository,
  ProductRepository,
  SavedProductRepository,
  SellerOfferRepository,
  UserPreferenceRepository,
} from './repository.interfaces';

type Store = {
  userPreferences: Row<'user_preferences'>[];
  products: Row<'products'>[];
  sellerOffers: Row<'seller_offers'>[];
  priceHistory: Row<'price_history'>[];
  analyses: Row<'analyses'>[];
  savedProducts: Row<'saved_products'>[];
  priceAlerts: Row<'price_alerts'>[];
};

export class InMemoryDatabase {
  private sequence = 0;
  readonly store: Store = {
    userPreferences: [],
    products: [],
    sellerOffers: [],
    priceHistory: [],
    analyses: [],
    savedProducts: [],
    priceAlerts: [],
  };

  nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}

export class InMemoryUserPreferenceRepository implements UserPreferenceRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findByUserId(userId: string): Promise<Row<'user_preferences'> | null> {
    return this.database.store.userPreferences.find((row) => row.user_id === userId) ?? null;
  }

  async upsert(input: Insert<'user_preferences'>): Promise<Row<'user_preferences'>> {
    const selectedCriteria = validateSelectedCriteria(input.selected_criteria);
    const now = nowIso();
    const existing = this.database.store.userPreferences.find((row) => row.user_id === input.user_id);
    if (existing) {
      existing.selected_criteria = selectedCriteria;
      existing.updated_at = input.updated_at ?? now;
      return existing;
    }
    const row: Row<'user_preferences'> = {
      id: input.id ?? this.database.nextId('user-preference'),
      user_id: input.user_id,
      selected_criteria: selectedCriteria,
      created_at: input.created_at ?? now,
      updated_at: input.updated_at ?? now,
    };
    this.database.store.userPreferences.push(row);
    return row;
  }
}

export class InMemoryProductRepository implements ProductRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findById(id: string): Promise<Row<'products'> | null> {
    return this.database.store.products.find((row) => row.id === id) ?? null;
  }

  async findByProductKey(productKey: string): Promise<Row<'products'> | null> {
    return this.database.store.products.find((row) => row.product_key === productKey) ?? null;
  }

  async create(input: Insert<'products'>): Promise<Row<'products'>> {
    if (await this.findByProductKey(input.product_key)) {
      throw new Error(`Product already exists for product_key: ${input.product_key}`);
    }
    const now = nowIso();
    const row: Row<'products'> = {
      id: input.id ?? this.database.nextId('product'),
      canonical_name: input.canonical_name,
      brand: input.brand ?? null,
      product_key: input.product_key,
      package_type: input.package_type ?? null,
      created_at: input.created_at ?? now,
      updated_at: input.updated_at ?? now,
    };
    this.database.store.products.push(row);
    return row;
  }
}

export class InMemorySellerOfferRepository implements SellerOfferRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findByProductId(productId: string): Promise<Row<'seller_offers'>[]> {
    return this.database.store.sellerOffers.filter((row) => row.product_id === productId);
  }

  async createMany(inputs: Insert<'seller_offers'>[]): Promise<Row<'seller_offers'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    if (inputs.some(hasNegativeSellerOfferPrice)) {
      throw new Error('Seller offer prices cannot be negative');
    }
    const rows = inputs.map((input) => sellerOfferRow(input, this.database));
    this.database.store.sellerOffers.push(...rows);
    return rows;
  }
}

export class InMemoryPriceHistoryRepository implements PriceHistoryRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findByProductId(productId: string): Promise<Row<'price_history'>[]> {
    return this.database.store.priceHistory
      .filter((row) => row.product_id === productId)
      .sort((left, right) => left.observed_at.localeCompare(right.observed_at));
  }

  async createMany(inputs: Insert<'price_history'>[]): Promise<Row<'price_history'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    if (inputs.some((input) => (input.market_effective_price ?? 0) < 0)) {
      throw new Error('Price history market_effective_price cannot be negative');
    }
    const rows = inputs.map((input) => {
      const row: Row<'price_history'> = {
        id: input.id ?? this.database.nextId('price-history'),
        product_id: input.product_id,
        seller_offer_id: input.seller_offer_id ?? null,
        market_effective_price: input.market_effective_price ?? null,
        observed_at: input.observed_at,
        created_at: input.created_at ?? nowIso(),
      };
      return row;
    });
    this.database.store.priceHistory.push(...rows);
    return rows;
  }
}

export class InMemoryAnalysisRepository implements AnalysisRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async create(input: Insert<'analyses'>): Promise<Row<'analyses'>> {
    const now = nowIso();
    const row: Row<'analyses'> = {
      id: input.id ?? this.database.nextId('analysis'),
      user_id: input.user_id ?? null,
      source_url: input.source_url,
      product_id: input.product_id ?? null,
      status: input.status,
      verdict: input.verdict ?? null,
      allowed_conclusions: input.allowed_conclusions ?? [],
      selected_criteria: validateSelectedCriteria(input.selected_criteria),
      result_json: input.result_json ?? null,
      warning_codes: input.warning_codes ?? [],
      created_at: input.created_at ?? now,
      updated_at: input.updated_at ?? now,
    };
    this.database.store.analyses.push(row);
    return row;
  }

  async findById(id: string): Promise<Row<'analyses'> | null> {
    return this.database.store.analyses.find((row) => row.id === id) ?? null;
  }

  async updateResult(
    id: string,
    input: Pick<
      Update<'analyses'>,
      'status' | 'verdict' | 'allowed_conclusions' | 'result_json' | 'warning_codes'
    >,
  ): Promise<Row<'analyses'>> {
    const row = await this.findById(id);
    if (!row) {
      throw new Error(`Analysis not found: ${id}`);
    }
    row.status = input.status ?? row.status;
    row.verdict = input.verdict ?? row.verdict;
    row.allowed_conclusions = input.allowed_conclusions ?? row.allowed_conclusions;
    row.result_json = input.result_json === undefined ? row.result_json : input.result_json as Json | null;
    row.warning_codes = input.warning_codes ?? row.warning_codes;
    row.updated_at = nowIso();
    return row;
  }
}

export class InMemorySavedProductRepository implements SavedProductRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async save(input: Insert<'saved_products'>): Promise<Row<'saved_products'>> {
    const existing = this.database.store.savedProducts.find((row) => (
      row.user_id === input.user_id && row.product_id === input.product_id
    ));
    if (existing) {
      return existing;
    }
    const row: Row<'saved_products'> = {
      id: input.id ?? this.database.nextId('saved-product'),
      user_id: input.user_id,
      product_id: input.product_id,
      created_at: input.created_at ?? nowIso(),
    };
    this.database.store.savedProducts.push(row);
    return row;
  }

  async findByUserId(userId: string): Promise<Row<'saved_products'>[]> {
    return this.database.store.savedProducts.filter((row) => row.user_id === userId);
  }

  async remove(userId: string, productId: string): Promise<void> {
    this.database.store.savedProducts = this.database.store.savedProducts.filter((row) => (
      row.user_id !== userId || row.product_id !== productId
    ));
  }
}

export class InMemoryPriceAlertRepository implements PriceAlertRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async create(input: Insert<'price_alerts'>): Promise<Row<'price_alerts'>> {
    if ((input.target_price ?? 0) < 0) {
      throw new Error('Price alert target_price cannot be negative');
    }
    const now = nowIso();
    const row: Row<'price_alerts'> = {
      id: input.id ?? this.database.nextId('price-alert'),
      user_id: input.user_id,
      product_id: input.product_id,
      target_price: input.target_price ?? null,
      enabled: input.enabled ?? true,
      created_at: input.created_at ?? now,
      updated_at: input.updated_at ?? now,
    };
    this.database.store.priceAlerts.push(row);
    return row;
  }

  async findByUserId(userId: string): Promise<Row<'price_alerts'>[]> {
    return this.database.store.priceAlerts.filter((row) => row.user_id === userId);
  }

  async updateEnabled(id: string, enabled: boolean): Promise<Row<'price_alerts'>> {
    const row = this.database.store.priceAlerts.find((candidate) => candidate.id === id);
    if (!row) {
      throw new Error(`Price alert not found: ${id}`);
    }
    row.enabled = enabled;
    row.updated_at = nowIso();
    return row;
  }
}

function sellerOfferRow(
  input: Insert<'seller_offers'>,
  database: InMemoryDatabase,
): Row<'seller_offers'> {
  return {
    id: input.id ?? database.nextId('seller-offer'),
    product_id: input.product_id,
    seller_name: input.seller_name,
    seller_url: input.seller_url,
    listed_price: input.listed_price ?? null,
    market_effective_price: input.market_effective_price ?? null,
    user_effective_price: input.user_effective_price ?? null,
    official_seller_status: input.official_seller_status ?? null,
    return_policy_status: input.return_policy_status ?? null,
    delivery_days: input.delivery_days ?? null,
    comparison_status: input.comparison_status ?? null,
    observed_at: input.observed_at ?? null,
    created_at: input.created_at ?? nowIso(),
  };
}

function hasNegativeSellerOfferPrice(input: Insert<'seller_offers'>): boolean {
  return (
    (input.listed_price ?? 0) < 0 ||
    (input.market_effective_price ?? 0) < 0 ||
    (input.user_effective_price ?? 0) < 0
  );
}

function nowIso(): string {
  return new Date().toISOString();
}
