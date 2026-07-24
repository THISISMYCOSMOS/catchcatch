import { Module } from '@nestjs/common';
import { createSupabaseServerClient, SUPABASE_CLIENT } from './supabase.client';
import {
  ANALYSIS_REPOSITORY,
  PRICE_ALERT_REPOSITORY,
  PRICE_HISTORY_REPOSITORY,
  PRODUCT_COMPONENT_REPOSITORY,
  PRODUCT_REPOSITORY,
  SAVED_PRODUCT_REPOSITORY,
  SELLER_OFFER_REPOSITORY,
  USER_PREFERENCE_REPOSITORY,
} from './repositories/repository.tokens';
import { SupabaseAnalysisRepository } from './repositories/supabase-analysis.repository';
import { SupabasePriceAlertRepository } from './repositories/supabase-price-alert.repository';
import { SupabasePriceHistoryRepository } from './repositories/supabase-price-history.repository';
import { SupabaseProductComponentRepository } from './repositories/supabase-product-component.repository';
import { SupabaseProductRepository } from './repositories/supabase-product.repository';
import { SupabaseSavedProductRepository } from './repositories/supabase-saved-product.repository';
import { SupabaseSellerOfferRepository } from './repositories/supabase-seller-offer.repository';
import { SupabaseUserPreferenceRepository } from './repositories/supabase-user-preference.repository';

@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: createSupabaseServerClient,
    },
    SupabaseUserPreferenceRepository,
    SupabaseProductRepository,
    SupabaseProductComponentRepository,
    SupabaseSellerOfferRepository,
    SupabasePriceHistoryRepository,
    SupabaseAnalysisRepository,
    SupabaseSavedProductRepository,
    SupabasePriceAlertRepository,
    {
      provide: USER_PREFERENCE_REPOSITORY,
      useExisting: SupabaseUserPreferenceRepository,
    },
    {
      provide: PRODUCT_REPOSITORY,
      useExisting: SupabaseProductRepository,
    },
    {
      provide: PRODUCT_COMPONENT_REPOSITORY,
      useExisting: SupabaseProductComponentRepository,
    },
    {
      provide: SELLER_OFFER_REPOSITORY,
      useExisting: SupabaseSellerOfferRepository,
    },
    {
      provide: PRICE_HISTORY_REPOSITORY,
      useExisting: SupabasePriceHistoryRepository,
    },
    {
      provide: ANALYSIS_REPOSITORY,
      useExisting: SupabaseAnalysisRepository,
    },
    {
      provide: SAVED_PRODUCT_REPOSITORY,
      useExisting: SupabaseSavedProductRepository,
    },
    {
      provide: PRICE_ALERT_REPOSITORY,
      useExisting: SupabasePriceAlertRepository,
    },
  ],
  exports: [
    SUPABASE_CLIENT,
    USER_PREFERENCE_REPOSITORY,
    PRODUCT_REPOSITORY,
    PRODUCT_COMPONENT_REPOSITORY,
    SELLER_OFFER_REPOSITORY,
    PRICE_HISTORY_REPOSITORY,
    ANALYSIS_REPOSITORY,
    SAVED_PRODUCT_REPOSITORY,
    PRICE_ALERT_REPOSITORY,
  ],
})
export class DatabaseModule {}
