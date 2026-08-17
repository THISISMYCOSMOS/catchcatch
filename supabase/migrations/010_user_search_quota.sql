create table public.user_search_quotas (
  user_id text primary key,
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  used_count integer not null default 0,
  limit_count integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_search_quotas_used_count_chk
    check (used_count >= 0),
  constraint user_search_quotas_limit_count_chk
    check (limit_count > 0),
  constraint user_search_quotas_used_limit_chk
    check (used_count <= limit_count),
  constraint user_search_quotas_window_chk
    check (window_expires_at > window_started_at)
);

create table public.user_search_quota_consumptions (
  user_id text not null,
  idempotency_key text not null,
  consumed_at timestamptz not null default now(),
  window_started_at timestamptz not null,
  primary key (user_id, idempotency_key),
  constraint user_search_quota_consumptions_key_non_empty_chk
    check (length(btrim(idempotency_key)) > 0)
);

create index user_search_quota_consumptions_user_consumed_at_idx
  on public.user_search_quota_consumptions(user_id, consumed_at desc);

create or replace function public.consume_user_search_quota(
  p_user_id text,
  p_idempotency_key text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quota_row public.user_search_quotas;
  existing_consumption public.user_search_quota_consumptions;
  quota_limit integer := 10;
  window_duration interval := interval '7 days';
begin
  if nullif(p_user_id, '') is null then
    raise exception 'user_id is required';
  end if;

  if nullif(p_idempotency_key, '') is null then
    raise exception 'idempotency_key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id, 0));

  select *
  into existing_consumption
  from public.user_search_quota_consumptions
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key
  limit 1;

  select *
  into quota_row
  from public.user_search_quotas
  where user_id = p_user_id
  for update;

  if found and quota_row.window_expires_at <= p_now then
    update public.user_search_quotas
    set
      window_started_at = p_now,
      window_expires_at = p_now + window_duration,
      used_count = 0,
      limit_count = quota_limit,
      updated_at = p_now
    where user_id = p_user_id
    returning * into quota_row;
  end if;

  if quota_row.user_id is null then
    insert into public.user_search_quotas (
      user_id,
      window_started_at,
      window_expires_at,
      used_count,
      limit_count,
      created_at,
      updated_at
    )
    values (
      p_user_id,
      p_now,
      p_now + window_duration,
      0,
      quota_limit,
      p_now,
      p_now
    )
    returning * into quota_row;
  end if;

  if existing_consumption.user_id is not null then
    return jsonb_build_object(
      'allowed', true,
      'consumed', false,
      'idempotent', true,
      'limit', quota_row.limit_count,
      'used', quota_row.used_count,
      'remaining', greatest(quota_row.limit_count - quota_row.used_count, 0),
      'windowStartedAt', quota_row.window_started_at,
      'resetsAt', quota_row.window_expires_at
    );
  end if;

  if quota_row.used_count >= quota_row.limit_count then
    return jsonb_build_object(
      'allowed', false,
      'consumed', false,
      'idempotent', false,
      'limit', quota_row.limit_count,
      'used', quota_row.used_count,
      'remaining', 0,
      'windowStartedAt', quota_row.window_started_at,
      'resetsAt', quota_row.window_expires_at
    );
  end if;

  update public.user_search_quotas
  set
    used_count = used_count + 1,
    updated_at = p_now
  where user_id = p_user_id
  returning * into quota_row;

  insert into public.user_search_quota_consumptions (
    user_id,
    idempotency_key,
    consumed_at,
    window_started_at
  )
  values (
    p_user_id,
    p_idempotency_key,
    p_now,
    quota_row.window_started_at
  )
  on conflict (user_id, idempotency_key) do nothing;

  return jsonb_build_object(
    'allowed', true,
    'consumed', true,
    'idempotent', false,
    'limit', quota_row.limit_count,
    'used', quota_row.used_count,
    'remaining', greatest(quota_row.limit_count - quota_row.used_count, 0),
    'windowStartedAt', quota_row.window_started_at,
    'resetsAt', quota_row.window_expires_at
  );
end;
$$;
