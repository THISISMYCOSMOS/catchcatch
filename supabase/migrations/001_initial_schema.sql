create extension if not exists pgcrypto;

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  selected_criteria text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_selected_criteria_count_chk
    check (cardinality(selected_criteria) = 3),
  constraint user_preferences_selected_criteria_unique_chk
    check (
      selected_criteria[1] <> selected_criteria[2]
      and selected_criteria[1] <> selected_criteria[3]
      and selected_criteria[2] <> selected_criteria[3]
    ),
  constraint user_preferences_selected_criteria_values_chk
    check (
      selected_criteria <@ array[
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
        'SET_AND_GIFTS',
        'RIGHT_SIZED_PURCHASE',
        'SIMPLE_DISCOUNT',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP'
      ]::text[]
    )
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  brand text,
  product_key text not null unique,
  package_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_package_type_chk
    check (package_type is null or package_type in ('single', 'set', 'bundle', 'unknown'))
);

create table public.product_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  component_type text not null,
  name text,
  capacity_value numeric,
  capacity_unit text,
  quantity integer,
  created_at timestamptz not null default now(),
  constraint product_components_component_type_chk
    check (component_type in (
      'MAIN',
      'REFILL',
      'MINI',
      'TRAVEL',
      'OTHER_COSMETIC',
      'NON_COSMETIC_GIFT',
      'UNKNOWN'
    )),
  constraint product_components_capacity_value_chk
    check (capacity_value is null or capacity_value >= 0),
  constraint product_components_capacity_unit_chk
    check (capacity_unit is null or capacity_unit in ('ML', 'G')),
  constraint product_components_quantity_chk
    check (quantity is null or quantity >= 1)
);

create table public.seller_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  seller_name text not null,
  seller_url text not null,
  listed_price numeric,
  market_effective_price numeric,
  user_effective_price numeric,
  official_seller_status text,
  return_policy_status text,
  delivery_days integer,
  comparison_status text,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint seller_offers_listed_price_chk
    check (listed_price is null or listed_price >= 0),
  constraint seller_offers_market_effective_price_chk
    check (market_effective_price is null or market_effective_price >= 0),
  constraint seller_offers_user_effective_price_chk
    check (user_effective_price is null or user_effective_price >= 0),
  constraint seller_offers_official_seller_status_chk
    check (
      official_seller_status is null
      or official_seller_status in ('confirmed_official', 'confirmed_non_official', 'unconfirmed')
    ),
  constraint seller_offers_return_policy_status_chk
    check (return_policy_status is null or return_policy_status in ('confirmed', 'unconfirmed')),
  constraint seller_offers_delivery_days_chk
    check (delivery_days is null or delivery_days >= 0),
  constraint seller_offers_comparison_status_chk
    check (
      comparison_status is null
      or comparison_status in ('DIRECTLY_COMPARABLE', 'UNIT_COMPARABLE', 'NOT_COMPARABLE', 'UNKNOWN')
    )
);

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  seller_offer_id uuid references public.seller_offers(id) on delete set null,
  market_effective_price numeric,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint price_history_market_effective_price_chk
    check (market_effective_price is null or market_effective_price >= 0)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  source_url text not null,
  product_id uuid references public.products(id) on delete set null,
  status text not null,
  verdict text,
  allowed_conclusions text[] not null default array[]::text[],
  selected_criteria text[] not null,
  result_json jsonb,
  warning_codes text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analyses_status_chk
    check (status in (
      'PENDING',
      'FAILED',
      'COMPLETED',
      'NEEDS_MORE_DATA',
      'INVALID_LINK',
      'PRODUCT_MISMATCH',
      'AI_JUDGMENT_FAILED',
      'INTERNAL_ERROR'
    )),
  constraint analyses_verdict_chk
    check (verdict is null or verdict in ('LOW_POINT_BUY', 'NEAR_REGULAR_PRICE', 'REASONABLE_BUY')),
  constraint analyses_allowed_conclusions_values_chk
    check (
      allowed_conclusions <@ array[
        'LOW_POINT_BUY',
        'NEAR_REGULAR_PRICE',
        'REASONABLE_BUY'
      ]::text[]
    ),
  constraint analyses_selected_criteria_count_chk
    check (cardinality(selected_criteria) = 3),
  constraint analyses_selected_criteria_unique_chk
    check (
      selected_criteria[1] <> selected_criteria[2]
      and selected_criteria[1] <> selected_criteria[3]
      and selected_criteria[2] <> selected_criteria[3]
    ),
  constraint analyses_selected_criteria_values_chk
    check (
      selected_criteria <@ array[
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
        'SET_AND_GIFTS',
        'RIGHT_SIZED_PURCHASE',
        'SIMPLE_DISCOUNT',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP'
      ]::text[]
    ),
  constraint analyses_warning_codes_values_chk
    check (
      warning_codes <@ array[
        'PRICE_HISTORY_INSUFFICIENT',
        'LOW_MATCH_CONFIDENCE',
        'COUPON_CONDITION_UNCONFIRMED',
        'SHIPPING_FEE_UNCONFIRMED',
        'OFFICIAL_SELLER_UNCONFIRMED',
        'RETURN_POLICY_UNCONFIRMED',
        'OPTION_CONFIRMATION_REQUIRED',
        'COMPOSITION_UNCLEAR',
        'DATA_OUTDATED',
        'OTHER'
      ]::text[]
    )
);

create table public.analysis_offers (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  seller_offer_id uuid references public.seller_offers(id) on delete set null,
  offer_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table public.saved_products (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_products_user_product_unique unique (user_id, product_id)
);

create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  product_id uuid not null references public.products(id) on delete cascade,
  target_price numeric,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_alerts_target_price_chk
    check (target_price is null or target_price >= 0)
);

create index product_components_product_id_idx on public.product_components(product_id);
create index seller_offers_product_id_idx on public.seller_offers(product_id);
create index seller_offers_observed_at_idx on public.seller_offers(observed_at);
create index price_history_product_id_idx on public.price_history(product_id);
create index price_history_seller_offer_id_idx on public.price_history(seller_offer_id);
create index price_history_observed_at_idx on public.price_history(observed_at);
create index analyses_product_id_idx on public.analyses(product_id);
create index analyses_user_id_idx on public.analyses(user_id);
create index analysis_offers_analysis_id_idx on public.analysis_offers(analysis_id);
create index analysis_offers_seller_offer_id_idx on public.analysis_offers(seller_offer_id);
create index saved_products_user_id_idx on public.saved_products(user_id);
create index saved_products_product_id_idx on public.saved_products(product_id);
create index price_alerts_user_id_idx on public.price_alerts(user_id);
create index price_alerts_product_id_idx on public.price_alerts(product_id);
