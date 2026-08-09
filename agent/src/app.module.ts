import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { AiJudgmentModule } from './ai-judgment/ai-judgment.module';
import { ProductSearchModule } from './product-search/product-search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AiJudgmentModule,
    ProductSearchModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
