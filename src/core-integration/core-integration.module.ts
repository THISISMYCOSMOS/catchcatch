import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { SearchQuotaModule } from '../search-quota/search-quota.module';
import { CoreIntegrationController } from './core-integration.controller';
import { CoreIntegrationService } from './core-integration.service';
import { BigroomModule } from '../bigroom/bigroom.module';

@Module({
  imports: [AuthModule, DatabaseModule, SearchQuotaModule, BigroomModule],
  controllers: [CoreIntegrationController],
  providers: [CoreIntegrationService],
  exports: [CoreIntegrationService],
})
export class CoreIntegrationModule {}
