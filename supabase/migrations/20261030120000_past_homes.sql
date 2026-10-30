-- Homes over time. Miles are measured from wherever you lived on the night
-- of each show, not from where you live now.
--
--   profiles.home_*      your current home (unchanged)
--   profiles.home_since  when you moved there (null = always, if no past homes)
--   past_homes           earlier homes, each with the date you moved in.
--                        The oldest one may leave moved_in blank: it covers
--                        every show before the next home.

alter table public.profiles add column home_since date;

create table public.past_homes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  city          text not null check (char_length(city) between 1 and 200),
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  country_code  text check (country_code ~ '^[A-Z]{2}$'),
  moved_in      date,
  created_at    timestamptz not null default now()
);
create index past_homes_user on public.past_homes (user_id, moved_in);
-- Only one "since forever" home per person.
create unique index past_homes_one_undated on public.past_homes (user_id) where moved_in is null;

-- Private: only you see your past homes. Stats read them through the
-- security-definer helpers below.
alter table public.past_homes enable row level security;
create policy "past_homes: owner reads" on public.past_homes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "past_homes: owner inserts" on public.past_homes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "past_homes: owner updates" on public.past_homes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "past_homes: owner deletes" on public.past_homes
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- helpers

-- Every home a person has had: the current one plus past ones.
create or replace function public._user_homes(p_user uuid)
returns table (city text, lat double precision, lng double precision, country_code text, moved_in date, is_current boolean)
language sql stable security definer set search_path = ''
as $$
  select p.home_city, p.home_lat, p.home_lng, p.home_country_code, p.home_since, true
    from public.profiles p
   where p.id = p_user and p.home_lat is not null and p.home_lng is not null
  union all
  select h.city, h.lat, h.lng, h.country_code, h.moved_in, false
    from public.past_homes h
   where h.user_id = p_user;
$$;

-- Where someone lived on a date: the latest home moved into on or before it.
-- Shows before every dated home fall back to the oldest home. A blank date
-- counts as "since forever"; if two homes are both blank, the current wins.
create or replace function public._home_at(p_user uuid, p_date date)
returns table (city text, lat double precision, lng double precision, country_code text)
language sql stable security definer set search_path = ''
as $$
  select h.city, h.lat, h.lng, h.country_code
    from public._user_homes(p_user) h
   order by case when coalesce(h.moved_in, '-infinity'::date) <= p_date
                 then coalesce(h.moved_in, '-infinity'::date) end desc nulls last,
            h.moved_in asc nulls first,
            h.is_current desc
   limit 1;
$$;

