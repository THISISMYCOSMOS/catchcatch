import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CoreIntegrationController } from './core-integration.controller';
import { CoreIntegrationService } from './core-integration.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CoreIntegrationController],
  providers: [CoreIntegrationService],
  exports: [CoreIntegrationService],
})
export class CoreIntegrationModule {}
