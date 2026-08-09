alter table public.analysis_offers
  add column seller_identifier text,
  add column seller_name text,
  add column original_list_price numeric,
  add column sale_price numeric,
  add column market_effective_price numeric,
  add column user_effective_price numeric,
  add column shipping_fee numeric,
  add column public_discount numeric,
  add column user_discount numeric,
  add column quantity numeric,
  add column total_amount numeric,
  add column unit text,
  add column calculated_unit_price numeric;

update public.analysis_offers
set
  seller_identifier = coalesce(seller_offer_id::text, id::text),
  seller_name = 'UNKNOWN'
where seller_identifier is null or seller_name is null;

alter table public.analysis_offers
  alter column seller_identifier set not null,
  alter column seller_name set not null,
  add constraint analysis_offers_user_price_nonnegative_chk
    check (user_effective_price is null or user_effective_price >= 0),
  add constraint analysis_offers_market_price_nonnegative_chk
    check (market_effective_price is null or market_effective_price >= 0),
  add constraint analysis_offers_original_list_price_nonnegative_chk
    check (original_list_price is null or original_list_price >= 0),
  add constraint analysis_offers_sale_price_nonnegative_chk
    check (sale_price is null or sale_price >= 0),
  add constraint analysis_offers_shipping_fee_nonnegative_chk
    check (shipping_fee is null or shipping_fee >= 0),
  add constraint analysis_offers_public_discount_nonnegative_chk
    check (public_discount is null or public_discount >= 0),
  add constraint analysis_offers_user_discount_nonnegative_chk
    check (user_discount is null or user_discount >= 0),
  add constraint analysis_offers_quantity_nonnegative_chk
    check (quantity is null or quantity >= 0),
  add constraint analysis_offers_total_amount_nonnegative_chk
    check (total_amount is null or total_amount >= 0),
  add constraint analysis_offers_unit_chk
    check (unit is null or unit in ('ML', 'G')),
  add constraint analysis_offers_analysis_seller_identifier_unique
    unique (analysis_id, seller_identifier);

create index analyses_user_created_at_idx
  on public.analyses(user_id, created_at desc);

create index analysis_offers_analysis_created_at_idx
  on public.analysis_offers(analysis_id, created_at);
