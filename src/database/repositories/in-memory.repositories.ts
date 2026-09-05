import { randomUUID } from 'crypto';
import { validateSelectedCriteria } from '../../domain/calculations';
import { Insert, Json, Row, Update } from '../database.types';
import {
  AnalysisPersistencePayload,
  AnalysisPersistenceRepository,
  AnalysisRepository,
  AnalysisOfferRepository,
  PriceAlertRepository,
  PriceHistoryRepository,
  ProductRepository,
  ProductComponentRepository,
  SaleCalendarRepository,
  SavedProductRepository,
  SellerOfferBenefitRepository,
  SellerOfferComponentRepository,
  SellerOfferRepository,
  SearchQuotaConsumeResult,
  SearchQuotaRepository,
  UserCardRepository,
  UserMembershipRepository,
  UserPreferenceRepository,
  UserShoppingGradeRepository,
} from './repository.interfaces';

type Store = {
  userPreferences: Row<'user_preferences'>[];
  products: Row<'products'>[];
  productComponents: Row<'product_components'>[];
  saleCalendar: Row<'sale_calendar'>[];
  sellerOffers: Row<'seller_offers'>[];
  sellerOfferComponents: Row<'seller_offer_components'>[];
  sellerOfferBenefits: Row<'seller_offer_benefits'>[];
  priceHistory: Row<'price_history'>[];
  analyses: Row<'analyses'>[];
  analysisOffers: Row<'analysis_offers'>[];
  savedProducts: Row<'saved_products'>[];
  priceAlerts: Row<'price_alerts'>[];
  userMemberships: Row<'user_memberships'>[];
  userShoppingGrades: Row<'user_shopping_grades'>[];
  userCards: Row<'user_cards'>[];
  userSearchQuotas: Row<'user_search_quotas'>[];
  userSearchQuotaConsumptions: Row<'user_search_quota_consumptions'>[];
};

export class InMemoryDatabase {
  private sequence = 0;
  readonly store: Store = {
    userPreferences: [],
    products: [],
    productComponents: [],
    saleCalendar: [],
    sellerOffers: [],
    sellerOfferComponents: [],
    sellerOfferBenefits: [],
    priceHistory: [],
    analyses: [],
    analysisOffers: [],
    savedProducts: [],
    priceAlerts: [],
    userMemberships: [],
    userShoppingGrades: [],
    userCards: [],
    userSearchQuotas: [],
    userSearchQuotaConsumptions: [],
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
      image_url: input.image_url ?? null,
      product_key: input.product_key,
      product_type: input.product_type ?? null,
      option: input.option ?? null,
      shade_or_scent: input.shade_or_scent ?? null,
      version_or_renewal: input.version_or_renewal ?? null,
      package_type: input.package_type ?? null,
      created_at: input.created_at ?? now,
      updated_at: input.updated_at ?? now,
    };
    this.database.store.products.push(row);
    return row;
  }
}

export class InMemorySaleCalendarRepository implements SaleCalendarRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findActive(now: Date): Promise<Row<'sale_calendar'>[]> {
    return sortSaleRows(this.database.store.saleCalendar.filter((row) => (
      row.is_active &&
      new Date(row.starts_at) <= now &&
      new Date(row.ends_at) >= now
    )));
  }

  async findUpcoming(now: Date, limit: number): Promise<Row<'sale_calendar'>[]> {
    return sortSaleRows(this.database.store.saleCalendar.filter((row) => (
      row.is_active &&
      new Date(row.starts_at) > now
    ))).slice(0, limit);
  }

  async findAll(): Promise<Row<'sale_calendar'>[]> {
    return sortSaleRows(this.database.store.saleCalendar);
  }

  async findById(id: string): Promise<Row<'sale_calendar'> | null> {
    return this.database.store.saleCalendar.find((row) => row.id === id) ?? null;
  }

  create(input: Insert<'sale_calendar'>): Row<'sale_calendar'> {
    const now = nowIso();
    const row: Row<'sale_calendar'> = {
      id: input.id ?? this.database.nextId('sale-calendar'),
      seller_code: input.seller_code,
      seller_name: input.seller_name,
      title: input.title,
      description: input.description ?? null,
      sale_type: input.sale_type,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      banner_image_url: input.banner_image_url ?? null,
      landing_url: input.landing_url ?? null,
      is_active: input.is_active ?? true,
      priority: input.priority ?? 0,
      created_at: input.created_at ?? now,
      updated_at: input.updated_at ?? now,
    };
    this.database.store.saleCalendar.push(row);
    return row;
  }
}