revoke execute on function public._user_homes(uuid), public._home_at(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- dashboard

create or replace function public.dashboard_stats(p_user uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  uid uuid := coalesce(p_user, auth.uid());
  prof public.profiles;
  result jsonb;
begin
  if uid is null or not public.can_view_user(uid) then return null; end if;
  select * into prof from public.profiles where id = uid;

  with log as (select * from public.user_log(uid)),
  songs as (select * from public._user_songs(uid)),
  months as (
    select distinct date_trunc('month', event_date)::date as m from log
  ),
  islands as (
    select m, m - (row_number() over (order by m))::int * interval '1 month' as grp from months
  ),
  runs as (
    select min(m) as start_m, max(m) as end_m, count(*) as len from islands group by grp
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'shows',        (select count(distinct (event_date, lower(trim(venue_name)))) from log),
      'sets',         (select count(*) from log),
      'artists',      (select count(distinct artist_id) from log),
      'artists_multi',(select count(*) from (select artist_id from log group by artist_id having count(*) > 1) x),
      'venues',       (select count(distinct venue_id) from log),
      'songs',        (select count(*) from songs),
      'unique_songs', (select count(distinct (artist_id, song_key)) from songs),
      'cities',       (select count(distinct (lower(city), country_code)) from log where city is not null),
      'countries',    (select count(distinct country_code) from log where country_code is not null),
      'festivals',    (select count(distinct coalesce(lower(festival_name), venue_id::text || ':' || extract(year from event_date)))
                          from log where is_festival),
      -- Round trip from wherever you lived that night.
      'miles',        (select coalesce(round(sum(2 * public.distance_miles(h.lat, h.lng, x.lat, x.lng))), 0)
                          from (select distinct on (event_date, lower(trim(venue_name))) event_date, lat, lng from log) x
                          cross join lateral public._home_at(uid, x.event_date) h),
      'first_show',   (select min(event_date) from log),
      'last_show',    (select max(event_date) from log),
      'rated',        (select count(*) from log where rating is not null),
      'avg_rating',   (select round(avg(rating), 2) from log)
    ),
    'home', jsonb_build_object('city', prof.home_city, 'has_coords', prof.home_lat is not null,
                               'past_homes', (select count(*) from public.past_homes ph where ph.user_id = uid)),
    'per_year', coalesce((select jsonb_agg(jsonb_build_object('year', y, 'n', n) order by y)
                            from (select extract(year from event_date)::int y, count(distinct (event_date, lower(trim(venue_name)))) n from log group by 1) x), '[]'),
    'top_artists', coalesce((select jsonb_agg(x order by x.n desc, x.name) from (
                     select artist_id as id, artist_name as name, max(artist_image) as image_url, count(*) n,
                            min(event_date) as first, max(event_date) as last
                       from log group by artist_id, artist_name order by n desc, artist_name limit 8) x), '[]'),
    'top_venues', coalesce((select jsonb_agg(x order by x.n desc, x.name) from (
                     select venue_id as id, venue_name as name, city, count(*) n
                       from log group by venue_id, venue_name, city order by n desc, venue_name limit 6) x), '[]'),
    'top_songs', coalesce((select jsonb_agg(x order by x.n desc, x.name) from (
                     select min(name) as name, artist_name as artist, artist_id, count(*) n
                       from songs group by artist_id, artist_name, song_key
                      having count(*) > 1
                      order by n desc, min(name) limit 10) x), '[]'),
    'first_hears', coalesce((select jsonb_agg(x) from (
                     select s.name as song, s.artist_name as artist, s.event_date as date, s.attendance_id
                       from songs s where s.hear_index = 1
                      order by s.event_date desc, s.song_pos limit 3) x), '[]'),
    'one_timers', coalesce((select jsonb_agg(x) from (
                     select s.name as song, s.artist_name as artist, s.event_date as date, s.attendance_id
                       from songs s
                      where s.times_heard = 1
                        and (select count(*) from log l where l.artist_id = s.artist_id) >= 3
                      order by s.event_date desc, s.song_pos limit 3) x), '[]'),
    'first_hear_total', (select count(*) from songs where hear_index = 1),
    'streak', jsonb_build_object(
      'current', coalesce((select len from runs
                            where end_m >= date_trunc('month', current_date - interval '1 month')::date
                            order by end_m desc limit 1), 0),
      'longest', coalesce((select max(len) from runs), 0),
      'longest_year', (select extract(year from end_m)::int from runs order by len desc, end_m desc limit 1),
      'last12', (select jsonb_agg(exists (select 1 from months where m = g::date) order by g)
                   from generate_series(date_trunc('month', current_date) - interval '11 months',
                                        date_trunc('month', current_date), interval '1 month') g)
    )
  ) into result;

  return result;
end;
$function$;

-- ---------------------------------------------------------------- year in review

create or replace function public.year_in_review(p_year int, p_user uuid default null)
returns jsonb
language sql stable security definer set search_path = ''
as $function$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  alllog as (select l.* from target, public.user_log(target.uid) l),
  log as (select * from alllog where extract(year from event_date) = p_year),
  songs as (select us.* from target, public._user_songs(target.uid) us
             where extract(year from us.event_date) = p_year and public.can_view_user(target.uid)),
  top_artist as (select artist_name, count(*) n from log group by artist_name order by n desc, artist_name limit 1),
  top_venue as (select venue_name, count(distinct event_date) n from log group by venue_name order by n desc, venue_name limit 1),
  best as (select * from log order by rating desc nulls last, event_date desc limit 1)
  select jsonb_build_object(
    'year', p_year,
    'shows', (select count(distinct (event_date, lower(trim(venue_name)))) from log),
    'artists', (select count(distinct artist_id) from log),
    'venues', (select count(distinct venue_id) from log),
    'songs', (select count(*) from songs),
    'first_hears', (select count(*) from songs where hear_index = 1),
    'miles', (select coalesce(round(sum(2 * public.distance_miles(h.lat, h.lng, l.lat, l.lng))), 0)
                from (select distinct on (event_date, lower(trim(venue_name))) * from log) l
                cross join target
                cross join lateral public._home_at(target.uid, l.event_date) h),
    'new_artists', (select count(*) from (
        select artist_id from alllog group by artist_id
        having extract(year from min(event_date)) = p_year) x),
    'top_artist', (select artist_name from top_artist),
    'top_artist_n', (select n from top_artist),
    'top_venue', (select venue_name from top_venue),
    'top_venue_n', (select n from top_venue),
    'best_show', (select jsonb_build_object('attendance_id', attendance_id, 'artist', artist_name,
                    'venue', venue_name, 'date', event_date, 'rating', rating) from best)
  );
$function$;

-- ---------------------------------------------------------------- venue

-- miles_from_home: from where you live now.
-- miles_traveled:  round trips to this venue, each from where you lived then.
create or replace function public.venue_stats(p_venue uuid, p_user uuid default null)
returns jsonb
language sql stable security definer set search_path = ''
as $function$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  log as (select l.* from target, public.user_log(target.uid) l),
  ranked as (select venue_id, dense_rank() over (order by count(*) desc) r from log group by venue_id),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  here as (select * from log where venue_id = p_venue)
  select jsonb_build_object(
    'visits', (select count(*) from here),
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

-- ---------------------------------------------------------------- badges

create or replace function public.user_badges(p_user uuid default null)
returns table (key text, name text, description text, color text, target int, progress int, earned boolean, sort_order int)
language sql stable security definer set search_path = ''
as $function$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
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
  -- Each show measured from where you lived that night.
  homed as (select shows.*, public.distance_miles(h.lat, h.lng, shows.lat, shows.lng) mi
              from shows cross join target
              cross join lateral public._home_at(target.uid, shows.event_date) h
             where shows.lat is not null),
  vals as (
    select 'first_show' k, (select count(*) from shows)::int v
    union all select 'venue_regular', coalesce((select max(n) from (select count(*) n from shows group by vkey) x), 0)::int
    union all select 'superfan', coalesce((select max(n) from (select count(*) n from log group by artist_id) x), 0)::int
    union all select 'passport', (select count(*) from log cross join target
                                   cross join lateral public._home_at(target.uid, log.event_date) h
                                   where h.country_code is not null and log.country_code is not null
                                     and log.country_code <> h.country_code)::int
    union all select 'coast_to_coast', (select count(*) from (
                     select extract(year from event_date) from log where country_code = 'US'
                      group by 1 having bool_or(lng < -114) and bool_or(lng > -82)) x)::int
    union all select 'thousand_club', (select count(*) from songs)::int
    union all select 'double_header', (select count(*) from (select event_date from shows group by 1 having count(*) > 1) x)::int
    union all select 'century_club', (select count(*) from shows)::int
    union all select 'festival_rat', (select count(distinct coalesce(lower(festival_name), vkey || ':' || extract(year from event_date)))
                                        from shows where is_festival)::int
    union all select 'road_warrior', (select coalesce(round(sum(2 * mi)), 0) from homed)::int
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
