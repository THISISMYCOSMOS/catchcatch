-- Service-role-only staging area for curated catalog datasets.
-- Raw workbook data lands here first and is promoted to products/seller_offers
-- only after the entire batch passes validation.

create table public.catalog_import_batches (
  id uuid primary key default gen_random_uuid(),
  dataset_name text not null,
  source_filename text not null,
  expected_product_count integer not null default 100,
  status text not null default 'DRAFT',
  validation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz,
  imported_at timestamptz,
  constraint catalog_import_batches_dataset_name_non_empty_chk
    check (length(btrim(dataset_name)) > 0),
  constraint catalog_import_batches_source_filename_non_empty_chk
    check (length(btrim(source_filename)) > 0),
  constraint catalog_import_batches_expected_product_count_chk
    check (expected_product_count between 1 and 10000),
  constraint catalog_import_batches_status_chk
    check (status in ('DRAFT', 'UPLOADED', 'VALIDATED', 'REJECTED', 'IMPORTED'))
);

create table public.catalog_import_products (
  batch_id uuid not null references public.catalog_import_batches(id) on delete cascade,
  dataset_product_id text not null,
  brand text not null,
  canonical_name text not null,
  product_type text not null,
  option text,
  shade_or_scent text,
  version_or_renewal text,
  package_type text not null,
  image_url text,
  popularity_rank integer,
  popularity_source text not null,
  popularity_source_url text not null,
  popularity_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (batch_id, dataset_product_id),
  constraint catalog_import_products_dataset_id_chk
    check (dataset_product_id ~ '^P[0-9]{3,5}$'),
  constraint catalog_import_products_required_text_chk
    check (
      length(btrim(brand)) > 0
      and length(btrim(canonical_name)) > 0
      and length(btrim(product_type)) > 0
      and length(btrim(popularity_source)) > 0
    ),
  constraint catalog_import_products_package_type_chk
    check (package_type in ('single', 'set', 'bundle', 'unknown')),
  constraint catalog_import_products_image_url_chk
    check (image_url is null or image_url ~ '^https://[^[:space:]]+$'),
  constraint catalog_import_products_popularity_rank_chk
    check (popularity_rank is null or popularity_rank >= 1),
  constraint catalog_import_products_popularity_source_url_chk
    check (popularity_source_url ~ '^https://[^[:space:]]+$')
);

create table public.catalog_import_product_components (
  batch_id uuid not null,
  dataset_product_id text not null,
  component_order integer not null,
  component_type text not null,
  component_name text,
  capacity_value numeric,
  capacity_unit text,
  quantity integer,
  created_at timestamptz not null default now(),
  primary key (batch_id, dataset_product_id, component_order),
  foreign key (batch_id, dataset_product_id)
    references public.catalog_import_products(batch_id, dataset_product_id)
    on delete cascade,
  constraint catalog_import_product_components_order_chk
    check (component_order >= 1),
  constraint catalog_import_product_components_type_chk
    check (component_type in (
      'MAIN',
      'REFILL',
      'MINI',
      'TRAVEL',
      'OTHER_COSMETIC',
      'NON_COSMETIC_GIFT',
      'UNKNOWN'
    )),
  constraint catalog_import_product_components_capacity_chk
    check (capacity_value is null or capacity_value > 0),
  constraint catalog_import_product_components_unit_chk
    check (capacity_unit is null or capacity_unit in ('ML', 'G')),
  constraint catalog_import_product_components_quantity_chk
    check (quantity is null or quantity >= 1)
);

