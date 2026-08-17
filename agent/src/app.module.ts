import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { AiJudgmentModule } from './ai-judgment/ai-judgment.module';
import { InternalAuthModule } from './internal-auth/internal-auth.module';
import { ProductIdentificationModule } from './product-identification/product-identification.module';
import { ProductSearchModule } from './product-search/product-search.module';
import { OpenAICostBudgetModule } from './openai-cost/openai-cost-budget.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    OpenAICostBudgetModule,
    InternalAuthModule,
    ProductIdentificationModule,
    AiJudgmentModule,
    ProductSearchModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
