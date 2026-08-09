import { Module } from '@nestjs/common';
import { AiJudgmentController } from './ai-judgment.controller';
import { AiJudgmentService } from './ai-judgment.service';

@Module({
  controllers: [AiJudgmentController],
  providers: [AiJudgmentService],
  exports: [AiJudgmentService],
})
export class AiJudgmentModule {}