export class InMemoryProductComponentRepository implements ProductComponentRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findByProductId(productId: string): Promise<Row<'product_components'>[]> {
    return this.database.store.productComponents.filter((row) => row.product_id === productId);
  }

  async createMany(inputs: Insert<'product_components'>[]): Promise<Row<'product_components'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    const rows = inputs.map((input) => {
      const row: Row<'product_components'> = {
        id: input.id ?? this.database.nextId('product-component'),
        product_id: input.product_id,
        component_type: input.component_type,
        name: input.name ?? null,
        capacity_value: input.capacity_value ?? null,
        capacity_unit: input.capacity_unit ?? null,
        quantity: input.quantity ?? null,
        physical_type: input.physical_type ?? 'UNKNOWN',
        commercial_inclusion: input.commercial_inclusion ?? 'UNKNOWN',
        product_identity: input.product_identity ?? 'UNKNOWN',
        verification_status: input.verification_status ?? 'UNKNOWN',
        created_at: input.created_at ?? nowIso(),
      };
      return row;
    });
    this.database.store.productComponents.push(...rows);
    return rows;
  }
}

export class InMemorySellerOfferRepository implements SellerOfferRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findByProductId(productId: string): Promise<Row<'seller_offers'>[]> {
    return this.database.store.sellerOffers.filter((row) => row.product_id === productId && row.is_active);
  }

  async findAllByProductId(productId: string): Promise<Row<'seller_offers'>[]> {
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

  async upsertMany(inputs: Insert<'seller_offers'>[]): Promise<Row<'seller_offers'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    if (inputs.some(hasNegativeSellerOfferPrice)) {
      throw new Error('Seller offer prices cannot be negative');
    }
    const rows: Row<'seller_offers'>[] = [];
    for (const input of inputs) {
      const existing = this.database.store.sellerOffers.find((row) => (
        sellerOfferIdentityKey(row) === sellerOfferIdentityKey(input)
      ));
      if (existing) {
        Object.assign(existing, {
          listed_price: input.listed_price ?? null,
          listed_sale_price: input.listed_sale_price ?? null,
          market_effective_price: input.market_effective_price ?? null,
          user_effective_price: input.user_effective_price ?? null,
          shipping_fee: input.shipping_fee ?? null,
          public_discount_amount: input.public_discount_amount ?? null,
          automatic_discount_amount: input.automatic_discount_amount ?? null,
          reward_value: input.reward_value ?? null,
          official_seller_status: input.official_seller_status ?? null,
          return_policy_status: input.return_policy_status ?? null,
          delivery_days: input.delivery_days ?? null,
          comparison_status: input.comparison_status ?? null,
          app_benefit_advertised: input.app_benefit_advertised ?? false,
          is_active: input.is_active ?? true,
          ...(input.purchase_url === undefined ? {} : { purchase_url: input.purchase_url }),
          observed_at: input.observed_at ?? null,
          source_verification_status: input.source_verification_status ?? 'UNKNOWN',
          selected_option_verification_status: input.selected_option_verification_status ?? 'UNKNOWN',
          paid_configuration_verification_status: input.paid_configuration_verification_status ?? 'UNKNOWN',
          verification_reason_codes: input.verification_reason_codes ?? [],
        });
        rows.push(existing);
        continue;
      }
      const row = sellerOfferRow(input, this.database);
      this.database.store.sellerOffers.push(row);
      rows.push(row);
    }
    return rows;
  }

  async deactivateExcept(productId: string, activeOfferIds: string[]): Promise<void> {
    const activeIds = new Set(activeOfferIds);
    for (const row of this.database.store.sellerOffers) {
      if (row.product_id === productId && !activeIds.has(row.id)) {
        row.is_active = false;
      }
    }
  }
}

