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

export type ResolvedProduct = {
  productId: string;
  brandId: string | null;
};

export type BackendAnalysis = {
  id: string;
  status: string;
  productId: string | null;
  allowedConclusions: string[];
  selectedCriteria: string[];
  warningCodes: string[];
  result: unknown;
};

export type AnalysisRequest = {
  sourceUrl: string;
  idempotencyKey: string;
  authorization: string;
};

export type AnalysisResult = {
  analysisId: string;
  status: 'COMPLETED';
  analysis: BackendAnalysis;
  judgment: unknown;
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
  }): Promise<ProductSearchResult>;
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
