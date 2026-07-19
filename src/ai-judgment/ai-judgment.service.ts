import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  AiJudgment,
  aiJudgmentSchema,
  JudgmentInput,
  judgmentInputSchema,
} from './ai-judgment.schema';
import {
  buildJudgmentPrompt,
  CATCHCATCH_JUDGMENT_CORRECTION_INSTRUCTIONS,
  CATCHCATCH_JUDGMENT_INSTRUCTIONS,
} from './ai-judgment.prompt';

@Injectable()
export class AiJudgmentService {
  private readonly logger = new Logger(AiJudgmentService.name);

  constructor(private readonly config: ConfigService) {}

  async judge(rawInput: JudgmentInput): Promise<AiJudgment> {
    const input = judgmentInputSchema.parse(rawInput);
    const mode = this.config.get<string>('AI_JUDGMENT_MODE', 'real');

    if (mode === 'mock') {
      return this.createMockJudgment(input);
    }

    if (mode !== 'real') {
      throw new ServiceUnavailableException('AI_JUDGMENT_MODE must be real or mock');
    }

    return this.createRealJudgment(input);
  }

  private async createRealJudgment(input: JudgmentInput): Promise<AiJudgment> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is required in real mode');
    }

    const client = new OpenAI({
      apiKey,
      timeout: Number(this.config.get<string>('OPENAI_TIMEOUT_MS', '20000')),
      maxRetries: 0,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const correction = attempt === 1
          ? `\n\n${CATCHCATCH_JUDGMENT_CORRECTION_INSTRUCTIONS}`
          : '';
        const response = await client.responses.parse({
          model: this.config.get<string>('OPENAI_MODEL', 'gpt-5.6'),
          instructions: `${CATCHCATCH_JUDGMENT_INSTRUCTIONS}${correction}`,
          input: buildJudgmentPrompt(input),
          store: false,
          text: {
            format: zodTextFormat(aiJudgmentSchema, 'catchcatch_judgment'),
          },
        });

        if (!response.output_parsed) {
          throw new Error('OpenAI returned no parsed output');
        }

        return validateAiJudgmentBusinessRules(input, response.output_parsed);
      } catch (error) {
        if (error instanceof OpenAI.APIError) {
          this.logger.error(
            `OpenAI request failed: status=${error.status}, code=${error.code ?? 'unknown'}, request_id=${error.requestID ?? 'unknown'}`,
          );
          throw new ServiceUnavailableException('AI_JUDGMENT_FAILED');
        }
        if (attempt === 1) {
          this.logger.error('OpenAI response validation failed after one retry');
        }
      }
    }

    throw new ServiceUnavailableException('AI_JUDGMENT_FAILED');
  }

  private createMockJudgment(input: JudgmentInput): AiJudgment {
    const hasAllowedConclusion = input.allowed_conclusions.length > 0;
    const decisionStatus = hasAllowedConclusion
      ? 'DECIDED' as const
      : 'INSUFFICIENT_EVIDENCE' as const;
    const conclusion = input.allowed_conclusions[0] ?? null;
    const recommendedOfferId = hasAllowedConclusion
      ? input.allowed_offer_ids[0] ?? null
      : null;
    const confidenceLevel = !hasAllowedConclusion
      ? 'LOW'
      : input.data_quality.status === 'COMPLETE' &&
      input.data_quality.warnings.length === 0
      ? 'HIGH'
      : input.data_quality.status === 'LIMITED'
        ? 'LOW'
        : 'MEDIUM';
    const confidenceFactId = input.facts[0].id;

    return {
      evidence_review: {
        supporting_fact_ids: hasAllowedConclusion
          ? input.facts.map((fact) => fact.id)
          : [],
        contradicting_fact_ids: [],
        missing_evidence: hasAllowedConclusion
          ? []
          : ['허용된 구매 결론을 뒷받침할 검증 근거'],
      },
      decision_status: decisionStatus,
      conclusion,
      conclusion_reason: hasAllowedConclusion
        ? '테스트용 검증 사실을 바탕으로 생성한 mock 판단입니다.'
        : '허용된 결론을 뒷받침할 근거가 없어 판단을 유보한 mock 결과입니다.',
      confidence: {
        level: confidenceLevel,
        reason: '테스트 입력의 데이터 품질 상태를 반영한 mock 신뢰도입니다.',
        used_fact_ids: [confidenceFactId],
      },
      criteria_results: input.criterion_assessments.map((assessment) => ({
        criterion: assessment.criterion,
        status: assessment.status,
        reason: '자동 테스트를 위한 결정적 mock 결과입니다.',
        used_fact_ids: assessment.fact_ids,
      })),
      recommended_offer_id: recommendedOfferId,
      recommendation_reason: recommendedOfferId
        ? '허용된 판매처 후보 중 첫 번째 항목을 선택했습니다.'
        : hasAllowedConclusion
          ? '추천 가능한 판매처 후보가 없습니다.'
          : '판단 근거가 충분하지 않아 판매처를 추천하지 않습니다.',
      warnings: ['실제 OpenAI API를 호출하지 않은 mock 결과입니다.'],
      used_fact_ids: input.facts.map((fact) => fact.id),
    };
  }
}