export class InMemorySearchQuotaRepository implements SearchQuotaRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findByUserId(userId: string): Promise<Row<'user_search_quotas'> | null> {
    return this.database.store.userSearchQuotas.find((row) => row.user_id === userId) ?? null;
  }

  async consume(
    userId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<SearchQuotaConsumeResult> {
    const existingConsumption = this.database.store.userSearchQuotaConsumptions.find((row) => (
      row.user_id === userId && row.idempotency_key === idempotencyKey
    ));
    if (existingConsumption) {
      return toSearchQuotaConsumeResult(
        getOrCreateReadableQuota(this.database, userId, now),
        true,
        false,
      );
    }

    const quota = getOrCreateConsumableQuota(this.database, userId, now);
    if (quota.used_count >= quota.limit_count) {
      return toSearchQuotaConsumeResult(quota, false, false);
    }

    quota.used_count += 1;
    quota.updated_at = now.toISOString();
    this.database.store.userSearchQuotaConsumptions.push({
      user_id: userId,
      idempotency_key: idempotencyKey,
      consumed_at: now.toISOString(),
      window_started_at: quota.window_started_at,
    });
    return toSearchQuotaConsumeResult(quota, false, true);
  }
}

export class InMemorySellerOfferComponentRepository implements SellerOfferComponentRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findBySellerOfferIds(sellerOfferIds: string[]): Promise<Row<'seller_offer_components'>[]> {
    if (sellerOfferIds.length === 0) {
      return [];
    }
    const ids = new Set(sellerOfferIds);
    return this.database.store.sellerOfferComponents.filter((row) => ids.has(row.seller_offer_id));
  }

  async replaceForSellerOffer(
    sellerOfferId: string,
    inputs: Insert<'seller_offer_components'>[],
  ): Promise<Row<'seller_offer_components'>[]> {
    this.database.store.sellerOfferComponents = this.database.store.sellerOfferComponents.filter((row) => (
      row.seller_offer_id !== sellerOfferId
    ));
    const rows = uniqueBy(inputs, sellerOfferComponentInputKey).map((input) => ({
      id: input.id ?? this.database.nextId('seller-offer-component'),
      seller_offer_id: sellerOfferId,
      component_type: input.component_type,
      name: input.name ?? null,
      capacity_value: input.capacity_value ?? null,
      capacity_unit: input.capacity_unit ?? null,
      quantity: input.quantity ?? null,
      physical_type: input.physical_type ?? 'UNKNOWN',
      commercial_inclusion: input.commercial_inclusion ?? 'UNKNOWN',
      product_identity: input.product_identity ?? 'UNKNOWN',
      verification_status: input.verification_status ?? 'UNKNOWN',
      created_at: input.created_at ?? nowIso(),
    }));
    this.database.store.sellerOfferComponents.push(...rows);
    return rows;
  }
}

