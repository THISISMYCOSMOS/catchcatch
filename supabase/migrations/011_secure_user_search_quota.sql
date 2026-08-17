alter table public.user_search_quotas enable row level security;
alter table public.user_search_quota_consumptions enable row level security;

revoke all on table public.user_search_quotas from anon, authenticated;
revoke all on table public.user_search_quota_consumptions from anon, authenticated;

revoke execute on function public.consume_user_search_quota(text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.consume_user_search_quota(text, text, timestamptz)
  to service_role;
