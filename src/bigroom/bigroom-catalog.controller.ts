import { Controller, Post, UseGuards } from '@nestjs/common';
import { InternalApiGuard } from '../auth/internal-api.guard';
import { BigroomCatalogService } from './bigroom-catalog.service';

@UseGuards(InternalApiGuard)
@Controller('internal/v1/bigroom/catalog')
export class BigroomCatalogController {
  constructor(private readonly catalog: BigroomCatalogService) {}

  @Post('sync')
  sync() {
    return this.catalog.syncManifest();
  }
}
