-- Map over time: every home you've had, and one "trip" per venue + home.
-- Past homes are private, so other viewers get only the current home and
-- see every arc drawn from it.

-- Homes in order, each with the date the next one started (null = still there).
create or replace function public.map_homes(p_user uuid default null)
returns table (city text, lat double precision, lng double precision, moved_in date, moved_out date, is_current boolean)
language sql stable security definer set search_path = ''
as $$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  allowed as (select target.uid, target.uid = (select auth.uid()) as self
                from target where public.can_view_user(target.uid)),
  homes as (select h.*, allowed.self
              from allowed cross join lateral public._user_homes(allowed.uid) h
             where allowed.self or h.is_current),
  ordered as (select h.*, lead(h.moved_in) over (order by coalesce(h.moved_in, '-infinity'::date), h.is_current) nxt
                from homes h)
  select o.city, o.lat, o.lng,
         case when o.self then o.moved_in end,
         case when o.self then o.nxt end,
         o.is_current
    from ordered o
   order by coalesce(o.moved_in, '-infinity'::date), o.is_current;
$$;

-- One row per venue + the home you traveled from, with the years you went.
create or replace function public.map_trips(p_user uuid default null)
returns table (venue_id uuid, home_city text, home_lat double precision, home_lng double precision,
               years int[], visits bigint, miles double precision)
language sql stable security definer set search_path = ''
as $$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  me as (select coalesce(target.uid = (select auth.uid()), false) as self from target),
  shows as (select l.venue_id, l.event_date, max(l.lat) lat, max(l.lng) lng
              from target, public.user_log(target.uid) l
             where l.lat is not null and l.lng is not null
             group by l.venue_id, l.event_date),
  homed as (
    select s.*, h.city, h.lat hlat, h.lng hlng
      from shows s cross join target cross join me
      cross join lateral (
        select x.city, x.lat, x.lng from public._home_at(target.uid, s.event_date) x where me.self
        union all
        select p.home_city, p.home_lat, p.home_lng from public.profiles p
         where not me.self and p.id = target.uid and p.home_lat is not null and p.home_lng is not null
      ) h
  )
  select venue_id, min(city), hlat, hlng,
         array_agg(distinct extract(year from event_date)::int order by extract(year from event_date)::int),
         count(*),
         round(public.distance_miles(hlat, hlng, max(lat), max(lng)))
    from homed
   group by venue_id, hlat, hlng;
$$;

grant execute on function public.map_homes(uuid), public.map_trips(uuid) to anon, authenticated;
