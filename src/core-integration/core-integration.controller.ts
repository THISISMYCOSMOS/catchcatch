import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CoreIntegrationService } from './core-integration.service';
import { PersistProductDto } from './dto/persist-product.dto';
import { PersistSellerOffersDto } from './dto/persist-seller-offers.dto';
import { SaveJudgmentResultDto } from './dto/save-judgment-result.dto';

@UseGuards(AuthGuard)
@Controller('core')
export class CoreIntegrationController {
  constructor(private readonly service: CoreIntegrationService) {}

  @Post('products')
  persistProduct(@Body() body: PersistProductDto) {
    return this.service.persistProduct(body);
  }

  @Post('products/:productId/seller-offers')
  persistSellerOffers(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() body: PersistSellerOffersDto,
  ) {
    return this.service.persistSellerOffers(productId, body.offers);
  }

  @Get('analyses/:analysisId/judgment-input')
  buildJudgmentInput(
    @Param('analysisId', new ParseUUIDPipe({ version: '4' })) analysisId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.buildJudgmentInput(analysisId, user.id);
  }

  @Put('analyses/:analysisId/judgment-result')
  saveJudgmentResult(
    @Param('analysisId', new ParseUUIDPipe({ version: '4' })) analysisId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SaveJudgmentResultDto,
  ) {
    return this.service.saveJudgmentResult(analysisId, user.id, body);
  }
}
