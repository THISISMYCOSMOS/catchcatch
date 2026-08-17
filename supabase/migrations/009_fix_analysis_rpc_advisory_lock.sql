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
    perform pg_advisory_xact_lock(hashtextextended(
      (payload->>'userId') || ':' || (payload->>'idempotencyKey'),
      0
    ));

    select *
    into existing_analysis
    from public.analyses
    where user_id = payload->>'userId'
      and idempotency_key = payload->>'idempotencyKey'
    order by created_at asc
    limit 1;

    if found and existing_analysis.status <> 'FAILED' then
      return existing_analysis;
    end if;
  end if;

  if existing_analysis.id is not null then
    delete from public.analysis_offers
    where analysis_id = existing_analysis.id;

    delete from public.price_history
    where analysis_id = existing_analysis.id;

    update public.analyses
    set
      source_url = payload->>'sourceUrl',
      product_id = (payload->>'productId')::uuid,
      status = 'PENDING',
      verdict = null,
      allowed_conclusions = array[]::text[],
      selected_criteria = coalesce(
        array(select jsonb_array_elements_text(payload->'selectedCriteria')),
        array[]::text[]
      ),
      result_json = null,
      warning_codes = array[]::text[],
      updated_at = now()
    where id = existing_analysis.id
    returning * into analysis_row;
  else
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
    on conflict (user_id, idempotency_key)
      where idempotency_key is not null
      do update set updated_at = public.analyses.updated_at
    returning * into analysis_row;

    if analysis_row.status <> 'PENDING' and analysis_row.status <> 'FAILED' then
      return analysis_row;
    end if;
  end if;

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

