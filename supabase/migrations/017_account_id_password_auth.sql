create table public.user_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id text not null unique,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_accounts_account_id_format_chk
    check (account_id ~ '^[a-z0-9]{4,12}$' and account_id = lower(account_id)),
  constraint user_accounts_email_normalized_chk
    check (length(btrim(email)) > 3 and email = lower(btrim(email)))
);

alter table public.user_accounts enable row level security;
revoke all on public.user_accounts from anon, authenticated;
grant all on public.user_accounts to service_role;

create or replace function public.register_user_account(
  p_user_id text,
  p_account_id text,
  p_email text,
  p_terms_version text,
  p_document_sha256 text,
  p_accepted_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_account_id text := lower(btrim(p_account_id));
  normalized_email text := lower(btrim(p_email));
  existing_account public.user_accounts;
begin
  if normalized_account_id !~ '^[a-z0-9]{4,12}$' then
    raise exception 'invalid account_id';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email';
  end if;
  if not exists (
    select 1
    from auth.users
    where id = p_user_id::uuid
      and phone_confirmed_at is not null
  ) then
    raise exception 'verified phone user is required';
  end if;

  select * into existing_account
  from public.user_accounts
  where user_id = p_user_id::uuid;

  if found then
    if existing_account.account_id <> normalized_account_id
       or existing_account.email <> normalized_email then
      raise unique_violation using message = 'user account already registered';
    end if;
  else
    insert into public.user_accounts (user_id, account_id, email)
    values (p_user_id::uuid, normalized_account_id, normalized_email);
  end if;

  perform public.record_terms_consent(
    p_user_id,
    p_terms_version,
    p_document_sha256,
    p_accepted_at
  );
  return true;
end;
$$;

revoke all on function public.register_user_account(text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.register_user_account(text, text, text, text, text, timestamptz)
  to service_role;
