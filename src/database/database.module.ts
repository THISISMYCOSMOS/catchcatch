import { Module } from '@nestjs/common';
import { createSupabaseServerClient, SUPABASE_CLIENT } from './supabase.client';
import {
  ANALYSIS_REPOSITORY,
  ANALYSIS_OFFER_REPOSITORY,
  ANALYSIS_PERSISTENCE_REPOSITORY,
  PRICE_ALERT_REPOSITORY,
  PRICE_HISTORY_REPOSITORY,
  PRODUCT_COMPONENT_REPOSITORY,
  PRODUCT_REPOSITORY,
  SAVED_PRODUCT_REPOSITORY,
  SALE_CALENDAR_REPOSITORY,
  SELLER_OFFER_BENEFIT_REPOSITORY,
  SELLER_OFFER_REPOSITORY,
  USER_CARD_REPOSITORY,
  USER_MEMBERSHIP_REPOSITORY,
  USER_PREFERENCE_REPOSITORY,
  USER_SHOPPING_GRADE_REPOSITORY,
} from './repositories/repository.tokens';
import { SupabaseAnalysisRepository } from './repositories/supabase-analysis.repository';
import { SupabaseAnalysisOfferRepository } from './repositories/supabase-analysis-offer.repository';
import { SupabaseAnalysisPersistenceRepository } from './repositories/supabase-analysis-persistence.repository';
import { SupabasePriceAlertRepository } from './repositories/supabase-price-alert.repository';
import { SupabasePriceHistoryRepository } from './repositories/supabase-price-history.repository';
import { SupabaseProductComponentRepository } from './repositories/supabase-product-component.repository';
import { SupabaseProductRepository } from './repositories/supabase-product.repository';
import { SupabaseSavedProductRepository } from './repositories/supabase-saved-product.repository';
import { SupabaseSaleCalendarRepository } from './repositories/supabase-sale-calendar.repository';
import { SupabaseSellerOfferBenefitRepository } from './repositories/supabase-seller-offer-benefit.repository';
import { SupabaseSellerOfferRepository } from './repositories/supabase-seller-offer.repository';
import { SupabaseUserCardRepository } from './repositories/supabase-user-card.repository';
import { SupabaseUserMembershipRepository } from './repositories/supabase-user-membership.repository';
import { SupabaseUserPreferenceRepository } from './repositories/supabase-user-preference.repository';
import { SupabaseUserShoppingGradeRepository } from './repositories/supabase-user-shopping-grade.repository';

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
    SupabaseAnalysisOfferRepository,
    SupabaseAnalysisPersistenceRepository,
    SupabaseSavedProductRepository,
    SupabaseSaleCalendarRepository,
    SupabaseSellerOfferBenefitRepository,
    SupabasePriceAlertRepository,
    SupabaseUserMembershipRepository,
    SupabaseUserShoppingGradeRepository,
    SupabaseUserCardRepository,
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
      provide: SELLER_OFFER_BENEFIT_REPOSITORY,
      useExisting: SupabaseSellerOfferBenefitRepository,
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
      provide: ANALYSIS_PERSISTENCE_REPOSITORY,
      useExisting: SupabaseAnalysisPersistenceRepository,
    },
    {
      provide: ANALYSIS_OFFER_REPOSITORY,
      useExisting: SupabaseAnalysisOfferRepository,
    },
    {
      provide: SAVED_PRODUCT_REPOSITORY,
      useExisting: SupabaseSavedProductRepository,
    },
    {
      provide: SALE_CALENDAR_REPOSITORY,
      useExisting: SupabaseSaleCalendarRepository,
    },
    {
      provide: PRICE_ALERT_REPOSITORY,
      useExisting: SupabasePriceAlertRepository,
    },
    {
      provide: USER_MEMBERSHIP_REPOSITORY,
      useExisting: SupabaseUserMembershipRepository,
    },
    {
      provide: USER_SHOPPING_GRADE_REPOSITORY,
      useExisting: SupabaseUserShoppingGradeRepository,
    },
    {
      provide: USER_CARD_REPOSITORY,
      useExisting: SupabaseUserCardRepository,
    },
  ],
  exports: [
    SUPABASE_CLIENT,
    USER_PREFERENCE_REPOSITORY,
    PRODUCT_REPOSITORY,
    PRODUCT_COMPONENT_REPOSITORY,
    SELLER_OFFER_REPOSITORY,
    SELLER_OFFER_BENEFIT_REPOSITORY,
    PRICE_HISTORY_REPOSITORY,
    ANALYSIS_REPOSITORY,
    ANALYSIS_PERSISTENCE_REPOSITORY,
    ANALYSIS_OFFER_REPOSITORY,
    SAVED_PRODUCT_REPOSITORY,
    SALE_CALENDAR_REPOSITORY,
    PRICE_ALERT_REPOSITORY,
    USER_MEMBERSHIP_REPOSITORY,
    USER_SHOPPING_GRADE_REPOSITORY,
    USER_CARD_REPOSITORY,
  ],
})
export class DatabaseModule {}
