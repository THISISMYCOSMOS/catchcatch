import { ConfigService } from '@nestjs/config';

type UsageLogger = { log(message: string): void };

type OpenAIResponseLike = {
  id?: string;
  output?: Array<{ type?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
};

export function logOpenAIUsage(
  config: ConfigService,
  logger: UsageLogger,
  stage: string,
  model: string,
  response: OpenAIResponseLike,
): void {
  if (config.get<string>('OPENAI_LOG_USAGE', 'false').toLowerCase() !== 'true') {
    return;
  }

  const usage = response.usage;
  logger.log(`OPENAI_USAGE ${JSON.stringify({
    stage,
    model,
    response_id: response.id ?? null,
    input_tokens: usage?.input_tokens ?? null,
    cached_input_tokens: usage?.input_tokens_details?.cached_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    reasoning_output_tokens: usage?.output_tokens_details?.reasoning_tokens ?? null,
    total_tokens: usage?.total_tokens ?? null,
    web_search_calls: response.output?.filter((item) => item.type === 'web_search_call').length ?? 0,
  })}`);
}
