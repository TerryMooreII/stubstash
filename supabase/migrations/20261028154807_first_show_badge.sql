-- "Opening Act": a badge for logging your first show.

insert into public.badge_definitions (key, name, description, color, target, sort_order)
values ('first_show', 'Opening Act', 'Log your first show', 'gold', 1, 5)
on conflict (key) do update
  set name = excluded.name, description = excluded.description,
      color = excluded.color, target = excluded.target, sort_order = excluded.sort_order;

create or replace function public.user_badges(p_user uuid default null)
returns table (key text, name text, description text, color text, target int,
               progress int, earned boolean, sort_order int)
language sql stable security definer set search_path = ''
as $$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  log as (select l.* from target, public.user_log(target.uid) l),
  songs as (select us.* from target, public._user_songs(target.uid) us where public.can_view_user(target.uid)),
  vals as (
    select 'first_show' k, (select count(*) from log)::int v
    union all select 'venue_regular', coalesce((select max(n) from (select count(*) n from log group by venue_id) x), 0)::int
    union all select 'superfan', coalesce((select max(n) from (select count(*) n from log group by artist_id) x), 0)::int
    union all select 'passport', (select count(*) from log, prof
                                   where prof.home_country_code is not null and log.country_code is not null
                                     and log.country_code <> prof.home_country_code)::int
    union all select 'coast_to_coast', (select count(*) from (
                     select extract(year from event_date) from log where country_code = 'US'
                      group by 1 having bool_or(lng < -114) and bool_or(lng > -82)) x)::int
    union all select 'thousand_club', (select count(*) from songs)::int
    union all select 'double_header', (select count(*) from (select event_date from log group by 1 having count(*) > 1) x)::int
    union all select 'century_club', (select count(*) from log)::int
    union all select 'festival_rat', (select count(*) from log where is_festival)::int
    union all select 'road_warrior', (select coalesce(round(sum(2 * public.distance_miles(prof.home_lat, prof.home_lng, log.lat, log.lng))), 0) from log, prof)::int
    union all select 'first_timer', (select count(*) from songs where hear_index = 1)::int
  )
  select b.key, b.name, b.description, b.color, b.target,
         least(vals.v, b.target), vals.v >= b.target, b.sort_order
    from public.badge_definitions b
    join vals on vals.k = b.key
   where exists (select 1 from target where public.can_view_user(target.uid))
   order by (vals.v >= b.target) desc, b.sort_order;
$$;
