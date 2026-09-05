export type ProductComponent = {
  type: 'MAIN' | 'REFILL' | 'MINI' | 'TRAVEL' | 'OTHER_COSMETIC' | 'NON_COSMETIC_GIFT';
  name: string | null;
  capacity_value: number | null;
  capacity_unit: 'ML' | 'G' | null;
  quantity: number | null;
};

export type ProductIdentity = {
  brand: string | null;
  normalized_product_name: string | null;
  product_type: string | null;
  option: string | null;
  shade_or_scent: string | null;
  version_or_renewal: string | null;
  components: ProductComponent[];
};

export type ProductIdentificationResult = {
  identification_status: 'IDENTIFIED' | 'AMBIGUOUS' | 'UNSUPPORTED' | 'UNKNOWN';
  analysis_category: 'COSMETIC' | 'NON_COSMETIC' | 'UNKNOWN';
  category_evidence: string | null;
  anchor_product: ProductIdentity | null;
  preview: {
    seller: 'OLIVE_YOUNG' | 'MUSINSA_BEAUTY' | 'COUPANG' | 'BRAND_OFFICIAL' | null;
    listed_price: number | null;
    image_url: string | null;
  } | null;
  source: Record<string, unknown> | null;
  warnings: string[];
};

export type ProductSearchResult = {
  anchor_product: ProductIdentity;
  seller_results: Array<Record<string, unknown>>;
  warnings: string[];
};

export type ProductConfigurationSearchResult = {
  anchor_product: ProductIdentity;
  seller_results: Array<Record<string, unknown>>;
  warnings: string[];
};

export type CachedSellerOffer = {
  seller: 'OLIVE_YOUNG' | 'MUSINSA_BEAUTY' | 'COUPANG' | 'ZIGZAG' | 'BRAND_OFFICIAL';
  source_url: string;
  observed_at: string;
  candidate_offer: {
    product_name: string | null;
    brand: string | null;
    product_type: string | null;
    option: string | null;
    shade_or_scent: string | null;
    version_or_renewal: string | null;
    list_price: number | null;
    listed_sale_price: number | null;
    public_coupon_amount: number | null;
    automatic_discount_amount: number | null;
    shipping_fee: number | null;
    discount_conditions: string[];
    shipping_condition: string | null;
    components: ProductComponent[];
  };
};

export type ResolvedProduct = {
  productId: string;
  brandId: string | null;
  cachedSellerOffers?: CachedSellerOffer[];
};

export type BackendAnalysis = {
  id: string;
  sourceUrl?: string;
  status: string;
  productId: string | null;
  allowedConclusions: string[];
  selectedCriteria: string[];
  warningCodes: string[];
  result: unknown;
  createdAt?: string;
  expiresAt?: string;
  verdict?: string | null;
  product?: {
    id: string;
    canonicalName: string;
    brand: string | null;
    productKey: string;
    packageType: string | null;
    imageUrl: string | null;
  } | null;
  analysisOffers?: Array<{
    id: string;
    sellerOfferId: string | null;
    sellerIdentifier: string;
    sellerName: string;
    originalListPrice: number | null;
    salePrice: number | null;
    marketEffectivePrice: number | null;
    userEffectivePrice: number | null;
    shippingFee: number | null;
    calculatedUnitPrice: number | null;
    offerSnapshot: unknown;
    createdAt: string;
  }>;
};

export type AnalysisRequest = {
  sourceUrl: string;
  idempotencyKey: string;
  authorization: string;
};

export type AnalysisResult = {
  analysisId: string;
  status: 'COMPLETED' | 'NEEDS_MORE_DATA';
  analysis: BackendAnalysis;
  judgment: unknown | null;
};

export type ProductPreviewRequest = {
  sourceUrl: string;
  authorization: string;
};

export type ProductPreviewResult = {
  sourceUrl: string;
  productName: string;
  brand: string | null;
  seller: string | null;
  listedPrice: number | null;
  imageUrl: string | null;
  analysisCategory: 'COSMETIC' | 'NON_COSMETIC' | 'UNKNOWN';
  analysisEligible: boolean;
};

export type AnalysisAccessRequest = {
  analysisId: string;
  authorization: string;
};

export type RecentAnalysesRequest = {
  authorization: string;
  limit?: string;
};

export interface AgentClient {
  identify(input: {
    product_url: string;
    allowed_domains: string[];
  }): Promise<ProductIdentificationResult>;
  search(input: {
    product_url: string;
    anchor_product: ProductIdentity;
    brand_id: string | null;
    cached_seller_offers: CachedSellerOffer[];
  }): Promise<ProductSearchResult>;
  searchConfigurations?(input: {
    product_url: string;
    anchor_product: ProductIdentity;
    brand_id: string | null;
    cached_seller_offers: CachedSellerOffer[];
  }): Promise<ProductConfigurationSearchResult>;
  judge(input: unknown): Promise<unknown>;
}

export interface BackendClient {
  resolveProduct(input: {
    sourceUrl: string;
    identification: ProductIdentificationResult;
    idempotencyKey: string;
    authorization: string;
  }): Promise<ResolvedProduct>;
  ingestOffers(input: {
    productId: string;
    search: ProductSearchResult;
    idempotencyKey: string;
    authorization: string;
  }): Promise<void>;
  createAnalysis(input: {
    sourceUrl: string;
    productId: string;
    idempotencyKey: string;
    authorization: string;
  }): Promise<BackendAnalysis>;
  saveAlternativeConfigurations?(input: {
    analysisId: string;
    search: ProductConfigurationSearchResult;
    authorization: string;
  }): Promise<void>;
  getJudgmentInput(input: {
    analysisId: string;
    authorization: string;
  }): Promise<unknown>;
  finalizeJudgment(input: {
    analysisId: string;
    judgment: unknown;
    authorization: string;
  }): Promise<BackendAnalysis>;
  findRecentAnalyses(input: RecentAnalysesRequest): Promise<BackendAnalysis[]>;
  findAnalysis(input: AnalysisAccessRequest): Promise<BackendAnalysis>;
  deleteAnalysis(input: AnalysisAccessRequest): Promise<void>;
}
