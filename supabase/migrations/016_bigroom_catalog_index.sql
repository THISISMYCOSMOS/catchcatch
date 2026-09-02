create table public.bigroom_catalog_items (
  id uuid primary key default gen_random_uuid(),
  external_product_id text not null unique,
  product_url text not null unique,
  product_slug text not null,
  search_text text not null,
  sitemap_indexed boolean not null default false,
  product_name text,
  listed_price numeric,
  listed_sale_price numeric,
  public_coupon_amount numeric,
  shipping_fee numeric,
  capacity_value numeric,
  capacity_unit text,
  quantity integer,
  offer_kind text not null default 'UNKNOWN',
  app_benefit_advertised boolean not null default false,
  availability_status text not null default 'UNKNOWN',
  sitemap_last_modified_at timestamptz,
  detail_verified_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bigroom_catalog_items_price_chk check (
    (listed_price is null or listed_price >= 0)
    and (listed_sale_price is null or listed_sale_price >= 0)
    and (public_coupon_amount is null or public_coupon_amount >= 0)
    and (shipping_fee is null or shipping_fee >= 0)
  ),
  constraint bigroom_catalog_items_capacity_chk check (
    capacity_value is null or capacity_value > 0
  ),
  constraint bigroom_catalog_items_capacity_unit_chk check (
    capacity_unit is null or capacity_unit in ('ML', 'G')
  ),
  constraint bigroom_catalog_items_quantity_chk check (
    quantity is null or quantity >= 1
  ),
  constraint bigroom_catalog_items_offer_kind_chk check (
    offer_kind in ('SINGLE', 'SAME_PRODUCT_MULTI', 'MIXED_SET', 'UNKNOWN')
  ),
  constraint bigroom_catalog_items_availability_chk check (
    availability_status in ('AVAILABLE', 'NOT_AVAILABLE', 'UNKNOWN')
  )
);

create index bigroom_catalog_items_search_text_idx
  on public.bigroom_catalog_items(search_text text_pattern_ops);
create index bigroom_catalog_items_last_seen_idx
  on public.bigroom_catalog_items(last_seen_at desc);
create index bigroom_catalog_items_detail_verified_idx
  on public.bigroom_catalog_items(detail_verified_at desc);

alter table public.bigroom_catalog_items enable row level security;
alter table public.price_history enable row level security;

revoke all on table public.bigroom_catalog_items, public.price_history
  from anon, authenticated;

comment on table public.bigroom_catalog_items is
  'Lightweight Bigroom sitemap index plus on-demand verified detail cache. Service-role access only.';

alter table public.seller_offers
  add column if not exists app_benefit_advertised boolean not null default false;
