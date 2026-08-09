alter table public.seller_offers
  add column listed_sale_price numeric,
  add column shipping_fee numeric,
  add column public_discount_amount numeric,
  add column automatic_discount_amount numeric,
  add column reward_value numeric,
  add constraint seller_offers_listed_sale_price_nonnegative_chk
    check (listed_sale_price is null or listed_sale_price >= 0),
  add constraint seller_offers_shipping_fee_nonnegative_chk
    check (shipping_fee is null or shipping_fee >= 0),
  add constraint seller_offers_public_discount_amount_nonnegative_chk
    check (public_discount_amount is null or public_discount_amount >= 0),
  add constraint seller_offers_automatic_discount_amount_nonnegative_chk
    check (automatic_discount_amount is null or automatic_discount_amount >= 0),
  add constraint seller_offers_reward_value_nonnegative_chk
    check (reward_value is null or reward_value >= 0);

create table public.seller_offer_benefits (
  id uuid primary key default gen_random_uuid(),
  seller_offer_id uuid not null references public.seller_offers(id) on delete cascade,
  benefit_type text not null check (benefit_type in ('MEMBERSHIP', 'SHOPPING_GRADE', 'CARD')),
  provider text,
  required_membership_type text,
  required_grade text,
  required_card_issuer text,
  required_card_product_code text,
  discount_amount numeric not null check (discount_amount >= 0),
  exclusive_group text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index seller_offer_benefits_offer_idx
  on public.seller_offer_benefits(seller_offer_id);

create unique index seller_offer_benefits_unique_idx
  on public.seller_offer_benefits(
    seller_offer_id,
    benefit_type,
    coalesce(provider, ''),
    coalesce(required_membership_type, ''),
    coalesce(required_grade, ''),
    coalesce(required_card_issuer, ''),
    coalesce(required_card_product_code, ''),
    discount_amount,
    coalesce(exclusive_group, '')
  );
