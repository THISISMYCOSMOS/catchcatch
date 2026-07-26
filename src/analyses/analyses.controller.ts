import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';

@Controller('analyses')
export class AnalysesController {
  constructor(private readonly service: AnalysesService) {}

  @Post()
  create(@Body() body: CreateAnalysisDto) {
    return this.service.create(body);
  }

  @Get(':analysisId')
  findById(@Param('analysisId', new ParseUUIDPipe({ version: '4' })) analysisId: string) {
    return this.service.findById(analysisId);
  }
}
