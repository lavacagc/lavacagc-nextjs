-- Per-IP rate limiting for public lead-submission endpoints (/api/leads/submit).
--
-- This is an INFRASTRUCTURE table, not user/tenant data — rows are keyed by an
-- opaque bucket string (e.g. "lead-submit:<ip>"), not by a user. RLS is enabled
-- with NO policies, so anon and authenticated roles are denied entirely. Only
-- server code using the service_role key (which bypasses RLS) touches it, and
-- only via the check_rate_limit() RPC below.
--
-- The application FAILS OPEN if this table/function is absent or errors, so it
-- is safe to deploy the app code before applying this migration: the limiter
-- simply no-ops until the function exists.

create table if not exists public.rate_limits (
  bucket       text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- Intentionally no policies: deny all to anon/authenticated. service_role bypasses RLS.

-- Index to support periodic cleanup of stale buckets (optional cron):
--   delete from public.rate_limits where window_start < now() - interval '1 day';
create index if not exists idx_rate_limits_window_start
  on public.rate_limits (window_start);

-- Atomic fixed-window counter. Returns true when the caller is ALLOWED (count
-- within p_limit for the current window) and false when the limit is exceeded.
-- SECURITY DEFINER so it runs as the owner; the grant below restricts callers.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_count integer;
begin
  insert into public.rate_limits as rl (bucket, count, window_start)
    values (p_key, 1, v_now)
  on conflict (bucket) do update
    set
      count = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds) then 1
        else rl.count + 1
      end,
      window_start = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
        else rl.window_start
      end
  returning rl.count into v_count;

  return v_count <= p_limit;
end;
$$;

-- Only the service_role (server) may execute the limiter.
revoke all on function public.check_rate_limit(text, integer, integer) from public;
revoke all on function public.check_rate_limit(text, integer, integer) from anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
