import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalApiGuard } from '../internal-auth/internal-api.guard';
import { ProductSearchService } from './product-search.service';

@UseGuards(InternalApiGuard)
@Controller('internal/v1/product-search')
export class ProductSearchController {
  constructor(private readonly service: ProductSearchService) {}

  @Post()
  search(@Body() body: unknown) {
    return this.service.searchSameProduct(body);
  }
}