export class InMemorySellerOfferBenefitRepository implements SellerOfferBenefitRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findBySellerOfferIds(sellerOfferIds: string[]): Promise<Row<'seller_offer_benefits'>[]> {
    if (sellerOfferIds.length === 0) {
      return [];
    }
    const ids = new Set(sellerOfferIds);
    return this.database.store.sellerOfferBenefits.filter((row) => ids.has(row.seller_offer_id));
  }

  async createMany(inputs: Insert<'seller_offer_benefits'>[]): Promise<Row<'seller_offer_benefits'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    if (inputs.some((input) => input.discount_amount < 0)) {
      throw new Error('Seller offer benefit discount_amount cannot be negative');
    }

    const created: Row<'seller_offer_benefits'>[] = [];
    for (const input of uniqueBy(inputs, sellerOfferBenefitInputKey)) {
      const existing = this.database.store.sellerOfferBenefits.find((row) => (
        sellerOfferBenefitRowKey(row) === sellerOfferBenefitInputKey(input)
      ));
      if (existing) {
        created.push(existing);
        continue;
      }

      const row: Row<'seller_offer_benefits'> = {
        id: input.id ?? this.database.nextId('seller-offer-benefit'),
        seller_offer_id: input.seller_offer_id,
        benefit_type: input.benefit_type,
        provider: input.provider ?? null,
        required_membership_type: input.required_membership_type ?? null,
        required_grade: input.required_grade ?? null,
        required_card_issuer: input.required_card_issuer ?? null,
        required_card_product_code: input.required_card_product_code ?? null,
        discount_amount: input.discount_amount,
        exclusive_group: input.exclusive_group ?? null,
        enabled: input.enabled ?? true,
        created_at: input.created_at ?? nowIso(),
      };
      this.database.store.sellerOfferBenefits.push(row);
      created.push(row);
    }
    return created;
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
        analysis_id: input.analysis_id ?? null,
        seller_offer_id: input.seller_offer_id ?? null,
        market_effective_price: input.market_effective_price ?? null,
        listed_price: input.listed_price ?? null,
        listed_sale_price: input.listed_sale_price ?? null,
        is_sale_observation: input.is_sale_observation ?? false,
        observation_key: input.observation_key ?? priceHistoryObservationKey(input),
        observed_at: input.observed_at,
        created_at: input.created_at ?? nowIso(),
      };
      return row;
    });
    const created: Row<'price_history'>[] = [];
    for (const row of rows) {
      const existing = this.database.store.priceHistory.find((candidate) => (
        priceHistoryObservationKey(candidate) === priceHistoryObservationKey(row)
      ));
      if (existing) {
        created.push(existing);
        continue;
      }
      this.database.store.priceHistory.push(row);
      created.push(row);
    }
    return created;
  }
}

export class InMemoryAnalysisPersistenceRepository implements AnalysisPersistenceRepository {
  failAfterAnalysisInsert = false;
  failAfterOfferSnapshots = false;
  failAfterPriceHistory = false;

  constructor(private readonly database = new InMemoryDatabase()) {}

