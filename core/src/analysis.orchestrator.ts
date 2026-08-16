import {
  AgentClient,
  AnalysisAccessRequest,
  AnalysisRequest,
  AnalysisResult,
  BackendAnalysis,
  BackendClient,
  RecentAnalysesRequest,
} from './contracts.js';
import { CoreError } from './errors.js';
import { resolveAllowedProductDomains } from './product-url.policy.js';

export class AnalysisOrchestrator {
  constructor(
    private readonly agent: AgentClient,
    private readonly backend: BackendClient,
    private readonly allowedProductDomains: readonly string[],
  ) {}

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const allowedDomains = resolveAllowedProductDomains(
      request.sourceUrl,
      this.allowedProductDomains,
    );
    const identification = await this.agent.identify({
      product_url: request.sourceUrl,
      allowed_domains: allowedDomains,
    });
    if (
      identification.identification_status !== 'IDENTIFIED' ||
      !identification.anchor_product
    ) {
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

    const resolved = await this.backend.resolveProduct({
      sourceUrl: request.sourceUrl,
      identification,
      idempotencyKey: request.idempotencyKey,
      authorization: request.authorization,
    });
    const search = await this.agent.search({
      product_url: request.sourceUrl,
      anchor_product: identification.anchor_product,
      brand_id: resolved.brandId,
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
