-- Repair the production privilege baseline for backend-owned PostgREST access.
-- User-facing roles remain governed by the existing RLS and explicit revokes.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

-- Keep future migrations consistent regardless of the standard Supabase owner
-- used to create a table or sequence.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to service_role;

alter default privileges for role supabase_admin in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role supabase_admin in schema public
  grant usage, select, update on sequences to service_role;