  async persistAnalysisAtomically(payload: AnalysisPersistencePayload): Promise<Row<'analyses'>> {
    const snapshot = cloneStore(this.database.store);
    try {
      const existing = payload.idempotencyKey === null
        ? null
        : this.database.store.analyses.find((row) => (
          row.user_id === payload.userId &&
          row.idempotency_key === payload.idempotencyKey
        )) ?? null;
      if (existing) {
        if (existing.status !== 'FAILED') {
          return existing;
        }
        this.database.store.analysisOffers = this.database.store.analysisOffers
          .filter((row) => row.analysis_id !== existing.id);
        this.database.store.priceHistory = this.database.store.priceHistory
          .filter((row) => row.analysis_id !== existing.id);
      }

      const now = nowIso();
      const analysis: Row<'analyses'> = existing ?? {
        id: randomUUID(),
        user_id: payload.userId,
        idempotency_key: payload.idempotencyKey,
        source_url: payload.sourceUrl,
        product_id: payload.productId,
        status: 'PENDING',
        verdict: null,
        allowed_conclusions: [],
        selected_criteria: validateSelectedCriteria(payload.selectedCriteria),
        result_json: null,
        warning_codes: [],
        created_at: now,
        updated_at: now,
        expires_at: addDays(new Date(now), 7).toISOString(),
      };
      analysis.user_id = payload.userId;
      analysis.idempotency_key = payload.idempotencyKey;
      analysis.source_url = payload.sourceUrl;
      analysis.product_id = payload.productId;
      analysis.status = 'PENDING';
      analysis.verdict = null;
      analysis.allowed_conclusions = [];
      analysis.selected_criteria = validateSelectedCriteria(payload.selectedCriteria);
      analysis.result_json = null;
      analysis.warning_codes = [];
      analysis.updated_at = now;
      if (existing) {
        analysis.expires_at = addDays(new Date(now), 7).toISOString();
      }
      if (!existing) {
        this.database.store.analyses.push(analysis);
      }
      if (this.failAfterAnalysisInsert) {
        throw new Error('Injected failure after analysis insert');
      }

      const analysisOfferRepository = new InMemoryAnalysisOfferRepository(this.database);
      await analysisOfferRepository.createMany(payload.offerSnapshots.map((snapshot) => ({
        ...snapshot,
        analysis_id: analysis.id,
      })));
      if (this.failAfterOfferSnapshots) {
        throw new Error('Injected failure after analysis offer snapshots');
      }

      const priceHistoryRepository = new InMemoryPriceHistoryRepository(this.database);
      await priceHistoryRepository.createMany(
        uniqueBy(
          payload.priceHistoryEntries.map((entry) => ({
            ...entry,
            analysis_id: analysis.id,
          })),
          priceHistoryRunKey,
        ),
      );
      if (this.failAfterPriceHistory) {
        throw new Error('Injected failure after price history');
      }

      analysis.status = payload.status;
      analysis.verdict = payload.verdict;
      analysis.allowed_conclusions = payload.allowedConclusions;
      analysis.warning_codes = payload.warningCodes;
      analysis.result_json = payload.resultJson;
      analysis.updated_at = nowIso();
      return analysis;
    } catch (error) {
      restoreStore(this.database.store, snapshot);
      throw error;
    }
  }
}

