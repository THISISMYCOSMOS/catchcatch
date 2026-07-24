import { Module } from '@nestjs/common';
import { AnalysesModule } from './analyses/analyses.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { UserPreferencesModule } from './user-preferences/user-preferences.module';

@Module({
  imports: [DatabaseModule, UserPreferencesModule, AnalysesModule],
  controllers: [HealthController],
})
export class AppModule {}
