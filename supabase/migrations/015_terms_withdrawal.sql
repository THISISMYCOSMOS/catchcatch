create table public.terms_consents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  terms_version text not null,
  document_sha256 text not null,
  accepted_at timestamptz not null,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  constraint terms_consents_version_non_empty_chk
    check (length(btrim(terms_version)) > 0),
  constraint terms_consents_document_sha256_chk
    check (document_sha256 ~ '^[0-9a-f]{64}$'),
  constraint terms_consents_user_version_document_unique
    unique (user_id, terms_version, document_sha256)
);

create index terms_consents_user_accepted_at_idx
  on public.terms_consents(user_id, accepted_at desc);

alter table public.terms_consents enable row level security;
revoke all on public.terms_consents from anon, authenticated;
grant all on public.terms_consents to service_role;

create or replace function public.record_terms_consent(
  p_user_id text,
  p_terms_version text,
  p_document_sha256 text,
  p_accepted_at timestamptz default now()
)
returns public.terms_consents
language plpgsql
security definer
set search_path = public
as $$
declare
  consent_row public.terms_consents;
begin
  if nullif(btrim(p_user_id), '') is null then
    raise exception 'user_id is required';
  end if;
  if nullif(btrim(p_terms_version), '') is null then
    raise exception 'terms_version is required';
  end if;
  if p_document_sha256 is null or p_document_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'document_sha256 must be a lowercase SHA-256 hash';
  end if;

  insert into public.terms_consents (
    user_id,
    terms_version,
    document_sha256,
    accepted_at,
    withdrawn_at,
    created_at
  ) values (
    p_user_id,
    p_terms_version,
    p_document_sha256,
    p_accepted_at,
    null,
    now()
  )
  on conflict (user_id, terms_version, document_sha256) do update
    set accepted_at = least(public.terms_consents.accepted_at, excluded.accepted_at),
        withdrawn_at = null
  returning * into consent_row;

  return consent_row;
end;
$$;

create or replace function public.has_current_terms_consent(
  p_user_id text,
  p_terms_version text,
  p_document_sha256 text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.terms_consents consent
    where consent.user_id = p_user_id
      and consent.terms_version = p_terms_version
      and consent.document_sha256 = p_document_sha256
      and consent.withdrawn_at is null
  );
$$;

create or replace function public.ensure_phone_user_access(
  p_user_id text,
  p_phone_hmac text,
  p_terms_version text,
  p_document_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.upsert_phone_abuse_subject(p_user_id, p_phone_hmac);
  return public.has_current_terms_consent(
    p_user_id,
    p_terms_version,
    p_document_sha256
  );
end;
$$;

create or replace function public.withdraw_user_account(
  p_user_id text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deleted_auth_users integer;
begin
  if nullif(btrim(p_user_id), '') is null then
    raise exception 'user_id is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id, 0));
  perform 1 from auth.users where id::text = p_user_id for update;
  if not found then
    raise exception 'auth user does not exist';
  end if;

  update public.terms_consents
  set withdrawn_at = coalesce(withdrawn_at, p_now)
  where user_id = p_user_id;

  delete from public.price_alerts where user_id = p_user_id;
  delete from public.saved_products where user_id = p_user_id;
  delete from public.analyses where user_id = p_user_id;
  delete from public.user_cards where user_id = p_user_id;
  delete from public.user_shopping_grades where user_id = p_user_id;
  delete from public.user_memberships where user_id = p_user_id;
  delete from public.user_preferences where user_id = p_user_id;
  delete from public.user_search_quota_consumptions where user_id = p_user_id;
  delete from public.user_search_quotas where user_id = p_user_id;

  delete from auth.users where id::text = p_user_id;
  get diagnostics deleted_auth_users = row_count;
  if deleted_auth_users <> 1 then
    raise exception 'auth user deletion failed';
  end if;

  return true;
end;
$$;

create or replace function public.purge_expired_terms_consents(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.terms_consents
  where withdrawn_at is not null
    and withdrawn_at <= p_now - interval '1 month';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.record_terms_consent(text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.has_current_terms_consent(text, text, text)
  from public, anon, authenticated;
revoke all on function public.ensure_phone_user_access(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.withdraw_user_account(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.purge_expired_terms_consents(timestamptz)
  from public, anon, authenticated;

grant execute on function public.record_terms_consent(text, text, text, timestamptz)
  to service_role;
grant execute on function public.has_current_terms_consent(text, text, text)
  to service_role;
grant execute on function public.ensure_phone_user_access(text, text, text, text)
  to service_role;
grant execute on function public.withdraw_user_account(text, timestamptz)
  to service_role;
grant execute on function public.purge_expired_terms_consents(timestamptz)
  to service_role;
