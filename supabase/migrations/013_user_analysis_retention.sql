-- User-owned analyses are retained for seven days. Deploy this migration before
-- enabling the operational purge schedule documented in the root README.
alter table public.analyses
  add column expires_at timestamptz;

update public.analyses
set expires_at = created_at + interval '7 days'
where expires_at is null;

alter table public.analyses
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;

create index analyses_expires_at_idx
  on public.analyses(expires_at);

create or replace function public.refresh_analysis_expiry_on_failed_retry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'FAILED' and new.status = 'PENDING' then
    new.expires_at := now() + interval '7 days';
  end if;
  return new;
end;
$$;

create trigger analyses_refresh_expiry_on_failed_retry
before update on public.analyses
for each row
execute function public.refresh_analysis_expiry_on_failed_retry();

create or replace function public.purge_expired_analyses(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.analyses
  where expires_at <= p_now;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- These tables contain per-user history or preference data. The backend uses a
-- service-role client, which bypasses RLS; browser clients must not access them directly.
alter table public.analyses enable row level security;
alter table public.analysis_offers enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_memberships enable row level security;
alter table public.user_shopping_grades enable row level security;
alter table public.user_cards enable row level security;
alter table public.user_search_quotas enable row level security;
alter table public.user_search_quota_consumptions enable row level security;
alter table public.saved_products enable row level security;
alter table public.price_alerts enable row level security;

revoke all on table public.analyses,
  public.analysis_offers,
  public.user_preferences,
  public.user_memberships,
  public.user_shopping_grades,
  public.user_cards,
  public.user_search_quotas,
  public.user_search_quota_consumptions,
  public.saved_products,
  public.price_alerts
from anon, authenticated;

revoke execute on function public.persist_analysis_atomically(jsonb)
  from public, anon, authenticated;
revoke execute on function public.consume_user_search_quota(text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.purge_expired_analyses(timestamptz)
  from public, anon, authenticated;
revoke execute on function public.refresh_analysis_expiry_on_failed_retry()
  from public, anon, authenticated;

grant execute on function public.persist_analysis_atomically(jsonb) to service_role;
grant execute on function public.consume_user_search_quota(text, text, timestamptz) to service_role;
grant execute on function public.purge_expired_analyses(timestamptz) to service_role;
