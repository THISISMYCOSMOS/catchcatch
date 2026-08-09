import { Module } from '@nestjs/common';
import { ProductIdentificationController } from './product-identification.controller';
import { ProductIdentificationService } from './product-identification.service';

@Module({
  controllers: [ProductIdentificationController],
  providers: [ProductIdentificationService],
  exports: [ProductIdentificationService],
})
export class ProductIdentificationModule {}
