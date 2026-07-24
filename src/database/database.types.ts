import {
  AnalysisStatus,
  AllowedConclusion,
  CapacityUnit,
  ComparisonStatus,
  ComponentType,
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

export type Database = {
  public: {
    Tables: {
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
      products: {
        Row: {
          id: string;
          canonical_name: string;
          brand: string | null;
          product_key: string;
          package_type: PackageType | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          canonical_name: string;
          brand?: string | null;
          product_key: string;
          package_type?: PackageType | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          canonical_name?: string;
          brand?: string | null;
          product_key?: string;
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
      seller_offers: {
        Row: {
          id: string;
          product_id: string;
          seller_name: string;
          seller_url: string;
          listed_price: number | null;
          market_effective_price: number | null;
          user_effective_price: number | null;
          official_seller_status: OfficialSellerStatus | null;
          return_policy_status: ReturnPolicyStatus | null;
          delivery_days: number | null;
          comparison_status: ComparisonStatus | null;
          observed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          seller_name: string;
          seller_url: string;
          listed_price?: number | null;
          market_effective_price?: number | null;
          user_effective_price?: number | null;
          official_seller_status?: OfficialSellerStatus | null;
          return_policy_status?: ReturnPolicyStatus | null;
          delivery_days?: number | null;
          comparison_status?: ComparisonStatus | null;
          observed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          seller_name?: string;
          seller_url?: string;
          listed_price?: number | null;
          market_effective_price?: number | null;
          user_effective_price?: number | null;
          official_seller_status?: OfficialSellerStatus | null;
          return_policy_status?: ReturnPolicyStatus | null;
          delivery_days?: number | null;
          comparison_status?: ComparisonStatus | null;
          observed_at?: string | null;
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
      price_history: {
        Row: {
          id: string;
          product_id: string;
          seller_offer_id: string | null;
          market_effective_price: number | null;
          observed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          seller_offer_id?: string | null;
          market_effective_price?: number | null;
          observed_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          seller_offer_id?: string | null;
          market_effective_price?: number | null;
          observed_at?: string;
          created_at?: string;
        };
        Relationships: [
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
        };
        Insert: {
          id?: string;
          user_id?: string | null;
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
        };
        Update: {
          id?: string;
          user_id?: string | null;
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
          offer_snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          analysis_id: string;
          seller_offer_id?: string | null;
          offer_snapshot: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          analysis_id?: string;
          seller_offer_id?: string | null;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
