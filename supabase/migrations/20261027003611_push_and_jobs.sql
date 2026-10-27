-- Web push subscriptions and background jobs.
--
-- Background jobs call edge functions with a shared secret. Before the jobs can
-- run, store two secrets in Vault (see supabase/README.md):
--   project_url  -> https://<ref>.supabase.co
--   cron_secret  -> same value as the CRON_SECRET edge function secret

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- IANA timezone, set by the app from the browser; used to time nudges.
alter table public.profiles add column timezone text not null default 'America/New_York';

create or replace function public.validate_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown timezone %', new.timezone;
  end if;
  return new;
end;
$$;
create trigger profiles_timezone before insert or update of timezone on public.profiles
  for each row execute function public.validate_timezone();

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push: owner" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Calls an edge function from SQL using the secrets in Vault.
create or replace function public._call_edge_function(fn text, body jsonb default '{}')
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or secret is null then
    raise notice 'Vault secrets project_url / cron_secret are not set; skipping %', fn;
    return null;
  end if;
  return net.http_post(
    url := base || '/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := body,
    timeout_milliseconds := 55000
  );
end;
$$;
revoke execute on function public._call_edge_function(text, jsonb) from public, anon, authenticated;

-- Every 2 minutes: fetch images and geocode venues that haven't been checked yet.
select cron.schedule('enrich-catalog', '*/2 * * * *', $$ select public._call_edge_function('enrich', '{}') $$);

-- Shows from "yesterday" (in the user's timezone) that are still unrated,
-- for users whose local time is 10am this hour.
create or replace function public.due_rating_nudges()
returns table (attendance_id uuid, user_id uuid, artist text, venue text)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.user_id, ar.name, v.name
    from public.attendances a
    join public.profiles p on p.id = a.user_id
    join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id
    join public.venues v on v.id = s.venue_id
   where a.rating is null
     and a.rating_nudged_at is null
     and extract(hour from now() at time zone p.timezone) = 10
     and s.event_date = (now() at time zone p.timezone)::date - 1
     and exists (select 1 from public.push_subscriptions ps where ps.user_id = a.user_id);
$$;
revoke execute on function public.due_rating_nudges() from public, anon, authenticated;

-- Every hour: morning-after "rate the show" nudges.
select cron.schedule('rating-nudges', '15 * * * *', $$ select public._call_edge_function('push', '{"action":"nudges"}') $$);

-- Daily: drop setlist.fm cache entries older than 2 days.
select cron.schedule('prune-api-cache', '30 4 * * *', $$ delete from public.api_cache where fetched_at < now() - interval '2 days' $$);
