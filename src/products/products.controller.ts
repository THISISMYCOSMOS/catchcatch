import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AnalysesService } from '../analyses/analyses.service';

@UseGuards(AuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly analyses: AnalysesService) {}

  @Get(':productId/price-history')
  findPriceHistory(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.analyses.findProductPriceHistory(productId);
  }
}
