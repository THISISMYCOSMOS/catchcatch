import { ConfigService } from '@nestjs/config';
import { logOpenAIUsage } from './openai-usage.logger';

describe('OpenAI usage logger', () => {
  it('logs token details and web-search calls only when diagnostics are enabled', () => {
    const logger = { log: jest.fn() };
    const response = {
      id: 'resp_1',
      output: [{ type: 'web_search_call' }, { type: 'message' }],
      usage: {
        input_tokens: 1200,
        output_tokens: 300,
        total_tokens: 1500,
        input_tokens_details: { cached_tokens: 100 },
        output_tokens_details: { reasoning_tokens: 50 },
      },
    };

    logOpenAIUsage(
      new ConfigService({ OPENAI_LOG_USAGE: 'false' }),
      logger,
      'configuration_search',
      'gpt-5.6',
      response,
    );
    expect(logger.log).not.toHaveBeenCalled();

    logOpenAIUsage(
      new ConfigService({ OPENAI_LOG_USAGE: 'true' }),
      logger,
      'configuration_search',
      'gpt-5.6',
      response,
    );
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining(
      '"input_tokens":1200',
    ));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining(
      '"web_search_calls":1',
    ));
  });
});
