-- 21 more badges: milestones, travel, habits, variety, social/logging.
insert into public.badge_definitions (key, name, description, color, target, sort_order) values
  ('quarter_century',   'Quarter Century',   '25 shows',                                      'yellow', 25,  62),
  ('half_century',      'Half Century',      '50 shows',                                      'orange', 50,  65),
  ('lifer',             'Lifer',             'Shows in 10 different years',                   'gold',   10,  110),
  ('old_school',        'Old School',        'Log a show from before 2000',                   'slate',  1,   120),
  ('state_hopper',      'State Hopper',      'Shows in 5 US states',                          'teal',   5,   130),
  ('fifty_nifty',       'Fifty Nifty',       'Shows in all 50 US states',                     'gold',   50,  140),
  ('hometown_hero',     'Hometown Hero',     '25 shows within 25 miles of home',              'yellow', 25,  150),
  ('venue_hopper',      'Venue Hopper',      '25 different venues',                           'mint',   25,  160),
  ('road_trip',         'Road Trip',         'A show 500+ miles from home',                   'orange', 1,   170),
  ('hat_trick',         'Hat Trick',         'Shows three nights in a row',                   'yellow', 3,   180),
  ('full_run',          'Full Run',          'Four shows by one artist within a week',        'teal',   4,   190),
  ('nye',               'New Year''s Eve',   'A show on December 31',                         'gold',   1,   200),
  ('every_month',       'Every Month',       'A show in every month of one year',             'mint',   12,  210),
  ('weeknight_warrior', 'Weeknight Warrior', '10 shows on a Monday, Tuesday or Wednesday',    'slate',  10,  220),
  ('explorer',          'Explorer',          '50 different artists',                          'orange', 50,  230),
  ('loyalist',          'Loyalist',          'See one artist in 5 different years',           'yellow', 5,   240),
  ('discovery',         'Discovery',         '10 artists you''ve seen just once',             'mint',   10,  250),
  ('plus_one',          'Plus One',          'Tag who you went with at 10 shows',             'teal',   10,  260),
  ('same_crowd',        'Same Crowd',        'Be at a show a friend also logged',             'orange', 1,   270),
  ('critic',            'Critic',            'Rate 25 shows',                                 'gold',   25,  280),
  ('stub_keeper',       'Stub Keeper',       'Add 10 ticket stub photos',                     'slate',  10,  290)
on conflict (key) do update set name = excluded.name, description = excluded.description, color = excluded.color,
  target = excluded.target, sort_order = excluded.sort_order;

create or replace function public.user_badges(p_user uuid default null)
 returns table(key text, name text, description text, color text, target integer, progress integer, earned boolean, sort_order integer)
 language sql stable security definer
 set search_path to ''
as $function$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  log as (select l.* from target, public.user_log(target.uid) l),
  songs as (select us.* from target, public._user_songs(target.uid) us where public.can_view_user(target.uid)),
  days as (select distinct event_date d from log),
  runs as (select count(*) n from (select d, d - (row_number() over (order by d))::int grp from days) x group by grp),
  homed as (select log.*, public.distance_miles(prof.home_lat, prof.home_lng, log.lat, log.lng) mi
              from log, prof where prof.home_lat is not null and log.lat is not null),
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
    -- milestones
    union all select 'quarter_century', (select count(*) from log)::int
    union all select 'half_century', (select count(*) from log)::int
    union all select 'lifer', (select count(distinct extract(year from event_date)) from log)::int
    union all select 'old_school', (select count(*) from log where event_date < date '2000-01-01')::int
    -- travel and places
    union all select 'state_hopper', (select count(distinct state_code) from log where country_code = 'US' and state_code is not null)::int
    union all select 'fifty_nifty', (select count(distinct state_code) from log where country_code = 'US' and state_code in (
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO',
        'MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'))::int
    union all select 'hometown_hero', (select count(*) from homed where mi <= 25)::int
    union all select 'venue_hopper', (select count(distinct venue_id) from log)::int
    union all select 'road_trip', (select count(*) from homed where mi >= 500)::int
    -- habits and timing
    union all select 'hat_trick', coalesce((select max(n) from runs), 0)::int
    union all select 'full_run', coalesce((select max((select count(*) from log b where b.artist_id = a.artist_id
                                                         and b.event_date between a.event_date and a.event_date + 6))
                                             from log a), 0)::int
    union all select 'nye', (select count(*) from log where extract(month from event_date) = 12 and extract(day from event_date) = 31)::int
    union all select 'every_month', coalesce((select max(n) from (select count(distinct extract(month from event_date)) n
                                                                   from log group by extract(year from event_date)) x), 0)::int
    union all select 'weeknight_warrior', (select count(*) from log where extract(isodow from event_date) in (1, 2, 3))::int
    -- variety
    union all select 'explorer', (select count(distinct artist_id) from log)::int
    union all select 'loyalist', coalesce((select max(n) from (select count(distinct extract(year from event_date)) n
                                                                from log group by artist_id) x), 0)::int
    union all select 'discovery', (select count(*) from (select artist_id from log group by 1 having count(*) = 1) x)::int
    -- social and logging
    union all select 'plus_one', (select count(*) from log where exists (
        select 1 from public.attendance_companions c where c.attendance_id = log.attendance_id))::int
    union all select 'same_crowd', (select count(*) from log, target where exists (
        select 1 from public.attendances o
          join public.friendships f on f.status = 'accepted'
           and ((f.requester_id = target.uid and f.addressee_id = o.user_id) or (f.addressee_id = target.uid and f.requester_id = o.user_id))
         where o.show_id = log.show_id))::int
    union all select 'critic', (select count(*) from log where rating is not null)::int
    union all select 'stub_keeper', (select count(*) from log where has_stub)::int
  )
  select b.key, b.name, b.description, b.color, b.target,
         least(vals.v, b.target), vals.v >= b.target, b.sort_order
    from public.badge_definitions b
    join vals on vals.k = b.key
   where exists (select 1 from target where public.can_view_user(target.uid))
   order by (vals.v >= b.target) desc, b.sort_order;
$function$;

-- Record badges people already qualify for, quietly (no "Badge unlocked" burst).
insert into public.badge_awards (user_id, key)
select p.id, k from public.profiles p, unnest(public._earned_badges(p.id)) k
on conflict do nothing;
