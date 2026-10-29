-- Badges count shows the new way (one venue on one date = one show) wherever
-- they count shows; artist badges still count each artist. Awarded badges stay earned.
create or replace function public.user_badges(p_user uuid default null)
 returns table(key text, name text, description text, color text, target integer, progress integer, earned boolean, sort_order integer)
 language sql stable security definer
 set search_path to ''
as $function$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  log as (select l.* from target, public.user_log(target.uid) l),
  songs as (select us.* from target, public._user_songs(target.uid) us where public.can_view_user(target.uid)),
  -- One row per show (date + venue name): headliner and openers count once.
  shows as (select event_date, lower(trim(venue_name)) vkey, min(venue_id::text)::uuid venue_id,
                   min(state_code) state_code, min(country_code) country_code,
                   avg(lat) lat, avg(lng) lng, bool_or(is_festival) is_festival,
                   max(festival_name) festival_name, bool_or(rating is not null) rated,
                   bool_or(exists (select 1 from public.attendance_companions c where c.attendance_id = log.attendance_id)) tagged,
                   bool_or(has_stub) has_stub
              from log group by event_date, lower(trim(venue_name))),
  days as (select distinct event_date d from log),
  runs as (select count(*) n from (select d, d - (row_number() over (order by d))::int grp from days) x group by grp),
  homed as (select shows.*, public.distance_miles(prof.home_lat, prof.home_lng, shows.lat, shows.lng) mi
              from shows, prof where prof.home_lat is not null and shows.lat is not null),
  vals as (
    select 'first_show' k, (select count(*) from shows)::int v
    union all select 'venue_regular', coalesce((select max(n) from (select count(*) n from shows group by vkey) x), 0)::int
    union all select 'superfan', coalesce((select max(n) from (select count(*) n from log group by artist_id) x), 0)::int
    union all select 'passport', (select count(*) from log, prof
                                   where prof.home_country_code is not null and log.country_code is not null
                                     and log.country_code <> prof.home_country_code)::int
    union all select 'coast_to_coast', (select count(*) from (
                     select extract(year from event_date) from log where country_code = 'US'
                      group by 1 having bool_or(lng < -114) and bool_or(lng > -82)) x)::int
    union all select 'thousand_club', (select count(*) from songs)::int
    union all select 'double_header', (select count(*) from (select event_date from shows group by 1 having count(*) > 1) x)::int
    union all select 'century_club', (select count(*) from shows)::int
    union all select 'festival_rat', (select count(distinct coalesce(lower(festival_name), vkey || ':' || extract(year from event_date)))
                                        from shows where is_festival)::int
    union all select 'road_warrior', (select coalesce(round(sum(2 * public.distance_miles(prof.home_lat, prof.home_lng, shows.lat, shows.lng))), 0) from shows, prof)::int
    union all select 'first_timer', (select count(*) from songs where hear_index = 1)::int
    -- milestones
    union all select 'quarter_century', (select count(*) from shows)::int
    union all select 'half_century', (select count(*) from shows)::int
    union all select 'lifer', (select count(distinct extract(year from event_date)) from log)::int
    union all select 'old_school', (select count(*) from log where event_date < date '2000-01-01')::int
    -- travel and places
    union all select 'state_hopper', (select count(distinct state_code) from log where country_code = 'US' and state_code is not null)::int
    union all select 'fifty_nifty', (select count(distinct state_code) from log where country_code = 'US' and state_code in (
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO',
        'MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'))::int
    union all select 'hometown_hero', (select count(*) from homed where mi <= 25)::int
    union all select 'venue_hopper', (select count(distinct vkey) from shows)::int
    union all select 'road_trip', (select count(*) from homed where mi >= 500)::int
    -- habits and timing
    union all select 'hat_trick', coalesce((select max(n) from runs), 0)::int
    union all select 'full_run', coalesce((select max((select count(*) from log b where b.artist_id = a.artist_id
                                                         and b.event_date between a.event_date and a.event_date + 6))
                                             from log a), 0)::int
    union all select 'nye', (select count(*) from shows where extract(month from event_date) = 12 and extract(day from event_date) = 31)::int
    union all select 'every_month', coalesce((select max(n) from (select count(distinct extract(month from event_date)) n
                                                                   from log group by extract(year from event_date)) x), 0)::int
    union all select 'weeknight_warrior', (select count(*) from shows where extract(isodow from event_date) in (1, 2, 3))::int
    -- variety
    union all select 'explorer', (select count(distinct artist_id) from log)::int
    union all select 'loyalist', coalesce((select max(n) from (select count(distinct extract(year from event_date)) n
                                                                from log group by artist_id) x), 0)::int
    union all select 'discovery', (select count(*) from (select artist_id from log group by 1 having count(*) = 1) x)::int
    -- social and logging
    union all select 'plus_one', (select count(*) from shows where tagged)::int
    union all select 'same_crowd', (select count(*) from log, target where exists (
        select 1 from public.attendances o
          join public.friendships f on f.status = 'accepted'
           and ((f.requester_id = target.uid and f.addressee_id = o.user_id) or (f.addressee_id = target.uid and f.requester_id = o.user_id))
         where o.show_id = log.show_id))::int
    union all select 'critic', (select count(*) from shows where rated)::int
    union all select 'stub_keeper', (select count(*) from log where has_stub)::int
  )
  -- A badge you've been awarded stays earned even if a recount dips below its target.
  , earned as (select vals.k, vals.v,
                      vals.v >= b.target or exists (select 1 from public.badge_awards aw, target
                                                     where aw.user_id = target.uid and aw.key = vals.k) e
                 from vals join public.badge_definitions b on b.key = vals.k)
  select b.key, b.name, b.description, b.color, b.target,
         case when earned.e then b.target else least(earned.v, b.target) end, earned.e, b.sort_order
    from public.badge_definitions b
    join earned on earned.k = b.key
   where exists (select 1 from target where public.can_view_user(target.uid))
   order by earned.e desc, b.sort_order;
$function$;


update public.badge_definitions set description = 'Rate 25 shows' where key = 'critic';
update public.badge_definitions set description = 'Tag who you went with at 10 shows' where key = 'plus_one';