create table public.catalog_import_seller_offers (
  batch_id uuid not null,
  dataset_offer_id text not null,
  dataset_product_id text not null,
  seller_code text not null,
  seller_url text not null,
  availability text not null,
  product_name_on_page text not null,
  list_price numeric,
  listed_sale_price numeric,
  public_coupon_amount numeric,
  automatic_discount_amount numeric,
  shipping_fee numeric,
  app_benefit_advertised boolean not null default false,
  price_observed_at timestamptz,
  match_verified_at timestamptz not null,
  verification_note text not null,
  created_at timestamptz not null default now(),
  primary key (batch_id, dataset_offer_id),
  foreign key (batch_id, dataset_product_id)
    references public.catalog_import_products(batch_id, dataset_product_id)
    on delete cascade,
  unique (batch_id, dataset_product_id, seller_code, seller_url),
  constraint catalog_import_seller_offers_dataset_id_chk
    check (dataset_offer_id ~ '^O-P[0-9]{3,5}-[A-Z0-9_-]+$'),
  constraint catalog_import_seller_offers_seller_code_chk
    check (seller_code in (
      'OLIVE_YOUNG',
      'MUSINSA_BEAUTY',
      'COUPANG',
      'ZIGZAG',
      'BRAND_OFFICIAL'
    )),
  constraint catalog_import_seller_offers_availability_chk
    check (availability in ('AVAILABLE', 'NOT_AVAILABLE', 'UNKNOWN')),
  constraint catalog_import_seller_offers_required_text_chk
    check (
      length(btrim(product_name_on_page)) > 0
      and length(btrim(verification_note)) > 0
    ),
  constraint catalog_import_seller_offers_url_chk
    check (seller_url ~ '^https://[^[:space:]]+$'),
  constraint catalog_import_seller_offers_domain_chk
    check (
      (seller_code = 'OLIVE_YOUNG' and lower(seller_url) ~ '^https://([a-z0-9-]+\.)*oliveyoung\.co\.kr(/|$)')
      or (seller_code = 'MUSINSA_BEAUTY' and lower(seller_url) ~ '^https://([a-z0-9-]+\.)*musinsa\.com(/|$)')
      or (
        seller_code = 'COUPANG'
        and lower(seller_url) ~ '^https://([a-z0-9-]+\.)*coupang\.com(/|$)'
        and lower(seller_url) !~ '^https://link\.coupang\.com(/|$)'
      )
      or (seller_code = 'ZIGZAG' and lower(seller_url) ~ '^https://([a-z0-9-]+\.)*zigzag\.kr(/|$)')
      or seller_code = 'BRAND_OFFICIAL'
    ),
  constraint catalog_import_seller_offers_price_chk
    check (
      (list_price is null or (list_price >= 0 and list_price = trunc(list_price)))
      and (listed_sale_price is null or (listed_sale_price >= 0 and listed_sale_price = trunc(listed_sale_price)))
      and (public_coupon_amount is null or (public_coupon_amount >= 0 and public_coupon_amount = trunc(public_coupon_amount)))
      and (automatic_discount_amount is null or (automatic_discount_amount >= 0 and automatic_discount_amount = trunc(automatic_discount_amount)))
      and (shipping_fee is null or (shipping_fee >= 0 and shipping_fee = trunc(shipping_fee)))
    ),
  constraint catalog_import_seller_offers_sale_price_chk
    check (list_price is null or listed_sale_price is null or listed_sale_price <= list_price),
  constraint catalog_import_seller_offers_price_observed_at_chk
    check (
      (
        list_price is null
        and listed_sale_price is null
        and public_coupon_amount is null
        and automatic_discount_amount is null
        and shipping_fee is null
      )
      or price_observed_at is not null
    ),
  constraint catalog_import_seller_offers_unavailable_price_chk
    check (
      availability = 'AVAILABLE'
      or (
        list_price is null
        and listed_sale_price is null
        and public_coupon_amount is null
        and automatic_discount_amount is null
        and shipping_fee is null
      )
    )
);

create table public.catalog_import_seller_offer_components (
  batch_id uuid not null,
  dataset_offer_id text not null,
  component_order integer not null,
  component_type text not null,
  component_name text,
  capacity_value numeric,
  capacity_unit text,
  quantity integer,
  created_at timestamptz not null default now(),
  primary key (batch_id, dataset_offer_id, component_order),
  foreign key (batch_id, dataset_offer_id)
    references public.catalog_import_seller_offers(batch_id, dataset_offer_id)
    on delete cascade,
  constraint catalog_import_seller_offer_components_order_chk
    check (component_order >= 1),
  constraint catalog_import_seller_offer_components_type_chk
    check (component_type in (
      'MAIN',
      'REFILL',
      'MINI',
      'TRAVEL',
      'OTHER_COSMETIC',
      'NON_COSMETIC_GIFT',
      'UNKNOWN'
    )),
  constraint catalog_import_seller_offer_components_capacity_chk
    check (capacity_value is null or capacity_value > 0),
  constraint catalog_import_seller_offer_components_unit_chk
    check (capacity_unit is null or capacity_unit in ('ML', 'G')),
  constraint catalog_import_seller_offer_components_quantity_chk
    check (quantity is null or quantity >= 1)
);

create table public.product_popularity_observations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  import_batch_id uuid references public.catalog_import_batches(id) on delete set null,
  source_name text not null,
  source_url text not null,
  source_rank integer,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint product_popularity_observations_source_name_chk
    check (length(btrim(source_name)) > 0),
  constraint product_popularity_observations_source_url_chk
    check (source_url ~ '^https://[^[:space:]]+$'),
  constraint product_popularity_observations_source_rank_chk
    check (source_rank is null or source_rank >= 1),
  unique (product_id, source_url, observed_at)
);

create index catalog_import_products_batch_idx
  on public.catalog_import_products(batch_id);
create index catalog_import_seller_offers_batch_product_idx
  on public.catalog_import_seller_offers(batch_id, dataset_product_id);
create index product_popularity_observations_product_observed_idx
  on public.product_popularity_observations(product_id, observed_at desc);

