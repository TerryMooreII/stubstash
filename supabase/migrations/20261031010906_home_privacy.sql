-- Home location privacy.
--
-- Before: anyone who could see a profile (anon too, for public ones) got the
-- exact current home coordinates from map_home/map_homes/map_trips and exact
-- per-venue distances from it (map_venues, venue_stats), which pin down an
-- address. Per-venue miles were also measured from past homes, which are
-- meant to be private.
--
-- Now:
--   * _all_homes: every home, exact. Only for totals (dashboard and
--     year-in-review miles, badge counts), so everyone sees the same totals.
--   * _user_homes: what this viewer may see. You get every home, exact;
--     anyone else gets only the current home, rounded to 0.1° (about 11 km,
--     roughly the city, which profiles already show). Used for coordinates
--     and anything per venue.

-- Every home, exact (the old _user_homes).
create or replace function public._all_homes(p_user uuid)
returns table (city text, lat double precision, lng double precision, country_code text, moved_in date, is_current boolean)
language sql stable
as $$
  select p.home_city, p.home_lat, p.home_lng, p.home_country_code, p.home_since, true
    from public.profiles p
   where p.id = p_user and p.home_lat is not null and p.home_lng is not null
  union all
  select h.city, h.lat, h.lng, h.country_code, h.moved_in, false
    from public.past_homes h
   where h.user_id = p_user;
$$;

-- Homes this viewer may see.
create or replace function public._user_homes(p_user uuid)
returns table (city text, lat double precision, lng double precision, country_code text, moved_in date, is_current boolean)
language sql stable
as $$
  with me as (select coalesce(p_user = (select auth.uid()), false) as self)
  select h.city,
         case when me.self then h.lat else round(h.lat::numeric, 1)::double precision end,
         case when me.self then h.lng else round(h.lng::numeric, 1)::double precision end,
         h.country_code, h.moved_in, h.is_current
    from public._all_homes(p_user) h, me
   where me.self or h.is_current;
$$;

-- Where someone lived on a date, for totals. Exact, full history.
create or replace function public._home_at(p_user uuid, p_date date)
returns table (city text, lat double precision, lng double precision, country_code text)
language sql stable
as $$
  select h.city, h.lat, h.lng, h.country_code
    from public._all_homes(p_user) h
   order by case when coalesce(h.moved_in, '-infinity'::date) <= p_date
                 then coalesce(h.moved_in, '-infinity'::date) end desc nulls last,
            h.moved_in asc nulls first,
            h.is_current desc
   limit 1;
$$;

revoke execute on function public._all_homes(uuid), public._user_homes(uuid), public._home_at(uuid, date)
  from public, anon, authenticated;

-- Unused by the app, and it returned exact coordinates.
drop function if exists public.map_home(uuid);

-- Patched in place (as earlier migrations do) so other edits are kept.
-- Fails loudly if the expected text isn't there.
do $do$
declare
  f text;
  d text;
  old_prof text := $a$prof as (select p.* from public.profiles p, target where p.id = target.uid),$a$;
  new_prof text := $a$prof as (select h.lat home_lat, h.lng home_lng from target, public._user_homes(target.uid) h where h.is_current),$a$;
  old_trip text := $a$select p.home_city, p.home_lat, p.home_lng from public.profiles p
         where not me.self and p.id = target.uid and p.home_lat is not null and p.home_lng is not null$a$;
  new_trip text := $a$select x.city, x.lat, x.lng from public._user_homes(target.uid) x
         where not me.self and x.is_current$a$;
  old_trav text := $a$cross join lateral public._home_at(target.uid, x.event_date) h)$a$;
  new_trav text := $a$cross join lateral (
                           select a.lat, a.lng from public._home_at(target.uid, x.event_date) a
                            where target.uid = (select auth.uid())
                           union all
                           select c.lat, c.lng from public._user_homes(target.uid) c
                            where c.is_current and target.uid is distinct from (select auth.uid())) h)$a$;
begin
  -- map_venues and venue_stats: distance from the viewer-appropriate current home.
  foreach f in array array['public.map_venues(uuid)', 'public.venue_stats(uuid, uuid)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position(old_prof in d) = 0 then raise exception '%: expected prof text not found', f; end if;
    execute replace(d, old_prof, new_prof);
  end loop;

  -- venue_stats: miles traveled to one venue would show where you used to live,
  -- so other viewers get it measured from the rounded current home.
  d := pg_get_functiondef('public.venue_stats(uuid, uuid)'::regprocedure);
  if position(old_trav in d) = 0 then raise exception 'venue_stats: expected miles_traveled text not found'; end if;
  execute replace(d, old_trav, new_trav);

  -- map_trips: other viewers' arcs start from the rounded current home.
  d := pg_get_functiondef('public.map_trips(uuid)'::regprocedure);
  if position(old_trip in d) = 0 then raise exception 'map_trips: expected home text not found'; end if;
  execute replace(d, old_trip, new_trip);
end
$do$;
