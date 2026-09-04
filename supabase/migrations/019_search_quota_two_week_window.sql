update public.user_search_quotas
set
  window_expires_at = window_started_at + interval '14 days',
  updated_at = now()
where window_expires_at < window_started_at + interval '14 days';

update public.abuse_subjects subject
set
  tombstone_until = greatest(
    subject.tombstone_until,
    subject.updated_at + interval '14 days',
    coalesce(
      (
        select quota.window_expires_at
        from public.user_search_quotas quota
        where quota.user_id = subject.id::text
      ),
      subject.tombstone_until
    )
  ),
  updated_at = now()
where subject.tombstone_until is not null;

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
  quota_user_id text;
  quota_row public.user_search_quotas;
  existing_consumption public.user_search_quota_consumptions;
  quota_limit integer := 10;
  window_duration interval := interval '14 days';
begin
  if nullif(p_user_id, '') is null then
    raise exception 'user_id is required';
  end if;
  if nullif(p_idempotency_key, '') is null then
    raise exception 'idempotency_key is required';
  end if;

  quota_user_id := public.resolve_search_quota_subject(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(quota_user_id, 0));

  select * into existing_consumption
  from public.user_search_quota_consumptions
  where user_id = quota_user_id
    and idempotency_key = p_idempotency_key
  limit 1;

  select * into quota_row
  from public.user_search_quotas
  where user_id = quota_user_id
  for update;

  if found and quota_row.window_expires_at <= p_now then
    update public.user_search_quotas
    set
      window_started_at = p_now,
      window_expires_at = p_now + window_duration,
      used_count = 0,
      limit_count = quota_limit,
      updated_at = p_now
    where user_id = quota_user_id
    returning * into quota_row;
  end if;

  if quota_row.user_id is null then
    insert into public.user_search_quotas (
      user_id, window_started_at, window_expires_at,
      used_count, limit_count, created_at, updated_at
    ) values (
      quota_user_id, p_now, p_now + window_duration,
      0, quota_limit, p_now, p_now
    ) returning * into quota_row;
  end if;

  if existing_consumption.user_id is not null then
    return jsonb_build_object(
      'allowed', true, 'consumed', false, 'idempotent', true,
      'limit', quota_row.limit_count, 'used', quota_row.used_count,
      'remaining', greatest(quota_row.limit_count - quota_row.used_count, 0),
      'windowStartedAt', quota_row.window_started_at,
      'resetsAt', quota_row.window_expires_at
    );
  end if;

  if quota_row.used_count >= quota_row.limit_count then
    return jsonb_build_object(
      'allowed', false, 'consumed', false, 'idempotent', false,
      'limit', quota_row.limit_count, 'used', quota_row.used_count,
      'remaining', 0, 'windowStartedAt', quota_row.window_started_at,
      'resetsAt', quota_row.window_expires_at
    );
  end if;

  update public.user_search_quotas
  set used_count = used_count + 1, updated_at = p_now
  where user_id = quota_user_id
  returning * into quota_row;

  insert into public.user_search_quota_consumptions (
    user_id, idempotency_key, consumed_at, window_started_at
  ) values (
    quota_user_id, p_idempotency_key, p_now, quota_row.window_started_at
  ) on conflict (user_id, idempotency_key) do nothing;

  return jsonb_build_object(
    'allowed', true, 'consumed', true, 'idempotent', false,
    'limit', quota_row.limit_count, 'used', quota_row.used_count,
    'remaining', greatest(quota_row.limit_count - quota_row.used_count, 0),
    'windowStartedAt', quota_row.window_started_at,
    'resetsAt', quota_row.window_expires_at
  );
end;
$$;

create or replace function public.detach_user_abuse_subject(
  p_user_id text,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_id uuid;
  quota_expiry timestamptz;
begin
  delete from public.user_abuse_subjects
  where user_id = p_user_id
  returning abuse_subject_id into subject_id;

  if subject_id is null then
    return;
  end if;

  select window_expires_at into quota_expiry
  from public.user_search_quotas
  where user_id = subject_id::text;

  update public.abuse_subjects
  set
    tombstone_until = greatest(
      coalesce(tombstone_until, p_now),
      coalesce(quota_expiry, p_now),
      p_now + interval '14 days'
    ),
    updated_at = p_now
  where id = subject_id;
end;
$$;

revoke all on function public.consume_user_search_quota(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.detach_user_abuse_subject(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_user_search_quota(text, text, timestamptz)
  to service_role;
grant execute on function public.detach_user_abuse_subject(text, timestamptz)
  to service_role;
