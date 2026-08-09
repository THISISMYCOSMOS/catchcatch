import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalApiGuard } from '../internal-auth/internal-api.guard';
import { AiJudgmentService } from './ai-judgment.service';

@UseGuards(InternalApiGuard)
@Controller('internal/v1/ai-judgment')
export class AiJudgmentController {
  constructor(private readonly service: AiJudgmentService) {}

  @Post()
  judge(@Body() body: unknown) {
    return this.service.judge(body);
  }
}
