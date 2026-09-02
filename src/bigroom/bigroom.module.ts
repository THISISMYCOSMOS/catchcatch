import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { BigroomCatalogController } from './bigroom-catalog.controller';
import { BigroomCatalogService } from './bigroom-catalog.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [BigroomCatalogController],
  providers: [BigroomCatalogService],
  exports: [BigroomCatalogService],
})
export class BigroomModule {}
