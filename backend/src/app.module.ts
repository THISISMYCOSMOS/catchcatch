import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalysesModule } from './analyses/analyses.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { PriceAlertsModule } from './price-alerts/price-alerts.module';
import { SavedProductsModule } from './saved-products/saved-products.module';
import { SaleCalendarModule } from './sale-calendar/sale-calendar.module';
import { UserPreferencesModule } from './user-preferences/user-preferences.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    UserPreferencesModule,
    AnalysesModule,
    SavedProductsModule,
    SaleCalendarModule,
    PriceAlertsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
