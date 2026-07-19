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
          ? '\n\n# 정정 요청\n이전 응답은 검증 규칙을 통과하지 못했다. 오류 내용은 추측하지 말고 동일한 입력과 모든 규칙을 다시 확인해 스키마에 맞는 결과만 생성하라.'
          : '';
        const response = await client.responses.parse({
          model: this.config.get<string>('OPENAI_MODEL', 'gpt-5.6'),
          instructions: `${CATCHCATCH_JUDGMENT_INSTRUCTIONS}${correction}`,
          input: buildJudgmentPrompt(input),
          text: {
            format: zodTextFormat(aiJudgmentSchema, 'catchcatch_judgment'),
          },
        });

        if (!response.output_parsed) {
          throw new Error('OpenAI returned no parsed output');
        }

        return this.validateBusinessRules(input, response.output_parsed);
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
    const conclusion = input.allowed_conclusions[0];
    const recommendedOfferId = input.allowed_offer_ids[0] ?? null;

    return {
      conclusion,
      conclusion_reason: '테스트용 검증 사실을 바탕으로 생성한 mock 판단입니다.',
      criteria_results: input.criterion_assessments.map((assessment) => ({
        criterion: assessment.criterion,
        status: assessment.status,
        reason: '자동 테스트를 위한 결정적 mock 결과입니다.',
      })),
      recommended_offer_id: recommendedOfferId,
      recommendation_reason: recommendedOfferId
        ? '허용된 판매처 후보 중 첫 번째 항목을 선택했습니다.'
        : '추천 가능한 판매처 후보가 없습니다.',
      warnings: ['실제 OpenAI API를 호출하지 않은 mock 결과입니다.'],
      used_fact_ids: input.facts.map((fact) => fact.id),
    };
  }

  private validateBusinessRules(
    input: JudgmentInput,
    rawJudgment: AiJudgment,
  ): AiJudgment {
    const judgment = aiJudgmentSchema.parse(rawJudgment);
    const factIds = new Set(input.facts.map((fact) => fact.id));

    if (!input.allowed_conclusions.includes(judgment.conclusion)) {
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
    const selectedCriteria = new Set(input.selected_criteria);
    const resultCriteria = new Set(judgment.criteria_results.map((item) => item.criterion));
    if (
      resultCriteria.size !== 3 ||
      [...selectedCriteria].some((criterion) => !resultCriteria.has(criterion))
    ) {
      throw new Error('Criterion results do not match selected criteria');
    }
    const assessmentByCriterion = new Map(
      input.criterion_assessments.map((item) => [item.criterion, item.status]),
    );
    if (
      judgment.criteria_results.some(
        (item) => assessmentByCriterion.get(item.criterion) !== item.status,
      )
    ) {
      throw new Error('Criterion status was changed');
    }

    return judgment;
  }
}
