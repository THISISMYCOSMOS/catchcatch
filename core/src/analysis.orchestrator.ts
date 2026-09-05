import {
  AgentClient,
  AnalysisAccessRequest,
  AnalysisRequest,
  AnalysisResult,
  BackendAnalysis,
  BackendClient,
  ProductPreviewRequest,
  ProductPreviewResult,
  RecentAnalysesRequest,
} from './contracts.js';
import { CoreError } from './errors.js';
import { resolveProductSourceDomain } from './product-url.policy.js';

export class AnalysisOrchestrator {
  constructor(
    private readonly agent: AgentClient,
    private readonly backend: BackendClient,
  ) {}

  async preview(request: ProductPreviewRequest): Promise<ProductPreviewResult> {
    const allowedDomains = resolveProductSourceDomain(request.sourceUrl);
    const identification = await this.agent.identify({
      product_url: request.sourceUrl,
      allowed_domains: allowedDomains,
    });
    const productName = identification.anchor_product?.normalized_product_name?.trim();
    if (!hasSearchableAnchor(identification) || !productName) {
      throw new CoreError(
        422,
        'PRODUCT_IDENTIFICATION_INCOMPLETE',
        '상품을 확정할 수 없습니다.',
        {
          identificationStatus: identification.identification_status,
          warnings: identification.warnings,
        },
      );
    }

    return {
      sourceUrl: request.sourceUrl,
      productName,
      brand: identification.anchor_product!.brand,
      seller: identification.preview?.seller ?? null,
      listedPrice: identification.preview?.listed_price ?? null,
      imageUrl: identification.preview?.image_url ?? null,
      analysisCategory: identification.analysis_category,
      analysisEligible: !hasNonCosmeticEvidence(identification),
    };
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const allowedDomains = resolveProductSourceDomain(request.sourceUrl);
    const identification = await this.agent.identify({
      product_url: request.sourceUrl,
      allowed_domains: allowedDomains,
    });
    if (!hasSearchableAnchor(identification)) {
      throw new CoreError(
        422,
        'PRODUCT_IDENTIFICATION_INCOMPLETE',
        '상품을 확정할 수 없습니다.',
        {
          identificationStatus: identification.identification_status,
          warnings: identification.warnings,
        },
      );
    }
    // An UNKNOWN category is not a rejection: an identified product can still
    // be compared. Only a page-grounded non-cosmetic classification stops the
    // pipeline. A separate UNKNOWN identification status fails above because
    // it has no usable anchor product to search for.
    if (hasNonCosmeticEvidence(identification)) {
      throw new CoreError(
        422,
        'NON_COSMETIC_PRODUCT',
        '화장품 상품만 분석할 수 있습니다.',
        {
          identificationStatus: identification.identification_status,
          analysisCategory: identification.analysis_category,
          warnings: identification.warnings,
        },
      );
    }

    const resolved = await this.backend.resolveProduct({
      sourceUrl: request.sourceUrl,
      identification,
      idempotencyKey: request.idempotencyKey,
      authorization: request.authorization,
    });
    const search = await this.agent.search({
      product_url: request.sourceUrl,
      anchor_product: identification.anchor_product!,
      brand_id: resolved.brandId,
      cached_seller_offers: resolved.cachedSellerOffers ?? [],
    });
    await this.backend.ingestOffers({
      productId: resolved.productId,
      search,
      idempotencyKey: request.idempotencyKey,
      authorization: request.authorization,
    });
    const initialAnalysis = await this.backend.createAnalysis({
      sourceUrl: request.sourceUrl,
      productId: resolved.productId,
      idempotencyKey: request.idempotencyKey,
      authorization: request.authorization,
    });
    if (this.agent.searchConfigurations && this.backend.saveAlternativeConfigurations) {
      // The configuration list is a separate menu. A temporary failure here
      // must not discard the completed seller comparison or final judgment.
      try {
        const configurationSearch = await this.agent.searchConfigurations({
          product_url: request.sourceUrl,
          anchor_product: identification.anchor_product!,
          brand_id: resolved.brandId,
          cached_seller_offers: resolved.cachedSellerOffers ?? [],
        });
        await this.backend.saveAlternativeConfigurations({
          analysisId: initialAnalysis.id,
          search: configurationSearch,
          authorization: request.authorization,
        });
      } catch {
        // The result page deliberately shows that configuration data is not
        // available rather than manufacturing a fallback candidate.
      }
    }
    if (initialAnalysis.status === 'NEEDS_MORE_DATA') {
      return {
        analysisId: initialAnalysis.id,
        status: 'NEEDS_MORE_DATA',
        analysis: initialAnalysis,
        judgment: null,
      };
    }
    const judgmentInput = await this.backend.getJudgmentInput({
      analysisId: initialAnalysis.id,
      authorization: request.authorization,
    });
    const judgment = await this.agent.judge(judgmentInput);
    const finalized = await this.backend.finalizeJudgment({
      analysisId: initialAnalysis.id,
      judgment,
      authorization: request.authorization,
    });
    if (finalized.status !== 'COMPLETED') {
      throw new CoreError(
        502,
        'ANALYSIS_FINALIZATION_INCOMPLETE',
        '최종 분석 결과가 저장되지 않았습니다.',
      );
    }

    return {
      analysisId: finalized.id,
      status: 'COMPLETED',
      analysis: finalized,
      judgment,
    };
  }

  findRecentAnalyses(request: RecentAnalysesRequest): Promise<BackendAnalysis[]> {
    return this.backend.findRecentAnalyses(request);
  }

  findAnalysis(request: AnalysisAccessRequest): Promise<BackendAnalysis> {
    return this.backend.findAnalysis(request);
  }

  deleteAnalysis(request: AnalysisAccessRequest): Promise<void> {
    return this.backend.deleteAnalysis(request);
  }
}

function hasNonCosmeticEvidence(identification: {
  analysis_category: 'COSMETIC' | 'NON_COSMETIC' | 'UNKNOWN';
  category_evidence: string | null;
}): boolean {
  return identification.analysis_category === 'NON_COSMETIC' &&
    Boolean(identification.category_evidence?.trim());
}

function hasSearchableAnchor(identification: {
  identification_status: 'IDENTIFIED' | 'AMBIGUOUS' | 'UNSUPPORTED' | 'UNKNOWN';
  anchor_product: { brand: string | null; normalized_product_name: string | null; product_type: string | null } | null;
}): boolean {
  return (identification.identification_status === 'IDENTIFIED' || identification.identification_status === 'AMBIGUOUS') &&
    Boolean(
      identification.anchor_product?.brand?.trim() &&
      identification.anchor_product.normalized_product_name?.trim() &&
      identification.anchor_product.product_type?.trim(),
    );
}