export function validateAiJudgmentBusinessRules(
  rawInput: JudgmentInput,
  rawJudgment: unknown,
): AiJudgment {
  const input = judgmentInputSchema.parse(rawInput);
  const judgment = aiJudgmentSchema.parse(rawJudgment);
  const factIds = new Set(input.facts.map((fact) => fact.id));

  if (
    judgment.decision_status === 'DECIDED' &&
    (judgment.conclusion === null || !input.allowed_conclusions.includes(judgment.conclusion))
  ) {
    throw new Error('Conclusion is not allowed');
  }
  if (
    judgment.recommended_offer_id !== null &&
    !input.allowed_offer_ids.includes(judgment.recommended_offer_id)
  ) {
    throw new Error('Offer is not allowed');
  }
  if (judgment.used_fact_ids.some((id) => !factIds.has(id))) {
    throw new Error('Unknown fact was used');
  }
  if (judgment.confidence.used_fact_ids.some((id) => !factIds.has(id))) {
    throw new Error('Confidence references an unknown fact');
  }
  const evidenceFactIds = [
    ...judgment.evidence_review.supporting_fact_ids,
    ...judgment.evidence_review.contradicting_fact_ids,
  ];
  if (evidenceFactIds.some((id) => !factIds.has(id))) {
    throw new Error('Evidence review references an unknown fact');
  }

  const selectedCriteria = new Set(input.selected_criteria);
  const resultCriteria = new Set(judgment.criteria_results.map((item) => item.criterion));
  if (
    resultCriteria.size !== 3 ||
    [...selectedCriteria].some((criterion) => !resultCriteria.has(criterion))
  ) {
    throw new Error('Criterion results do not match selected criteria');
  }

  const assessmentByCriterion = new Map(
    input.criterion_assessments.map((item) => [item.criterion, item]),
  );
  for (const result of judgment.criteria_results) {
    const assessment = assessmentByCriterion.get(result.criterion);
    if (!assessment || assessment.status !== result.status) {
      throw new Error('Criterion status was changed');
    }
    const criterionFactIds = new Set(assessment.fact_ids);
    if (result.used_fact_ids.some((id) => !criterionFactIds.has(id))) {
      throw new Error('Criterion explanation used an unrelated fact');
    }
  }

  const globallyUsedFacts = new Set(judgment.used_fact_ids);
  const specificallyUsedFacts = [
    ...evidenceFactIds,
    ...judgment.confidence.used_fact_ids,
    ...judgment.criteria_results.flatMap((item) => item.used_fact_ids),
  ];
  if (specificallyUsedFacts.some((id) => !globallyUsedFacts.has(id))) {
    throw new Error('Specific explanation fact is missing from used_fact_ids');
  }

  const outputText = collectJudgmentText(judgment);
  if (/제조\s*원가|생산\s*원가/.test(outputText)) {
    throw new Error('Manufacturing cost language is forbidden');
  }

  const allowedNumbers = new Set<number>();
  for (const fact of input.facts) {
    for (const value of extractNumericValues(fact.description)) {
      allowedNumbers.add(value);
    }
    for (const value of fact.numeric_values ?? []) {
      allowedNumbers.add(value);
    }
  }
  const unexpectedNumber = extractNumericValues(outputText)
    .find((value) => !allowedNumbers.has(value));
  if (unexpectedNumber !== undefined) {
    throw new Error(`Output contains an unverified number: ${unexpectedNumber}`);
  }

  return judgment;
}

export function extractNumericValues(value: string): number[] {
  return [...value.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)]
    .map((match) => Number(match[0].replace(/,/g, '')))
    .filter((number) => Number.isFinite(number));
}

function collectJudgmentText(judgment: AiJudgment): string {
  return [
    judgment.conclusion_reason,
    judgment.confidence.reason,
    ...judgment.criteria_results.map((item) => item.reason),
    judgment.recommendation_reason,
    ...judgment.warnings,
  ].join('\n');
}