export class InMemoryAnalysisRepository implements AnalysisRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async create(input: Insert<'analyses'>): Promise<Row<'analyses'>> {
    const now = nowIso();
    const row: Row<'analyses'> = {
      id: input.id ?? randomUUID(),
      user_id: input.user_id ?? null,
      idempotency_key: input.idempotency_key ?? null,
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
      expires_at: input.expires_at ?? addDays(new Date(input.created_at ?? now), 7).toISOString(),
    };
    this.database.store.analyses.push(row);
    return row;
  }

  async findById(id: string): Promise<Row<'analyses'> | null> {
    return this.database.store.analyses.find((row) => (
      row.id === id && isActiveAnalysis(row)
    )) ?? null;
  }

  async findRecentByUserId(userId: string, limit: number): Promise<Row<'analyses'>[]> {
    return this.database.store.analyses
      .map((row, insertionIndex) => ({ row, insertionIndex }))
      .filter(({ row }) => row.user_id === userId && isActiveAnalysis(row))
      .sort((left, right) => (
        right.row.created_at.localeCompare(left.row.created_at) ||
        right.insertionIndex - left.insertionIndex
      ))
      .slice(0, limit)
      .map(({ row }) => row);
  }

  async deleteByIdForUser(id: string, userId: string): Promise<boolean> {
    const index = this.database.store.analyses.findIndex((row) => (
      row.id === id && row.user_id === userId && isActiveAnalysis(row)
    ));
    if (index < 0) {
      return false;
    }
    this.database.store.analyses.splice(index, 1);
    this.database.store.analysisOffers = this.database.store.analysisOffers
      .filter((row) => row.analysis_id !== id);
    for (const row of this.database.store.priceHistory) {
      if (row.analysis_id === id) {
        row.analysis_id = null;
      }
    }
    return true;
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

export class InMemoryAnalysisOfferRepository implements AnalysisOfferRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async createMany(inputs: Insert<'analysis_offers'>[]): Promise<Row<'analysis_offers'>[]> {
    if (inputs.length === 0) {
      return [];
    }

    const now = nowIso();
    const created: Row<'analysis_offers'>[] = [];
    for (const input of uniqueBy(inputs, analysisOfferKey)) {
      const existing = this.database.store.analysisOffers.find((row) => (
        row.analysis_id === input.analysis_id &&
        row.seller_identifier === input.seller_identifier
      ));
      if (existing) {
        created.push(existing);
        continue;
      }

      const row: Row<'analysis_offers'> = {
        id: input.id ?? this.database.nextId('analysis-offer'),
        analysis_id: input.analysis_id,
        seller_offer_id: input.seller_offer_id ?? null,
        seller_identifier: input.seller_identifier,
        seller_name: input.seller_name,
        original_list_price: input.original_list_price ?? null,
        sale_price: input.sale_price ?? null,
        market_effective_price: input.market_effective_price ?? null,
        user_effective_price: input.user_effective_price ?? null,
        shipping_fee: input.shipping_fee ?? null,
        public_discount: input.public_discount ?? null,
        user_discount: input.user_discount ?? null,
        quantity: input.quantity ?? null,
        total_amount: input.total_amount ?? null,
        unit: input.unit ?? null,
        calculated_unit_price: input.calculated_unit_price ?? null,
        offer_snapshot: input.offer_snapshot,
        created_at: input.created_at ?? now,
      };
      this.database.store.analysisOffers.push(row);
      created.push(row);
    }
    return created;
  }

  async findByAnalysisId(analysisId: string): Promise<Row<'analysis_offers'>[]> {
    return this.database.store.analysisOffers.filter((row) => row.analysis_id === analysisId);
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

export class InMemoryUserMembershipRepository implements UserMembershipRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findByUserId(userId: string): Promise<Row<'user_memberships'>[]> {
    return this.database.store.userMemberships.filter((row) => row.user_id === userId);
  }

  async replaceForUser(
    userId: string,
    inputs: Insert<'user_memberships'>[],
  ): Promise<Row<'user_memberships'>[]> {
    this.database.store.userMemberships = this.database.store.userMemberships.filter((row) => (
      row.user_id !== userId
    ));
    const now = nowIso();
    const rows = uniqueBy(inputs, (input) => `${input.provider}:${input.membership_type}`)
      .map((input) => ({
        id: input.id ?? this.database.nextId('user-membership'),
        user_id: userId,
        provider: input.provider,
        membership_type: input.membership_type,
        enabled: input.enabled ?? true,
        created_at: input.created_at ?? now,
        updated_at: input.updated_at ?? now,
      }));
    this.database.store.userMemberships.push(...rows);
    return rows;
  }
}

export class InMemoryUserShoppingGradeRepository implements UserShoppingGradeRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findByUserId(userId: string): Promise<Row<'user_shopping_grades'>[]> {
    return this.database.store.userShoppingGrades.filter((row) => row.user_id === userId);
  }

  async replaceForUser(
    userId: string,
    inputs: Insert<'user_shopping_grades'>[],
  ): Promise<Row<'user_shopping_grades'>[]> {
    this.database.store.userShoppingGrades = this.database.store.userShoppingGrades.filter((row) => (
      row.user_id !== userId
    ));
    const now = nowIso();
    const rows = uniqueBy(inputs, (input) => input.provider)
      .map((input) => ({
        id: input.id ?? this.database.nextId('user-shopping-grade'),
        user_id: userId,
        provider: input.provider,
        grade: input.grade,
        created_at: input.created_at ?? now,
        updated_at: input.updated_at ?? now,
      }));
    this.database.store.userShoppingGrades.push(...rows);
    return rows;
  }
}

export class InMemoryUserCardRepository implements UserCardRepository {
  constructor(private readonly database = new InMemoryDatabase()) {}

  async findByUserId(userId: string): Promise<Row<'user_cards'>[]> {
    return this.database.store.userCards.filter((row) => row.user_id === userId);
  }

