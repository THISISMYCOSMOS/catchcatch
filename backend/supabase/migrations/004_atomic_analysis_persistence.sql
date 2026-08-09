alter table public.analyses
  add column idempotency_key text;

create unique index analyses_user_idempotency_key_unique
  on public.analyses(user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.price_history
  add column analysis_id uuid references public.analyses(id) on delete cascade;

create unique index price_history_analysis_product_offer_unique
  on public.price_history(
    analysis_id,
    product_id,
    coalesce(seller_offer_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where analysis_id is not null;

create index price_history_analysis_id_idx
  on public.price_history(analysis_id);

create or replace function public.persist_analysis_atomically(payload jsonb)
returns public.analyses
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_analysis public.analyses;
  analysis_row public.analyses;
  offer_snapshot jsonb;
  price_history_entry jsonb;
begin
  if nullif(payload->>'userId', '') is null then
    raise exception 'userId is required';
  end if;

  if nullif(payload->>'productId', '') is null then
    raise exception 'productId is required';
  end if;

  if nullif(payload->>'sourceUrl', '') is null then
    raise exception 'sourceUrl is required';
  end if;

  if nullif(payload->>'idempotencyKey', '') is not null then
    select *
    into existing_analysis
    from public.analyses
    where user_id = payload->>'userId'
      and idempotency_key = payload->>'idempotencyKey'
    order by created_at asc
    limit 1;

    if found then
      return existing_analysis;
    end if;
  end if;

  insert into public.analyses (
    user_id,
    idempotency_key,
    source_url,
    product_id,
    status,
    verdict,
    allowed_conclusions,
    selected_criteria,
    result_json,
    warning_codes
  )
  values (
    payload->>'userId',
    nullif(payload->>'idempotencyKey', ''),
    payload->>'sourceUrl',
    (payload->>'productId')::uuid,
    'PENDING',
    null,
    array[]::text[],
    coalesce(
      array(select jsonb_array_elements_text(payload->'selectedCriteria')),
      array[]::text[]
    ),
    null,
    array[]::text[]
  )
  returning * into analysis_row;

  for offer_snapshot in
    select value from jsonb_array_elements(coalesce(payload->'offerSnapshots', '[]'::jsonb))
  loop
    insert into public.analysis_offers (
      analysis_id,
      seller_offer_id,
      seller_identifier,
      seller_name,
      original_list_price,
      sale_price,
      market_effective_price,
      user_effective_price,
      shipping_fee,
      public_discount,
      user_discount,
      quantity,
      total_amount,
      unit,
      calculated_unit_price,
      offer_snapshot
    )
    values (
      analysis_row.id,
      nullif(offer_snapshot->>'seller_offer_id', '')::uuid,
      offer_snapshot->>'seller_identifier',
      offer_snapshot->>'seller_name',
      nullif(offer_snapshot->>'original_list_price', '')::numeric,
      nullif(offer_snapshot->>'sale_price', '')::numeric,
      nullif(offer_snapshot->>'market_effective_price', '')::numeric,
      nullif(offer_snapshot->>'user_effective_price', '')::numeric,
      nullif(offer_snapshot->>'shipping_fee', '')::numeric,
      nullif(offer_snapshot->>'public_discount', '')::numeric,
      nullif(offer_snapshot->>'user_discount', '')::numeric,
      nullif(offer_snapshot->>'quantity', '')::numeric,
      nullif(offer_snapshot->>'total_amount', '')::numeric,
      nullif(offer_snapshot->>'unit', ''),
      nullif(offer_snapshot->>'calculated_unit_price', '')::numeric,
      offer_snapshot->'offer_snapshot'
    )
    on conflict (analysis_id, seller_identifier) do nothing;
  end loop;

  for price_history_entry in
    select value from jsonb_array_elements(coalesce(payload->'priceHistoryEntries', '[]'::jsonb))
  loop
    insert into public.price_history (
      analysis_id,
      product_id,
      seller_offer_id,
      market_effective_price,
      observed_at
    )
    values (
      analysis_row.id,
      (price_history_entry->>'product_id')::uuid,
      nullif(price_history_entry->>'seller_offer_id', '')::uuid,
      nullif(price_history_entry->>'market_effective_price', '')::numeric,
      (price_history_entry->>'observed_at')::timestamptz
    )
    on conflict do nothing;
  end loop;

  update public.analyses
  set
    status = (payload->>'status'),
    verdict = nullif(payload->>'verdict', ''),
    allowed_conclusions = coalesce(
      array(select jsonb_array_elements_text(payload->'allowedConclusions')),
      array[]::text[]
    ),
    warning_codes = coalesce(
      array(select jsonb_array_elements_text(payload->'warningCodes')),
      array[]::text[]
    ),
    result_json = payload->'resultJson',
    updated_at = now()
  where id = analysis_row.id
  returning * into analysis_row;

  return analysis_row;
end;
$$;
