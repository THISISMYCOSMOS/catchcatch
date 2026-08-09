import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';

@Controller('analyses')
export class AnalysesController {
  constructor(private readonly service: AnalysesService) {}

  @Post()
  create(@Body() body: CreateAnalysisDto) {
    return this.service.create(body);
  }

  @Get('recent/:userId')
  findRecentByUserId(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findRecentByUserId(userId, limit);
  }

  @Get(':analysisId')
  findById(@Param('analysisId', new ParseUUIDPipe({ version: '4' })) analysisId: string) {
    return this.service.findById(analysisId);
  }
}
