alter table public.products
  add column image_url text;

create table public.sale_calendar (
  id uuid primary key default gen_random_uuid(),
  seller_code text not null,
  seller_name text not null,
  title text not null,
  description text,
  sale_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  banner_image_url text,
  landing_url text,
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_calendar_seller_code_non_empty_chk
    check (length(btrim(seller_code)) > 0),
  constraint sale_calendar_seller_name_non_empty_chk
    check (length(btrim(seller_name)) > 0),
  constraint sale_calendar_title_non_empty_chk
    check (length(btrim(title)) > 0),
  constraint sale_calendar_sale_type_non_empty_chk
    check (length(btrim(sale_type)) > 0),
  constraint sale_calendar_period_chk
    check (ends_at >= starts_at)
);

create index sale_calendar_active_period_idx
  on public.sale_calendar(is_active, starts_at, ends_at);

create index sale_calendar_priority_starts_at_idx
  on public.sale_calendar(priority, starts_at);
