import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalApiGuard } from '../internal-auth/internal-api.guard';
import { ProductIdentificationService } from './product-identification.service';

@UseGuards(InternalApiGuard)
@Controller('internal/v1/product-identification')
export class ProductIdentificationController {
  constructor(private readonly service: ProductIdentificationService) {}

  @Post()
  identify(@Body() body: unknown) {
    return this.service.identify(body);
  }
}