  async replaceForUser(
    userId: string,
    inputs: Insert<'user_cards'>[],
  ): Promise<Row<'user_cards'>[]> {
    this.database.store.userCards = this.database.store.userCards.filter((row) => row.user_id !== userId);
    const rows = uniqueBy(inputs, (input) => `${input.issuer}:${input.card_product_code}`)
      .map((input) => ({
        id: input.id ?? this.database.nextId('user-card'),
        user_id: userId,
        issuer: input.issuer,
        card_product_code: input.card_product_code,
        created_at: input.created_at ?? nowIso(),
      }));
    this.database.store.userCards.push(...rows);
    return rows;
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
    listed_sale_price: input.listed_sale_price ?? null,
    market_effective_price: input.market_effective_price ?? null,
    user_effective_price: input.user_effective_price ?? null,
    shipping_fee: input.shipping_fee ?? null,
    public_discount_amount: input.public_discount_amount ?? null,
    automatic_discount_amount: input.automatic_discount_amount ?? null,
    reward_value: input.reward_value ?? null,
    official_seller_status: input.official_seller_status ?? null,
    return_policy_status: input.return_policy_status ?? null,
    delivery_days: input.delivery_days ?? null,
    comparison_status: input.comparison_status ?? null,
    app_benefit_advertised: input.app_benefit_advertised ?? false,
    is_active: input.is_active ?? true,
    purchase_url: input.purchase_url ?? null,
    observed_at: input.observed_at ?? null,
    source_verification_status: input.source_verification_status ?? 'UNKNOWN',
    selected_option_verification_status: input.selected_option_verification_status ?? 'UNKNOWN',
    paid_configuration_verification_status: input.paid_configuration_verification_status ?? 'UNKNOWN',
    verification_reason_codes: input.verification_reason_codes ?? [],
    created_at: input.created_at ?? nowIso(),
  };
}

function sellerOfferIdentityKey(input: Pick<Row<'seller_offers'>, 'product_id' | 'seller_name' | 'seller_url'>): string {
  return `${input.product_id}:${input.seller_name.trim().toLowerCase()}:${input.seller_url.trim().replace(/\/+$/, '').toLowerCase()}`;
}

function hasNegativeSellerOfferPrice(input: Insert<'seller_offers'>): boolean {
  return (
    (input.listed_price ?? 0) < 0 ||
    (input.listed_sale_price ?? 0) < 0 ||
    (input.market_effective_price ?? 0) < 0 ||
    (input.user_effective_price ?? 0) < 0 ||
    (input.shipping_fee ?? 0) < 0 ||
    (input.public_discount_amount ?? 0) < 0 ||
    (input.automatic_discount_amount ?? 0) < 0 ||
    (input.reward_value ?? 0) < 0
  );
}

function cloneStore(store: Store): Store {
  return JSON.parse(JSON.stringify(store)) as Store;
}

function restoreStore(target: Store, source: Store): void {
  target.userPreferences = source.userPreferences;
  target.products = source.products;
  target.productComponents = source.productComponents;
  target.saleCalendar = source.saleCalendar;
  target.sellerOffers = source.sellerOffers;
  target.sellerOfferComponents = source.sellerOfferComponents;
  target.sellerOfferBenefits = source.sellerOfferBenefits;
  target.priceHistory = source.priceHistory;
  target.analyses = source.analyses;
  target.analysisOffers = source.analysisOffers;
  target.savedProducts = source.savedProducts;
  target.priceAlerts = source.priceAlerts;
  target.userMemberships = source.userMemberships;
  target.userShoppingGrades = source.userShoppingGrades;
  target.userCards = source.userCards;
  target.userSearchQuotas = source.userSearchQuotas;
  target.userSearchQuotaConsumptions = source.userSearchQuotaConsumptions;
}

function getOrCreateReadableQuota(
  database: InMemoryDatabase,
  userId: string,
  now: Date,
): Row<'user_search_quotas'> {
  return database.store.userSearchQuotas.find((row) => row.user_id === userId) ??
    createQuotaRow(database, userId, now, 0);
}

