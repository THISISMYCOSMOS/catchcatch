import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { SearchQuotaController } from './search-quota.controller';
import { SearchQuotaService } from './search-quota.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [SearchQuotaController],
  providers: [SearchQuotaService],
  exports: [SearchQuotaService],
})
export class SearchQuotaModule {}
