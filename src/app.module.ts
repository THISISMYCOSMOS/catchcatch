import { Module } from '@nestjs/common';
import { AnalysesModule } from './analyses/analyses.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { PriceAlertsModule } from './price-alerts/price-alerts.module';
import { SavedProductsModule } from './saved-products/saved-products.module';
import { UserPreferencesModule } from './user-preferences/user-preferences.module';

@Module({
  imports: [
    DatabaseModule,
    UserPreferencesModule,
    AnalysesModule,
    SavedProductsModule,
    PriceAlertsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
