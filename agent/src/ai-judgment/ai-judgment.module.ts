import { Module } from '@nestjs/common';
import { AiJudgmentService } from './ai-judgment.service';

@Module({
  providers: [AiJudgmentService],
  exports: [AiJudgmentService],
})
export class AiJudgmentModule {}
