import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { InternalApiGuard } from '../auth/internal-api.guard';
import { CoreIntegrationService } from './core-integration.service';
import { IngestOffersDto, ResolveProductDto, SaveJudgmentDto } from './dto/internal-contract.dto';

@UseGuards(AuthGuard, InternalApiGuard)
@Controller('internal/v1')
export class CoreIntegrationController {
  constructor(private readonly service: CoreIntegrationService) {}

  @Post('products/resolve')
  resolveProduct(@Body() body: ResolveProductDto) {
    return this.service.resolveProduct(body);
  }

  @Put('products/:productId/offers')
  ingestOffers(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() body: IngestOffersDto,
  ) {
    return this.service.ingestOffers(productId, body);
  }

  @Get('analyses/:analysisId/judgment-context')
  async buildJudgmentInput(
    @Param('analysisId', new ParseUUIDPipe({ version: '4' })) analysisId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      judgmentInput: await this.service.buildJudgmentInput(analysisId, user.id),
    };
  }

  @Put('analyses/:analysisId/judgment')
  saveJudgmentResult(
    @Param('analysisId', new ParseUUIDPipe({ version: '4' })) analysisId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SaveJudgmentDto,
  ) {
    return this.service.saveJudgmentResult(analysisId, user.id, body);
  }
}