create or replace function public.validate_catalog_import_batch(target_batch_id uuid)
returns table (
  error_code text,
  row_reference text,
  error_message text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    'BATCH_NOT_FOUND'::text,
    target_batch_id::text,
    'Import batch does not exist'::text
  where not exists (
    select 1 from public.catalog_import_batches where id = target_batch_id
  )

  union all

  select
    'PRODUCT_COUNT_MISMATCH',
    target_batch_id::text,
    format('Expected %s products but found %s', batch.expected_product_count, counts.product_count)
  from public.catalog_import_batches batch
  cross join lateral (
    select count(*)::integer as product_count
    from public.catalog_import_products product
    where product.batch_id = batch.id
  ) counts
  where batch.id = target_batch_id
    and counts.product_count <> batch.expected_product_count

  union all

  select
    'PRODUCT_ID_SEQUENCE_MISMATCH',
    format('P%s', lpad(expected_number::text, 3, '0')),
    'Expected dataset product ID is missing'
  from public.catalog_import_batches batch
  cross join lateral generate_series(1, batch.expected_product_count) expected_number
  where batch.id = target_batch_id
    and not exists (
      select 1
      from public.catalog_import_products product
      where product.batch_id = batch.id
        and product.dataset_product_id = format('P%s', lpad(expected_number::text, 3, '0'))
    )

  union all

  select
    'PRODUCT_COMPONENT_MISSING',
    product.dataset_product_id,
    'Every product must have at least one product component'
  from public.catalog_import_products product
  where product.batch_id = target_batch_id
    and not exists (
      select 1
      from public.catalog_import_product_components component
      where component.batch_id = product.batch_id
        and component.dataset_product_id = product.dataset_product_id
    )

  union all

  select
    'PRODUCT_COMPONENT_ORDER_GAP',
    component.dataset_product_id,
    'Product component_order values must be consecutive starting at 1'
  from public.catalog_import_product_components component
  where component.batch_id = target_batch_id
  group by component.dataset_product_id
  having min(component.component_order) <> 1
    or max(component.component_order) <> count(*)

  union all

  select
    'SELLER_OFFER_MISSING',
    product.dataset_product_id,
    'Every product must have at least one seller offer row'
  from public.catalog_import_products product
  where product.batch_id = target_batch_id
    and not exists (
      select 1
      from public.catalog_import_seller_offers offer
      where offer.batch_id = product.batch_id
        and offer.dataset_product_id = product.dataset_product_id
    )

  union all

  select
    'AVAILABLE_OFFER_COMPONENT_MISSING',
    offer.dataset_offer_id,
    'Every AVAILABLE seller offer must have at least one offer component'
  from public.catalog_import_seller_offers offer
  where offer.batch_id = target_batch_id
    and offer.availability = 'AVAILABLE'
    and not exists (
      select 1
      from public.catalog_import_seller_offer_components component
      where component.batch_id = offer.batch_id
        and component.dataset_offer_id = offer.dataset_offer_id
    )

  union all

  select
    'SELLER_OFFER_COMPONENT_ORDER_GAP',
    component.dataset_offer_id,
    'Seller offer component_order values must be consecutive starting at 1'
  from public.catalog_import_seller_offer_components component
  where component.batch_id = target_batch_id
  group by component.dataset_offer_id
  having min(component.component_order) <> 1
    or max(component.component_order) <> count(*)

  union all

  select
    'SELLER_URL_REUSED_ACROSS_PRODUCTS',
    min(offer.dataset_offer_id),
    'The same normalized seller URL is assigned to more than one product'
  from public.catalog_import_seller_offers offer
  where offer.batch_id = target_batch_id
  group by lower(rtrim(offer.seller_url, '/'))
  having count(distinct offer.dataset_product_id) > 1;
$$;

alter table public.catalog_import_batches enable row level security;
alter table public.catalog_import_products enable row level security;
alter table public.catalog_import_product_components enable row level security;
alter table public.catalog_import_seller_offers enable row level security;
alter table public.catalog_import_seller_offer_components enable row level security;
alter table public.product_popularity_observations enable row level security;

revoke all on table
  public.catalog_import_batches,
  public.catalog_import_products,
  public.catalog_import_product_components,
  public.catalog_import_seller_offers,
  public.catalog_import_seller_offer_components,
  public.product_popularity_observations
from anon, authenticated;

grant all on table
  public.catalog_import_batches,
  public.catalog_import_products,
  public.catalog_import_product_components,
  public.catalog_import_seller_offers,
  public.catalog_import_seller_offer_components,
  public.product_popularity_observations
to service_role;

revoke all on function public.validate_catalog_import_batch(uuid)
  from public, anon, authenticated;
grant execute on function public.validate_catalog_import_batch(uuid)
  to service_role;

comment on table public.catalog_import_batches is
  'Service-role-only metadata for validated catalog workbook imports.';
comment on table public.catalog_import_products is
  'Unpromoted product rows from a catalog import workbook.';
comment on table public.catalog_import_seller_offers is
  'Unpromoted seller links and point-in-time public prices from a catalog import workbook.';
comment on table public.product_popularity_observations is
  'Auditable popularity source observations retained after a catalog import is promoted.';
