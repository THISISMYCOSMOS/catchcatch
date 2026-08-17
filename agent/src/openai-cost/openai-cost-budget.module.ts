import { Global, Module } from '@nestjs/common';
import { OpenAICostBudgetService } from './openai-cost-budget.service';

@Global()
@Module({
  providers: [OpenAICostBudgetService],
  exports: [OpenAICostBudgetService],
})
export class OpenAICostBudgetModule {}
