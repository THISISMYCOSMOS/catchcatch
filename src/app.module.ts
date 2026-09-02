import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalysesModule } from './analyses/analyses.module';
import { AuthModule } from './auth/auth.module';
import { CoreIntegrationModule } from './core-integration/core-integration.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { PriceAlertsModule } from './price-alerts/price-alerts.module';
import { ProductsModule } from './products/products.module';
import { SavedProductsModule } from './saved-products/saved-products.module';
import { SaleCalendarModule } from './sale-calendar/sale-calendar.module';
import { SearchQuotaModule } from './search-quota/search-quota.module';
import { UserPreferencesModule } from './user-preferences/user-preferences.module';
import { BigroomModule } from './bigroom/bigroom.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    CoreIntegrationModule,
    UserPreferencesModule,
    AnalysesModule,
    SavedProductsModule,
    SaleCalendarModule,
    PriceAlertsModule,
    SearchQuotaModule,
    ProductsModule,
    BigroomModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
