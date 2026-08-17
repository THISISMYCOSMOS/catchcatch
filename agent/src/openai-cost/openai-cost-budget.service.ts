import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OpenAICostStage =
  | 'product_identification'
  | 'brand_official_discovery'
  | 'same_product_search'
  | 'ai_judgment';

export type AnalysisBudgetSession = Readonly<{
  id: string;
  key: string;
}>;

export type CostReservation = {
  readonly sessionId: string;
  readonly stage: OpenAICostStage;
  readonly amountUsd: number;
  active: boolean;
};

export type OpenAICostResponseLike = {
  output?: Array<{ type?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
};

type ModelPricing = {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

type SessionState = {
  handle: AnalysisBudgetSession;
  createdAt: number;
  budgetUsd: number;
  searchClaimed: boolean;
  spentUsd: number;
  reservedUsd: number;
};

const DEFAULT_ANALYSIS_BUDGET_USD = 0.056;
const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 1_000;
const DEFAULT_WEB_SEARCH_CALL_USD = 0.01;

const STAGE_RESERVE_DEFAULTS: Readonly<Record<OpenAICostStage, number>> = {
  product_identification: 0.012,
  brand_official_discovery: 0.012,
  same_product_search: 0.027,
  ai_judgment: 0.005,
};

const STAGE_RESERVE_ENV: Readonly<Record<OpenAICostStage, string>> = {
  product_identification: 'OPENAI_IDENTIFICATION_COST_RESERVE_USD',
  brand_official_discovery: 'OPENAI_BRAND_OFFICIAL_COST_RESERVE_USD',
  same_product_search: 'OPENAI_PRODUCT_SEARCH_COST_RESERVE_USD',
  ai_judgment: 'OPENAI_JUDGMENT_COST_RESERVE_USD',
};

const GPT_5_6_SOL_PRICING: ModelPricing = {
  inputPerMillionUsd: 5,
  cachedInputPerMillionUsd: 0.5,
  outputPerMillionUsd: 30,
};

const GPT_5_6_TERRA_PRICING: ModelPricing = {
  inputPerMillionUsd: 2,
  cachedInputPerMillionUsd: 0.2,
  outputPerMillionUsd: 12,
};

const GPT_5_6_LUNA_PRICING: ModelPricing = {
  inputPerMillionUsd: 0.2,
  cachedInputPerMillionUsd: 0.02,
  outputPerMillionUsd: 1.2,
};

@Injectable()
export class OpenAICostBudgetService {
  private readonly logger = new Logger(OpenAICostBudgetService.name);
  private readonly sessions = new Map<string, SessionState>();
  private readonly sessionIdsByKey = new Map<string, string[]>();

  constructor(private readonly config: ConfigService) {}

  begin(
    productUrl: string,
    budgetUsd = this.analysisBudgetUsd(),
  ): AnalysisBudgetSession {
    this.prune();
    const handle = { id: randomUUID(), key: normalizeBudgetKey(productUrl) };
    const state: SessionState = {
      handle,
      createdAt: Date.now(),
      budgetUsd: roundUsd(budgetUsd),
      searchClaimed: false,
      spentUsd: 0,
      reservedUsd: 0,
    };
    this.sessions.set(handle.id, state);
    const queue = this.sessionIdsByKey.get(handle.key) ?? [];
    queue.push(handle.id);
    this.sessionIdsByKey.set(handle.key, queue);
    this.enforceMaxSessions();
    return handle;
  }

  claimForSearch(
    productUrl: string,
    budgetUsd = this.searchPipelineBudgetUsd(),
  ): AnalysisBudgetSession {
    this.prune();
    const key = normalizeBudgetKey(productUrl);
    const queue = this.sessionIdsByKey.get(key) ?? [];
    for (const id of queue) {
      const state = this.sessions.get(id);
      if (state && !state.searchClaimed) {
        state.searchClaimed = true;
        return state.handle;
      }
    }
    const handle = this.begin(productUrl, budgetUsd);
    const state = this.requireSession(handle);
    state.searchClaimed = true;
    return handle;
  }

  reserve(
    session: AnalysisBudgetSession,
    stage: OpenAICostStage,
    additionalReserveUsd = 0,
  ): CostReservation | null {
    const state = this.requireSession(session);
    const amountUsd = this.stageReserveUsd(stage);
    if (state.spentUsd + state.reservedUsd + amountUsd + additionalReserveUsd > state.budgetUsd) {
      this.logger.warn(`OPENAI_COST_BUDGET_BLOCKED ${JSON.stringify({
        session_id: session.id,
        stage,
        spent_usd: roundUsd(state.spentUsd),
        reserved_usd: roundUsd(state.reservedUsd),
        requested_reserve_usd: amountUsd,
        additional_reserve_usd: additionalReserveUsd,
        budget_usd: state.budgetUsd,
      })}`);
      return null;
    }
    state.reservedUsd += amountUsd;
    return { sessionId: session.id, stage, amountUsd, active: true };
  }

  settle(
    reservation: CostReservation,
    model: string,
    response: OpenAICostResponseLike,
  ): number {
    if (!reservation.active) return 0;
    const state = this.requireSessionId(reservation.sessionId);
    reservation.active = false;
    state.reservedUsd = Math.max(0, state.reservedUsd - reservation.amountUsd);
    const costUsd = estimateOpenAIResponseCostUsd(
      model,
      response,
      this.webSearchCallUsd(),
    );
    state.spentUsd += costUsd;
    const payload = {
      session_id: state.handle.id,
      stage: reservation.stage,
      model,
      stage_cost_usd: roundUsd(costUsd),
      analysis_spent_usd: roundUsd(state.spentUsd),
      budget_usd: state.budgetUsd,
      stage_reserve_exceeded: costUsd > reservation.amountUsd,
      budget_exceeded: state.spentUsd > state.budgetUsd,
    };
    if (payload.budget_exceeded) {
      this.logger.warn(`OPENAI_COST_BUDGET_EXCEEDED ${JSON.stringify(payload)}`);
    } else {
      this.logger.log(`OPENAI_COST ${JSON.stringify(payload)}`);
    }
    return costUsd;
  }

  release(reservation: CostReservation | null): void {
    if (!reservation?.active) return;
    const state = this.sessions.get(reservation.sessionId);
    reservation.active = false;
    if (state) {
      state.reservedUsd = Math.max(0, state.reservedUsd - reservation.amountUsd);
    }
  }

  remainingUsd(session: AnalysisBudgetSession): number {
    const state = this.requireSession(session);
    return Math.max(0, state.budgetUsd - state.spentUsd - state.reservedUsd);
  }

  isExceeded(session: AnalysisBudgetSession): boolean {
    const state = this.requireSession(session);
    return state.spentUsd > state.budgetUsd;
  }

  finish(session: AnalysisBudgetSession): void {
    const state = this.sessions.get(session.id);
    if (!state) return;
    this.logger.log(`OPENAI_COST_ANALYSIS_FINISHED ${JSON.stringify({
      session_id: session.id,
      spent_usd: roundUsd(state.spentUsd),
      budget_usd: state.budgetUsd,
    })}`);
    this.removeSession(state);
  }

  stageReserveUsd(stage: OpenAICostStage): number {
    return readPositiveNumber(
      this.config.get<string>(STAGE_RESERVE_ENV[stage]),
      STAGE_RESERVE_DEFAULTS[stage],
    );
  }

  analysisBudgetUsd(): number {
    return readPositiveNumber(
      this.config.get<string>('OPENAI_ANALYSIS_COST_BUDGET_USD'),
      DEFAULT_ANALYSIS_BUDGET_USD,
    );
  }

  searchPipelineBudgetUsd(): number {
    return Math.max(0, this.analysisBudgetUsd() - this.stageReserveUsd('ai_judgment'));
  }

  private requireSession(handle: AnalysisBudgetSession): SessionState {
    return this.requireSessionId(handle.id);
  }

  private requireSessionId(id: string): SessionState {
    const state = this.sessions.get(id);
    if (!state) throw new Error('OpenAI cost budget session is no longer available');
    return state;
  }

  private webSearchCallUsd(): number {
    return readPositiveNumber(
      this.config.get<string>('OPENAI_WEB_SEARCH_CALL_COST_USD'),
      DEFAULT_WEB_SEARCH_CALL_USD,
    );
  }

  private prune(): void {
    const cutoff = Date.now() - readPositiveNumber(
      this.config.get<string>('OPENAI_COST_SESSION_TTL_MS'),
      DEFAULT_SESSION_TTL_MS,
    );
    for (const state of this.sessions.values()) {
      if (state.createdAt < cutoff) this.removeSession(state);
    }
  }

  private enforceMaxSessions(): void {
    const maxSessions = Math.floor(readPositiveNumber(
      this.config.get<string>('OPENAI_COST_MAX_SESSIONS'),
      DEFAULT_MAX_SESSIONS,
    ));
    while (this.sessions.size > maxSessions) {
      const oldest = this.sessions.values().next().value as SessionState | undefined;
      if (!oldest) return;
      this.removeSession(oldest);
    }
  }

  private removeSession(state: SessionState): void {
    this.sessions.delete(state.handle.id);
    const queue = this.sessionIdsByKey.get(state.handle.key);
    if (!queue) return;
    const remaining = queue.filter((id) => id !== state.handle.id);
    if (remaining.length === 0) this.sessionIdsByKey.delete(state.handle.key);
    else this.sessionIdsByKey.set(state.handle.key, remaining);
  }
}

export function estimateOpenAIResponseCostUsd(
  model: string,
  response: OpenAICostResponseLike,
  webSearchCallUsd = DEFAULT_WEB_SEARCH_CALL_USD,
): number {
  const pricing = resolveModelPricing(model);
  const inputTokens = nonNegative(response.usage?.input_tokens);
  const cachedInputTokens = Math.min(
    inputTokens,
    nonNegative(response.usage?.input_tokens_details?.cached_tokens),
  );
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const outputTokens = nonNegative(response.usage?.output_tokens);
  const webSearchCalls = response.output?.filter((item) => item.type === 'web_search_call').length ?? 0;
  return (
    uncachedInputTokens * pricing.inputPerMillionUsd / 1_000_000
    + cachedInputTokens * pricing.cachedInputPerMillionUsd / 1_000_000
    + outputTokens * pricing.outputPerMillionUsd / 1_000_000
    + webSearchCalls * webSearchCallUsd
  );
}

function resolveModelPricing(model: string): ModelPricing {
  const normalized = model.trim().toLowerCase();
  if (normalized === 'gpt-5.6' || normalized.startsWith('gpt-5.6-sol')) {
    return GPT_5_6_SOL_PRICING;
  }
  if (normalized.startsWith('gpt-5.6-terra')) return GPT_5_6_TERRA_PRICING;
  if (normalized.startsWith('gpt-5.6-luna')) return GPT_5_6_LUNA_PRICING;
  // Unknown configured models are priced conservatively as Sol rather than
  // silently under-counting the analysis budget.
  return GPT_5_6_SOL_PRICING;
}

function normalizeBudgetKey(productUrl: string): string {
  try {
    const url = new URL(productUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return productUrl.trim();
  }
}

function readPositiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value as number : 0;
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}