function getOrCreateConsumableQuota(
  database: InMemoryDatabase,
  userId: string,
  now: Date,
): Row<'user_search_quotas'> {
  const existing = database.store.userSearchQuotas.find((row) => row.user_id === userId);
  if (!existing) {
    return createQuotaRow(database, userId, now, 0);
  }
  if (new Date(existing.window_expires_at).getTime() <= now.getTime()) {
    existing.window_started_at = now.toISOString();
    existing.window_expires_at = addDays(now, 14).toISOString();
    existing.used_count = 0;
    existing.limit_count = 10;
    existing.updated_at = now.toISOString();
  }
  return existing;
}

function createQuotaRow(
  database: InMemoryDatabase,
  userId: string,
  now: Date,
  usedCount: number,
): Row<'user_search_quotas'> {
  const row: Row<'user_search_quotas'> = {
    user_id: userId,
    window_started_at: now.toISOString(),
    window_expires_at: addDays(now, 14).toISOString(),
    used_count: usedCount,
    limit_count: 10,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  database.store.userSearchQuotas.push(row);
  return row;
}

function toSearchQuotaConsumeResult(
  quota: Row<'user_search_quotas'>,
  idempotent: boolean,
  consumed: boolean,
): SearchQuotaConsumeResult {
  return {
    allowed: quota.used_count < quota.limit_count || consumed || idempotent,
    consumed,
    idempotent,
    limit: quota.limit_count,
    used: quota.used_count,
    remaining: Math.max(quota.limit_count - quota.used_count, 0),
    windowStartedAt: quota.window_started_at,
    resetsAt: quota.window_expires_at,
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isActiveAnalysis(row: Row<'analyses'>, now = new Date()): boolean {
  return new Date(row.expires_at).getTime() > now.getTime();
}

function sortSaleRows(rows: readonly Row<'sale_calendar'>[]): Row<'sale_calendar'>[] {
  return [...rows].sort((left, right) => (
    left.priority - right.priority ||
    left.starts_at.localeCompare(right.starts_at)
  ));
}

function nowIso(): string {
  return new Date().toISOString();
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

function analysisOfferKey(input: Insert<'analysis_offers'>): string {
  return `${input.analysis_id}:${input.seller_identifier}`;
}

function priceHistoryRunKey(input: Insert<'price_history'>): string {
  return priceHistoryObservationKey(input);
}

function priceHistoryObservationKey(
  input: Pick<
    Insert<'price_history'>,
    'product_id' | 'seller_offer_id' | 'observed_at' | 'market_effective_price' | 'observation_key'
  >,
): string {
  if (input.observation_key) {
    return input.observation_key;
  }
  return [
    input.product_id,
    input.seller_offer_id ?? '',
    input.observed_at,
    input.market_effective_price ?? '',
  ].join(':');
}

function sellerOfferComponentInputKey(input: Insert<'seller_offer_components'>): string {
  return [
    input.component_type,
    input.name ?? '',
    input.capacity_value ?? '',
    input.capacity_unit ?? '',
    input.quantity ?? '',
    input.physical_type ?? 'UNKNOWN',
    input.commercial_inclusion ?? 'UNKNOWN',
    input.product_identity ?? 'UNKNOWN',
    input.verification_status ?? 'UNKNOWN',
  ].join(':');
}

function sellerOfferBenefitInputKey(input: Insert<'seller_offer_benefits'>): string {
  return [
    input.seller_offer_id,
    input.benefit_type,
    input.provider ?? '',
    input.required_membership_type ?? '',
    input.required_grade ?? '',
    input.required_card_issuer ?? '',
    input.required_card_product_code ?? '',
    input.discount_amount,
    input.exclusive_group ?? '',
  ].join(':');
}

function sellerOfferBenefitRowKey(row: Row<'seller_offer_benefits'>): string {
  return [
    row.seller_offer_id,
    row.benefit_type,
    row.provider ?? '',
    row.required_membership_type ?? '',
    row.required_grade ?? '',
    row.required_card_issuer ?? '',
    row.required_card_product_code ?? '',
    row.discount_amount,
    row.exclusive_group ?? '',
  ].join(':');
}
