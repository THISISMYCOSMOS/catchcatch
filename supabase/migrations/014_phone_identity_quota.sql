create table public.abuse_subjects (
  id uuid primary key default gen_random_uuid(),
  phone_hmac text not null unique,
  tombstone_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint abuse_subjects_phone_hmac_chk
    check (phone_hmac ~ '^[0-9a-f]{64}$')
);

create table public.user_abuse_subjects (
  user_id text primary key,
  abuse_subject_id uuid not null references public.abuse_subjects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index user_abuse_subjects_subject_idx
  on public.user_abuse_subjects(abuse_subject_id);

alter table public.abuse_subjects enable row level security;
alter table public.user_abuse_subjects enable row level security;

revoke all on public.abuse_subjects from anon, authenticated;
revoke all on public.user_abuse_subjects from anon, authenticated;
grant all on public.abuse_subjects to service_role;
grant all on public.user_abuse_subjects to service_role;

create or replace function public.resolve_search_quota_subject(p_user_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select mapping.abuse_subject_id::text
      from public.user_abuse_subjects mapping
      where mapping.user_id = p_user_id
    ),
    p_user_id
  );
$$;

create or replace function public.upsert_phone_abuse_subject(
  p_user_id text,
  p_phone_hmac text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_id uuid;
  subject_key text;
  legacy_quota public.user_search_quotas;
  subject_quota public.user_search_quotas;
begin
  if nullif(btrim(p_user_id), '') is null then
    raise exception 'user_id is required';
  end if;
  if p_phone_hmac is null or p_phone_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'phone_hmac must be a lowercase SHA-256 HMAC';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone_hmac, 0));

  insert into public.abuse_subjects (phone_hmac, tombstone_until, created_at, updated_at)
  values (p_phone_hmac, null, now(), now())
  on conflict (phone_hmac) do update
    set tombstone_until = null, updated_at = excluded.updated_at
  returning id into subject_id;

  subject_key := subject_id::text;

  insert into public.user_abuse_subjects (user_id, abuse_subject_id, created_at)
  values (p_user_id, subject_id, now())
  on conflict (user_id) do update
    set abuse_subject_id = excluded.abuse_subject_id;

  if p_user_id <> subject_key then
    select * into legacy_quota
    from public.user_search_quotas
    where user_id = p_user_id
    for update;

    select * into subject_quota
    from public.user_search_quotas
    where user_id = subject_key
    for update;

    if legacy_quota.user_id is not null and subject_quota.user_id is null then
      update public.user_search_quotas
      set user_id = subject_key, updated_at = now()
      where user_id = p_user_id;
    elsif legacy_quota.user_id is not null and subject_quota.user_id is not null then
      update public.user_search_quotas
      set
        window_started_at = least(window_started_at, legacy_quota.window_started_at),
        window_expires_at = greatest(window_expires_at, legacy_quota.window_expires_at),
        used_count = least(limit_count, used_count + legacy_quota.used_count),
        updated_at = now()
      where user_id = subject_key;

      delete from public.user_search_quotas where user_id = p_user_id;
    end if;

    insert into public.user_search_quota_consumptions (
      user_id,
      idempotency_key,
      consumed_at,
      window_started_at
    )
    select
      subject_key,
      idempotency_key,
      consumed_at,
      window_started_at
    from public.user_search_quota_consumptions
    where user_id = p_user_id
    on conflict (user_id, idempotency_key) do nothing;

    delete from public.user_search_quota_consumptions where user_id = p_user_id;
  end if;

  return subject_id;
end;
$$;

create or replace function public.get_user_search_quota(p_user_id text)
returns setof public.user_search_quotas
language sql
stable
security definer
set search_path = public
as $$
  select quota.*
  from public.user_search_quotas quota
  where quota.user_id = public.resolve_search_quota_subject(p_user_id)
  limit 1;
$$;

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
  window_duration interval := interval '7 days';
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
      p_now + interval '7 days'
    ),
    updated_at = p_now
  where id = subject_id;
end;
$$;

create or replace function public.handle_deleted_auth_user_abuse_subject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.detach_user_abuse_subject(old.id::text, now());
  return old;
end;
$$;

drop trigger if exists detach_abuse_subject_after_auth_user_delete on auth.users;
create trigger detach_abuse_subject_after_auth_user_delete
after delete on auth.users
for each row execute function public.handle_deleted_auth_user_abuse_subject();

create or replace function public.purge_expired_abuse_subjects(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.user_search_quota_consumptions
  where user_id in (
    select subject.id::text
    from public.abuse_subjects subject
    where subject.tombstone_until <= p_now
      and not exists (
        select 1 from public.user_abuse_subjects mapping
        where mapping.abuse_subject_id = subject.id
      )
  );

  delete from public.user_search_quotas
  where user_id in (
    select subject.id::text
    from public.abuse_subjects subject
    where subject.tombstone_until <= p_now
      and not exists (
        select 1 from public.user_abuse_subjects mapping
        where mapping.abuse_subject_id = subject.id
      )
  );

  delete from public.abuse_subjects subject
  where subject.tombstone_until <= p_now
    and not exists (
      select 1 from public.user_abuse_subjects mapping
      where mapping.abuse_subject_id = subject.id
    );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.resolve_search_quota_subject(text) from public, anon, authenticated;
revoke all on function public.upsert_phone_abuse_subject(text, text) from public, anon, authenticated;
revoke all on function public.get_user_search_quota(text) from public, anon, authenticated;
revoke all on function public.consume_user_search_quota(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.detach_user_abuse_subject(text, timestamptz) from public, anon, authenticated;
revoke all on function public.purge_expired_abuse_subjects(timestamptz) from public, anon, authenticated;

grant execute on function public.resolve_search_quota_subject(text) to service_role;
grant execute on function public.upsert_phone_abuse_subject(text, text) to service_role;
grant execute on function public.get_user_search_quota(text) to service_role;
grant execute on function public.consume_user_search_quota(text, text, timestamptz) to service_role;
grant execute on function public.detach_user_abuse_subject(text, timestamptz) to service_role;
grant execute on function public.purge_expired_abuse_subjects(timestamptz) to service_role;
