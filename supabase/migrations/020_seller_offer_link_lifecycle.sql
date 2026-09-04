-- Keep historical seller URLs for future direct refreshes while ensuring that
-- calculations only use offers confirmed by the latest seller search.
alter table public.seller_offers
  add column is_active boolean not null default true,
  add column purchase_url text;

create index seller_offers_product_active_idx
  on public.seller_offers(product_id, is_active);
