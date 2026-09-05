import {
  AnalysisStatus,
  AllowedConclusion,
  CapacityUnit,
  ComparisonStatus,
  ComponentType,
  ComponentPhysicalType,
  CommercialInclusion,
  ComponentProductIdentity,
  PackageType,
  ReturnPolicyStatus,
  UserCriterion,
  Verdict,
  WarningCode,
  OfficialSellerStatus,
} from '../domain/types';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Tables = Database['public']['Tables'];
export type TableName = keyof Tables;
export type Row<TName extends TableName> = Tables[TName]['Row'];
export type Insert<TName extends TableName> = Tables[TName]['Insert'];
export type Update<TName extends TableName> = Tables[TName]['Update'];
export type SellerOfferBenefitType = 'MEMBERSHIP' | 'SHOPPING_GRADE' | 'CARD';

export type Database = {
  public: {
    Tables: {
      user_accounts: {
        Row: {
          user_id: string;
          account_id: string;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          account_id: string;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          account_id?: string;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bigroom_catalog_items: {
        Row: {
          id: string;
          external_product_id: string;
          product_url: string;
          product_slug: string;
          search_text: string;
          sitemap_indexed: boolean;
          product_name: string | null;
          listed_price: number | null;
          listed_sale_price: number | null;
          public_coupon_amount: number | null;
          shipping_fee: number | null;
          capacity_value: number | null;
          capacity_unit: CapacityUnit | null;
          quantity: number | null;
          offer_kind: 'SINGLE' | 'SAME_PRODUCT_MULTI' | 'MIXED_SET' | 'UNKNOWN';
          app_benefit_advertised: boolean;
          availability_status: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
          sitemap_last_modified_at: string | null;
          detail_verified_at: string | null;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          external_product_id: string;
          product_url: string;
          product_slug: string;
          search_text: string;
          sitemap_indexed?: boolean;
          product_name?: string | null;
          listed_price?: number | null;
          listed_sale_price?: number | null;
          public_coupon_amount?: number | null;
          shipping_fee?: number | null;
          capacity_value?: number | null;
          capacity_unit?: CapacityUnit | null;
          quantity?: number | null;
          offer_kind?: 'SINGLE' | 'SAME_PRODUCT_MULTI' | 'MIXED_SET' | 'UNKNOWN';
          app_benefit_advertised?: boolean;
          availability_status?: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
          sitemap_last_modified_at?: string | null;
          detail_verified_at?: string | null;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          external_product_id?: string;
          product_url?: string;
          product_slug?: string;
          search_text?: string;
          sitemap_indexed?: boolean;
          product_name?: string | null;
          listed_price?: number | null;
          listed_sale_price?: number | null;
          public_coupon_amount?: number | null;
          shipping_fee?: number | null;
          capacity_value?: number | null;
          capacity_unit?: CapacityUnit | null;
          quantity?: number | null;
          offer_kind?: 'SINGLE' | 'SAME_PRODUCT_MULTI' | 'MIXED_SET' | 'UNKNOWN';
          app_benefit_advertised?: boolean;
          availability_status?: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
          sitemap_last_modified_at?: string | null;
          detail_verified_at?: string | null;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          selected_criteria: UserCriterion[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          selected_criteria: UserCriterion[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          selected_criteria?: UserCriterion[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_search_quotas: {
        Row: {
          user_id: string;
          window_started_at: string;
          window_expires_at: string;
          used_count: number;
          limit_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          window_started_at: string;
          window_expires_at: string;
          used_count?: number;
          limit_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          window_started_at?: string;
          window_expires_at?: string;
          used_count?: number;
          limit_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_search_quota_consumptions: {
        Row: {
          user_id: string;
          idempotency_key: string;
          consumed_at: string;
          window_started_at: string;
        };
        Insert: {
          user_id: string;
          idempotency_key: string;
          consumed_at?: string;
          window_started_at: string;
        };
        Update: {
          user_id?: string;
          idempotency_key?: string;
          consumed_at?: string;
          window_started_at?: string;
        };
        Relationships: [];
      };
      abuse_subjects: {
        Row: {
          id: string;
          phone_hmac: string;
          tombstone_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          phone_hmac: string;
          tombstone_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phone_hmac?: string;
          tombstone_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_abuse_subjects: {
        Row: {
          user_id: string;
          abuse_subject_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          abuse_subject_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          abuse_subject_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      terms_consents: {
        Row: {
          id: string;
          user_id: string;
          terms_version: string;
          document_sha256: string;
          accepted_at: string;
          withdrawn_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          terms_version: string;
          document_sha256: string;
          accepted_at: string;
          withdrawn_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          terms_version?: string;
          document_sha256?: string;
          accepted_at?: string;
          withdrawn_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_memberships: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          membership_type: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          membership_type: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          membership_type?: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_shopping_grades: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          grade: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          grade: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          grade?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_cards: {
        Row: {
          id: string;
          user_id: string;
          issuer: string;
          card_product_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          issuer: string;
          card_product_code: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          issuer?: string;
          card_product_code?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          canonical_name: string;
          brand: string | null;
          image_url: string | null;
          product_key: string;
          product_type: string | null;
          option: string | null;
          shade_or_scent: string | null;
          version_or_renewal: string | null;
          package_type: PackageType | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          canonical_name: string;
          brand?: string | null;
          image_url?: string | null;
          product_key: string;
          product_type?: string | null;
          option?: string | null;
          shade_or_scent?: string | null;
          version_or_renewal?: string | null;
          package_type?: PackageType | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          canonical_name?: string;
          brand?: string | null;
          image_url?: string | null;
          product_key?: string;
          product_type?: string | null;
          option?: string | null;
          shade_or_scent?: string | null;
          version_or_renewal?: string | null;
          package_type?: PackageType | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_components: {
        Row: {
          id: string;
          product_id: string;
          component_type: ComponentType;
          name: string | null;
          capacity_value: number | null;
          capacity_unit: CapacityUnit | null;
          quantity: number | null;
          physical_type: ComponentPhysicalType;
          commercial_inclusion: CommercialInclusion;
          product_identity: ComponentProductIdentity;
          verification_status: 'VERIFIED' | 'UNKNOWN';
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          component_type: ComponentType;
          name?: string | null;
          capacity_value?: number | null;
          capacity_unit?: CapacityUnit | null;
          quantity?: number | null;
          physical_type?: ComponentPhysicalType;
          commercial_inclusion?: CommercialInclusion;
          product_identity?: ComponentProductIdentity;
          verification_status?: 'VERIFIED' | 'UNKNOWN';
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          component_type?: ComponentType;
          name?: string | null;
          capacity_value?: number | null;
          capacity_unit?: CapacityUnit | null;
          quantity?: number | null;
          physical_type?: ComponentPhysicalType;
          commercial_inclusion?: CommercialInclusion;
          product_identity?: ComponentProductIdentity;
          verification_status?: 'VERIFIED' | 'UNKNOWN';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_components_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      sale_calendar: {
        Row: {
          id: string;
          seller_code: string;
          seller_name: string;
          title: string;
          description: string | null;
          sale_type: string;
          starts_at: string;
          ends_at: string;
          banner_image_url: string | null;
          landing_url: string | null;
          is_active: boolean;
          priority: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_code: string;
          seller_name: string;
          title: string;
          description?: string | null;
          sale_type: string;
          starts_at: string;
          ends_at: string;
          banner_image_url?: string | null;
          landing_url?: string | null;
          is_active?: boolean;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          seller_code?: string;
          seller_name?: string;
          title?: string;
          description?: string | null;
          sale_type?: string;
          starts_at?: string;
          ends_at?: string;
          banner_image_url?: string | null;
          landing_url?: string | null;
          is_active?: boolean;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      seller_offers: {
        Row: {
          id: string;
          product_id: string;
          seller_name: string;
          seller_url: string;
          listed_price: number | null;
          listed_sale_price: number | null;
          market_effective_price: number | null;
          user_effective_price: number | null;
          shipping_fee: number | null;
          public_discount_amount: number | null;
          automatic_discount_amount: number | null;
          reward_value: number | null;
          official_seller_status: OfficialSellerStatus | null;
          return_policy_status: ReturnPolicyStatus | null;
          delivery_days: number | null;
          comparison_status: ComparisonStatus | null;
          app_benefit_advertised: boolean;
          is_active: boolean;
          purchase_url: string | null;
          observed_at: string | null;
          source_verification_status: 'VERIFIED' | 'UNKNOWN';
          selected_option_verification_status: 'VERIFIED' | 'UNKNOWN';
          paid_configuration_verification_status: 'VERIFIED' | 'UNKNOWN';
          verification_reason_codes: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          seller_name: string;
          seller_url: string;
          listed_price?: number | null;
          listed_sale_price?: number | null;
          market_effective_price?: number | null;
          user_effective_price?: number | null;
          shipping_fee?: number | null;
          public_discount_amount?: number | null;
          automatic_discount_amount?: number | null;
          reward_value?: number | null;
          official_seller_status?: OfficialSellerStatus | null;
          return_policy_status?: ReturnPolicyStatus | null;
          delivery_days?: number | null;
          comparison_status?: ComparisonStatus | null;
          app_benefit_advertised?: boolean;
          is_active?: boolean;
          purchase_url?: string | null;
          observed_at?: string | null;
          source_verification_status?: 'VERIFIED' | 'UNKNOWN';
          selected_option_verification_status?: 'VERIFIED' | 'UNKNOWN';
          paid_configuration_verification_status?: 'VERIFIED' | 'UNKNOWN';
          verification_reason_codes?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          seller_name?: string;
          seller_url?: string;
          listed_price?: number | null;
          listed_sale_price?: number | null;
          market_effective_price?: number | null;
          user_effective_price?: number | null;
          shipping_fee?: number | null;
          public_discount_amount?: number | null;
          automatic_discount_amount?: number | null;
          reward_value?: number | null;
          official_seller_status?: OfficialSellerStatus | null;
          return_policy_status?: ReturnPolicyStatus | null;
          delivery_days?: number | null;
          comparison_status?: ComparisonStatus | null;
          app_benefit_advertised?: boolean;
          is_active?: boolean;
          purchase_url?: string | null;
          observed_at?: string | null;
          source_verification_status?: 'VERIFIED' | 'UNKNOWN';
          selected_option_verification_status?: 'VERIFIED' | 'UNKNOWN';
          paid_configuration_verification_status?: 'VERIFIED' | 'UNKNOWN';
          verification_reason_codes?: string[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'seller_offers_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      seller_offer_benefits: {
        Row: {
          id: string;
          seller_offer_id: string;
          benefit_type: SellerOfferBenefitType;
          provider: string | null;
          required_membership_type: string | null;
          required_grade: string | null;
          required_card_issuer: string | null;
          required_card_product_code: string | null;
          discount_amount: number;
          exclusive_group: string | null;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          seller_offer_id: string;
          benefit_type: SellerOfferBenefitType;
          provider?: string | null;
          required_membership_type?: string | null;
          required_grade?: string | null;
          required_card_issuer?: string | null;
          required_card_product_code?: string | null;
          discount_amount: number;
          exclusive_group?: string | null;
          enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          seller_offer_id?: string;
          benefit_type?: SellerOfferBenefitType;
          provider?: string | null;
          required_membership_type?: string | null;
          required_grade?: string | null;
          required_card_issuer?: string | null;
          required_card_product_code?: string | null;
          discount_amount?: number;
          exclusive_group?: string | null;
          enabled?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'seller_offer_benefits_seller_offer_id_fkey';
            columns: ['seller_offer_id'];
            isOneToOne: false;
            referencedRelation: 'seller_offers';
            referencedColumns: ['id'];
          },
        ];
      };
      seller_offer_components: {
        Row: {
          id: string;
          seller_offer_id: string;
          component_type: ComponentType;
          name: string | null;
          capacity_value: number | null;
          capacity_unit: CapacityUnit | null;
          quantity: number | null;
          physical_type: ComponentPhysicalType;
          commercial_inclusion: CommercialInclusion;
          product_identity: ComponentProductIdentity;
          verification_status: 'VERIFIED' | 'UNKNOWN';
          created_at: string;
        };
        Insert: {
          id?: string;
          seller_offer_id: string;
          component_type: ComponentType;
          name?: string | null;
          capacity_value?: number | null;
          capacity_unit?: CapacityUnit | null;
          quantity?: number | null;
          physical_type?: ComponentPhysicalType;
          commercial_inclusion?: CommercialInclusion;
          product_identity?: ComponentProductIdentity;
          verification_status?: 'VERIFIED' | 'UNKNOWN';
          created_at?: string;
        };
        Update: {
          id?: string;
          seller_offer_id?: string;
          component_type?: ComponentType;
          name?: string | null;
          capacity_value?: number | null;
          capacity_unit?: CapacityUnit | null;
          quantity?: number | null;
          physical_type?: ComponentPhysicalType;
          commercial_inclusion?: CommercialInclusion;
          product_identity?: ComponentProductIdentity;
          verification_status?: 'VERIFIED' | 'UNKNOWN';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'seller_offer_components_seller_offer_id_fkey';
            columns: ['seller_offer_id'];
            isOneToOne: false;
            referencedRelation: 'seller_offers';
            referencedColumns: ['id'];
          },
        ];
      };
      price_history: {
        Row: {
          id: string;
          product_id: string;
          analysis_id: string | null;
          seller_offer_id: string | null;
          market_effective_price: number | null;
          listed_price: number | null;
          listed_sale_price: number | null;
          is_sale_observation: boolean;
          observation_key: string | null;
          observed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          analysis_id?: string | null;
          seller_offer_id?: string | null;
          market_effective_price?: number | null;
          listed_price?: number | null;
          listed_sale_price?: number | null;
          is_sale_observation?: boolean;
          observation_key?: string | null;
          observed_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          analysis_id?: string | null;
          seller_offer_id?: string | null;
          market_effective_price?: number | null;
          listed_price?: number | null;
          listed_sale_price?: number | null;
          is_sale_observation?: boolean;
          observation_key?: string | null;
          observed_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'price_history_analysis_id_fkey';
            columns: ['analysis_id'];
            isOneToOne: false;
            referencedRelation: 'analyses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'price_history_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'price_history_seller_offer_id_fkey';
            columns: ['seller_offer_id'];
            isOneToOne: false;
            referencedRelation: 'seller_offers';
            referencedColumns: ['id'];
          },
        ];
      };
      analyses: {
        Row: {
          id: string;
          user_id: string | null;
          idempotency_key: string | null;
          source_url: string;
          product_id: string | null;
          status: AnalysisStatus;
          verdict: Verdict | null;
          allowed_conclusions: AllowedConclusion[];
          selected_criteria: UserCriterion[];
          result_json: Json | null;
          warning_codes: WarningCode[];
          created_at: string;
          updated_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          idempotency_key?: string | null;
          source_url: string;
          product_id?: string | null;
          status: AnalysisStatus;
          verdict?: Verdict | null;
          allowed_conclusions?: AllowedConclusion[];
          selected_criteria: UserCriterion[];
          result_json?: Json | null;
          warning_codes?: WarningCode[];
          created_at?: string;
          updated_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          idempotency_key?: string | null;
          source_url?: string;
          product_id?: string | null;
          status?: AnalysisStatus;
          verdict?: Verdict | null;
          allowed_conclusions?: AllowedConclusion[];
          selected_criteria?: UserCriterion[];
          result_json?: Json | null;
          warning_codes?: WarningCode[];
          created_at?: string;
          updated_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'analyses_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      analysis_offers: {
        Row: {
          id: string;
          analysis_id: string;
          seller_offer_id: string | null;
          seller_identifier: string;
          seller_name: string;
          original_list_price: number | null;
          sale_price: number | null;
          market_effective_price: number | null;
          user_effective_price: number | null;
          shipping_fee: number | null;
          public_discount: number | null;
          user_discount: number | null;
          quantity: number | null;
          total_amount: number | null;
          unit: CapacityUnit | null;
          calculated_unit_price: number | null;
          offer_snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          analysis_id: string;
          seller_offer_id?: string | null;
          seller_identifier: string;
          seller_name: string;
          original_list_price?: number | null;
          sale_price?: number | null;
          market_effective_price?: number | null;
          user_effective_price?: number | null;
          shipping_fee?: number | null;
          public_discount?: number | null;
          user_discount?: number | null;
          quantity?: number | null;
          total_amount?: number | null;
          unit?: CapacityUnit | null;
          calculated_unit_price?: number | null;
          offer_snapshot: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          analysis_id?: string;
          seller_offer_id?: string | null;
          seller_identifier?: string;
          seller_name?: string;
          original_list_price?: number | null;
          sale_price?: number | null;
          market_effective_price?: number | null;
          user_effective_price?: number | null;
          shipping_fee?: number | null;
          public_discount?: number | null;
          user_discount?: number | null;
          quantity?: number | null;
          total_amount?: number | null;
          unit?: CapacityUnit | null;
          calculated_unit_price?: number | null;
          offer_snapshot?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'analysis_offers_analysis_id_fkey';
            columns: ['analysis_id'];
            isOneToOne: false;
            referencedRelation: 'analyses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'analysis_offers_seller_offer_id_fkey';
            columns: ['seller_offer_id'];
            isOneToOne: false;
            referencedRelation: 'seller_offers';
            referencedColumns: ['id'];
          },
        ];
      };
      saved_products: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'saved_products_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      price_alerts: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          target_price: number | null;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          target_price?: number | null;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          target_price?: number | null;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'price_alerts_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      register_user_account: {
        Args: {
          p_user_id: string;
          p_account_id: string;
          p_terms_version: string;
          p_document_sha256: string;
          p_accepted_at?: string;
        };
        Returns: boolean;
      };
      consume_user_search_quota: {
        Args: {
          p_user_id: string;
          p_idempotency_key: string;
          p_now?: string;
        };
        Returns: Json;
      };
      detach_user_abuse_subject: {
        Args: {
          p_user_id: string;
          p_now?: string;
        };
        Returns: undefined;
      };
      get_user_search_quota: {
        Args: {
          p_user_id: string;
        };
        Returns: Row<'user_search_quotas'>[];
      };
      ensure_phone_user_access: {
        Args: {
          p_user_id: string;
          p_phone_hmac: string;
          p_terms_version: string;
          p_document_sha256: string;
        };
        Returns: boolean;
      };
      has_current_terms_consent: {
        Args: {
          p_user_id: string;
          p_terms_version: string;
          p_document_sha256: string;
        };
        Returns: boolean;
      };
      persist_analysis_atomically: {
        Args: {
          payload: Json;
        };
        Returns: Row<'analyses'>;
      };
      purge_expired_analyses: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      purge_expired_abuse_subjects: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      purge_expired_terms_consents: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      resolve_search_quota_subject: {
        Args: {
          p_user_id: string;
        };
        Returns: string;
      };
      record_terms_consent: {
        Args: {
          p_user_id: string;
          p_terms_version: string;
          p_document_sha256: string;
          p_accepted_at?: string;
        };
        Returns: Row<'terms_consents'>;
      };
      upsert_phone_abuse_subject: {
        Args: {
          p_user_id: string;
          p_phone_hmac: string;
        };
        Returns: string;
      };
      withdraw_user_account: {
        Args: {
          p_user_id: string;
          p_now?: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
