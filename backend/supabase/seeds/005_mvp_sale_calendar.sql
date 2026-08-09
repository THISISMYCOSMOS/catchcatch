insert into public.sale_calendar (
  seller_code,
  seller_name,
  title,
  description,
  sale_type,
  starts_at,
  ends_at,
  banner_image_url,
  landing_url,
  is_active,
  priority
) values
  (
    'OLIVE_YOUNG',
    'Olive Young',
    '[MOCK] Olive Young beauty sale window',
    'MVP mock sale calendar data for frontend display testing.',
    'MOCK_PROMOTION',
    now() - interval '2 days',
    now() + interval '5 days',
    null,
    'https://example.com/mock/olive-young-sale',
    true,
    10
  ),
  (
    'MUSINSA',
    'Musinsa',
    '[MOCK] Musinsa beauty week',
    'MVP mock upcoming sale calendar data.',
    'MOCK_PROMOTION',
    now() + interval '3 days',
    now() + interval '10 days',
    null,
    'https://example.com/mock/musinsa-beauty-week',
    true,
    20
  ),
  (
    'COUPANG',
    'Coupang',
    '[MOCK] Coupang beauty discount day',
    'MVP mock sale calendar data; not a real sale schedule.',
    'MOCK_PROMOTION',
    now() - interval '1 day',
    now() + interval '2 days',
    null,
    'https://example.com/mock/coupang-beauty-day',
    true,
    5
  ),
  (
    'BRAND_OFFICIAL',
    'Brand Official',
    '[MOCK] Brand official promotion',
    'MVP mock upcoming brand official event.',
    'MOCK_PROMOTION',
    now() + interval '7 days',
    now() + interval '14 days',
    null,
    'https://example.com/mock/brand-official-promotion',
    true,
    30
  ),
  (
    'OLIVE_YOUNG',
    'Olive Young',
    '[MOCK] Ended sample sale',
    'Ended MVP mock data retained for status filtering checks.',
    'MOCK_PROMOTION',
    now() - interval '14 days',
    now() - interval '7 days',
    null,
    'https://example.com/mock/ended-sale',
    true,
    40
  );

insert into public.products (
  canonical_name,
  brand,
  image_url,
  product_key,
  package_type
) values
  (
    '[MOCK] Hydrating Toner',
    'CatchCatch Mock',
    'https://example.com/mock/hydrating-toner.jpg',
    'mock-hydrating-toner',
    'single'
  ),
  (
    '[MOCK] Mild Sun Cream',
    'CatchCatch Mock',
    'https://example.com/mock/mild-sun-cream.jpg',
    'mock-mild-sun-cream',
    'single'
  ),
  (
    '[MOCK] Barrier Cream',
    'CatchCatch Mock',
    'https://example.com/mock/barrier-cream.jpg',
    'mock-barrier-cream',
    'single'
  )
on conflict (product_key) do update
set
  image_url = excluded.image_url,
  updated_at = now();

with mock_products as (
  select id, product_key
  from public.products
  where product_key in ('mock-hydrating-toner', 'mock-mild-sun-cream', 'mock-barrier-cream')
)
insert into public.seller_offers (
  product_id,
  seller_name,
  seller_url,
  listed_price,
  market_effective_price,
  official_seller_status,
  return_policy_status,
  delivery_days,
  comparison_status,
  observed_at
)
select
  id,
  'Mock Seller',
  'https://example.com/mock/' || product_key,
  case product_key
    when 'mock-hydrating-toner' then 18000
    when 'mock-mild-sun-cream' then 22000
    else 25000
  end,
  case product_key
    when 'mock-hydrating-toner' then 15000
    when 'mock-mild-sun-cream' then 17000
    else 21000
  end,
  'unconfirmed',
  'unconfirmed',
  2,
  'DIRECTLY_COMPARABLE',
  now()
from mock_products;

with mock_products as (
  select id, product_key
  from public.products
  where product_key in ('mock-hydrating-toner', 'mock-mild-sun-cream', 'mock-barrier-cream')
)
insert into public.price_history (
  product_id,
  market_effective_price,
  observed_at
)
select
  id,
  case product_key
    when 'mock-hydrating-toner' then 18000
    when 'mock-mild-sun-cream' then 19000
    else 23000
  end,
  now() - interval '10 days'
from mock_products;

insert into public.saved_products (user_id, product_id)
select 'test-user', id
from public.products
where product_key in ('mock-hydrating-toner', 'mock-mild-sun-cream', 'mock-barrier-cream')
on conflict (user_id, product_id) do nothing;
