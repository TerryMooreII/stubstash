-- Venue visits count concerts (one per date at the venue), not acts seen.
-- A festival day with 18 acts, or a headliner plus two openers, is one visit.

-- Map pins and popups.
create or replace function public.map_venues(p_user uuid default null)
returns table (venue_id uuid, name text, city text, state_code text, country_code text, lat double precision, lng double precision,
               visits bigint, first_year int, last_year int, recent_artists text[], miles_from_home double precision,
               geo_source public.geo_source)
language sql stable security definer set search_path = ''
as $function$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  log as (select l.* from target, public.user_log(target.uid) l)
  select l.venue_id, l.venue_name, l.city, l.state_code, l.country_code,
         max(l.lat), max(l.lng), count(distinct l.event_date),
         min(extract(year from l.event_date))::int, max(extract(year from l.event_date))::int,
         (array_agg(distinct l.artist_name))[1:3],
         round(public.distance_miles((select home_lat from prof), (select home_lng from prof), max(l.lat), max(l.lng))),
         (select v.geo_source from public.venues v where v.id = l.venue_id)
    from log l
   group by l.venue_id, l.venue_name, l.city, l.state_code, l.country_code
   order by count(distinct l.event_date) desc;
$function$;

-- Venue page: visits and "your most-visited" rank.
create or replace function public.venue_stats(p_venue uuid, p_user uuid default null)
returns jsonb
language sql stable security definer set search_path = ''
as $function$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  log as (select l.* from target, public.user_log(target.uid) l),
  ranked as (select venue_id, dense_rank() over (order by count(distinct event_date) desc) r from log group by venue_id),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  here as (select * from log where venue_id = p_venue)
  select jsonb_build_object(
    'visits', (select count(distinct event_date) from here),
    'first', (select min(event_date) from here),
    'last', (select max(event_date) from here),
    'rank', (select r from ranked where venue_id = p_venue),
    'artists', (select count(distinct artist_id) from here),
    'miles_from_home', (select round(public.distance_miles(prof.home_lat, prof.home_lng, h.lat, h.lng))
                          from prof, (select lat, lng from here limit 1) h),
    'miles_traveled', (select round(sum(2 * public.distance_miles(h.lat, h.lng, x.lat, x.lng)))
                         from (select distinct on (event_date) event_date, lat, lng from here) x
                         cross join target
                         cross join lateral public._home_at(target.uid, x.event_date) h)
  );
$function$;

-- Dashboard "top venues" (and the "home turf" caption).
do $do$
declare
  d text := pg_get_functiondef('public.dashboard_stats(uuid)'::regprocedure);
  old text := $a$select venue_id as id, venue_name as name, city, count(*) n$a$;
begin
  if position(old in d) = 0 then
    raise exception 'dashboard_stats: expected top_venues text not found';
  end if;
  execute replace(d, old, $b$select venue_id as id, venue_name as name, city, count(distinct event_date) n$b$);
end
$do$;
