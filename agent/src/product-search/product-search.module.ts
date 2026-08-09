import { Module } from '@nestjs/common';
import { ProductSearchController } from './product-search.controller';
import { ProductSearchService } from './product-search.service';

@Module({
  controllers: [ProductSearchController],
  providers: [ProductSearchService],
  exports: [ProductSearchService],
})
export class ProductSearchModule {}
