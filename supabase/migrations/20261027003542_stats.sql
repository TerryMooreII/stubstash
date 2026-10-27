-- Stats functions. All are computed from the user's own log ("personal stats only").
-- Each takes the target user (defaults to the caller) and returns nothing unless
-- the caller is allowed to see that user's log.

-- The user's log with everything a list or card needs, numbered in date order.
create or replace function public.user_log(p_user uuid default null)
returns table (
  attendance_id uuid, show_id uuid, show_number bigint, event_date date,
  artist_id uuid, artist_name text, artist_image text,
  venue_id uuid, venue_name text, city text, state_code text, country_code text,
  lat double precision, lng double precision,
  tour_name text, is_festival boolean, source public.data_source, setlistfm_id text,
  rating numeric, song_count bigint, has_stub boolean, photo_count bigint, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  with target as (select coalesce(p_user, (select auth.uid())) as uid)
  select a.id, s.id,
         row_number() over (order by s.event_date, a.created_at),
         s.event_date,
         ar.id, ar.name, ar.image_url,
         v.id, v.name, v.city, v.state_code, v.country_code,
         coalesce(pin.lat, v.lat, v.city_lat), coalesce(pin.lng, v.lng, v.city_lng),
         s.tour_name, coalesce(a.is_festival, s.is_festival), s.source, s.setlistfm_id,
         a.rating,
         (select count(*) from public.setlist_songs ss where ss.show_id = s.id and not ss.is_tape),
         a.stub_path is not null,
         (select count(*) from public.attendance_photos ph where ph.attendance_id = a.id),
         a.created_at
    from target
    join public.attendances a on a.user_id = target.uid
    join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id
    join public.venues v on v.id = s.venue_id
    left join public.user_venue_pins pin on pin.user_id = target.uid and pin.venue_id = v.id
   where public.can_view_user(target.uid);
$$;

-- Every song the user has heard live, with first-hear and play-count info.
create or replace function public._user_songs(p_user uuid)
returns table (
  attendance_id uuid, show_id uuid, event_date date, artist_id uuid, artist_name text,
  song_pos int, name text, song_key text, hear_index bigint, times_heard bigint
)
language sql stable security definer set search_path = ''
as $$
  select a.id, s.id, s.event_date, ar.id, ar.name, ss.position, ss.name, ss.song_key,
         row_number() over (partition by ar.id, ss.song_key order by s.event_date, a.created_at, ss.position),
         count(*) over (partition by ar.id, ss.song_key)
    from public.attendances a
    join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id
    join public.setlist_songs ss on ss.show_id = s.id and not ss.is_tape
   where a.user_id = p_user and ss.song_key <> '';
$$;
revoke execute on function public._user_songs(uuid) from public, anon, authenticated;

create or replace function public.dashboard_stats(p_user uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
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
      'shows',        (select count(*) from log),
      'artists',      (select count(distinct artist_id) from log),
      'artists_multi',(select count(*) from (select artist_id from log group by artist_id having count(*) > 1) x),
      'venues',       (select count(distinct venue_id) from log),
      'songs',        (select count(*) from songs),
      'unique_songs', (select count(distinct (artist_id, song_key)) from songs),
      'cities',       (select count(distinct (lower(city), country_code)) from log where city is not null),
      'countries',    (select count(distinct country_code) from log where country_code is not null),
      'festivals',    (select count(*) from log where is_festival),
      'miles',        (select coalesce(round(sum(2 * public.distance_miles(prof.home_lat, prof.home_lng, lat, lng))), 0) from log),
      'first_show',   (select min(event_date) from log),
      'last_show',    (select max(event_date) from log),
      'rated',        (select count(*) from log where rating is not null),
      'avg_rating',   (select round(avg(rating), 2) from log)
    ),
    'home', jsonb_build_object('city', prof.home_city, 'has_coords', prof.home_lat is not null),
    'per_year', coalesce((select jsonb_agg(jsonb_build_object('year', y, 'n', n) order by y)
                            from (select extract(year from event_date)::int y, count(*) n from log group by 1) x), '[]'),
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
    -- "Rare catches" (personal): newest first-time hears, and songs heard only once
    -- from artists seen 3+ times.
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
$$;

-- Setlist for one attended show, tagged with the user's personal history.
create or replace function public.show_setlist(p_attendance uuid)
returns table (set_index int, set_name text, is_encore boolean, "position" int, name text,
               info text, is_cover boolean, cover_artist text, is_tape boolean,
               first_hear boolean, times_heard bigint, only_here boolean)
language sql stable security definer set search_path = ''
as $$
  with att as (
    select a.* from public.attendances a
     where a.id = p_attendance and public.can_view_user(a.user_id)
  ),
  hist as (
    select us.* from att, public._user_songs(att.user_id) us
  )
  select ss.set_index, ss.set_name, ss.is_encore, ss.position, ss.name, ss.info,
         ss.is_cover, ss.cover_artist, ss.is_tape,
         coalesce(h.hear_index = 1 and h.attendance_id = att.id, false),
         coalesce(h.times_heard, 0),
         coalesce(h.times_heard = 1, false)
    from att
    join public.setlist_songs ss on ss.show_id = att.show_id
    left join hist h on h.attendance_id = att.id and h.song_pos = ss.position
   order by ss.position;
$$;

-- Headline numbers for one attended show.
create or replace function public.show_stats(p_attendance uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with att as (
    select a.*, s.artist_id, s.event_date from public.attendances a
      join public.shows s on s.id = a.show_id
     where a.id = p_attendance and public.can_view_user(a.user_id)
  ),
  log as (select l.* from att, public.user_log(att.user_id) l)
  select jsonb_build_object(
    'show_number', (select show_number from log where attendance_id = p_attendance),
    'songs', (select count(*) from public.setlist_songs ss, att where ss.show_id = att.show_id and not ss.is_tape),
    'first_hears', (select count(*) from att, public._user_songs(att.user_id) us
                     where us.attendance_id = att.id and us.hear_index = 1),
    'artist_ordinal', (select count(*) from log, att
                        where log.artist_id = att.artist_id
                          and (log.event_date, log.created_at) <= (att.event_date, att.created_at)),
    'artist_total', (select count(*) from log, att where log.artist_id = att.artist_id)
  )
  from att;
$$;

create or replace function public.artist_stats(p_artist uuid, p_user uuid default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  log as (select l.* from target, public.user_log(target.uid) l where l.artist_id = p_artist),
  songs as (select us.* from target, public._user_songs(target.uid) us
             where us.artist_id = p_artist and public.can_view_user(target.uid))
  select jsonb_build_object(
    'seen', (select count(*) from log),
    'first', (select min(event_date) from log),
    'last', (select max(event_date) from log),
    'unique_songs', (select count(distinct song_key) from songs),
    'songs_heard', (select count(*) from songs),
    'heard_most', coalesce((select jsonb_agg(x) from (
        select min(name) as name, count(*) as n from songs group by song_key
         order by n desc, min(name) limit 10) x), '[]'),
    'heard_once', coalesce((select jsonb_agg(x) from (
        select name, event_date as date from songs where times_heard = 1
         order by event_date desc limit 12) x), '[]'),
    'venues', (select count(distinct venue_id) from log),
    'avg_rating', (select round(avg(rating), 2) from log)
  );
$$;

create or replace function public.venue_stats(p_venue uuid, p_user uuid default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
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
                          from prof, (select lat, lng from here limit 1) h)
  );
$$;

-- One row per venue the user has been to, for the map.
create or replace function public.map_venues(p_user uuid default null)
returns table (venue_id uuid, name text, city text, state_code text, country_code text,
               lat double precision, lng double precision, visits bigint,
               first_year int, last_year int, recent_artists text[], miles_from_home double precision,
               geo_source public.geo_source)
language sql stable security definer set search_path = ''
as $$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  log as (select l.* from target, public.user_log(target.uid) l)
  select l.venue_id, l.venue_name, l.city, l.state_code, l.country_code,
         max(l.lat), max(l.lng), count(*),
         min(extract(year from l.event_date))::int, max(extract(year from l.event_date))::int,
         (array_agg(distinct l.artist_name))[1:3],
         round(public.distance_miles((select home_lat from prof), (select home_lng from prof), max(l.lat), max(l.lng))),
         (select v.geo_source from public.venues v where v.id = l.venue_id)
    from log l
   group by l.venue_id, l.venue_name, l.city, l.state_code, l.country_code
   order by count(*) desc;
$$;

-- Home base for the map (only to people who can see the log).
create or replace function public.map_home(p_user uuid default null)
returns table (city text, lat double precision, lng double precision)
language sql stable security definer set search_path = ''
as $$
  select p.home_city, p.home_lat, p.home_lng
    from public.profiles p
   where p.id = coalesce(p_user, (select auth.uid())) and public.can_view_user(p.id);
$$;

create or replace function public.year_in_review(p_year int, p_user uuid default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  alllog as (select l.* from target, public.user_log(target.uid) l),
  log as (select * from alllog where extract(year from event_date) = p_year),
  songs as (select us.* from target, public._user_songs(target.uid) us
             where extract(year from us.event_date) = p_year and public.can_view_user(target.uid)),
  top_artist as (select artist_name, count(*) n from log group by artist_name order by n desc, artist_name limit 1),
  top_venue as (select venue_name, count(*) n from log group by venue_name order by n desc, venue_name limit 1),
  best as (select * from log order by rating desc nulls last, event_date desc limit 1)
  select jsonb_build_object(
    'year', p_year,
    'shows', (select count(*) from log),
    'artists', (select count(distinct artist_id) from log),
    'venues', (select count(distinct venue_id) from log),
    'songs', (select count(*) from songs),
    'first_hears', (select count(*) from songs where hear_index = 1),
    'miles', (select coalesce(round(sum(2 * public.distance_miles(prof.home_lat, prof.home_lng, l.lat, l.lng))), 0) from log l, prof),
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
$$;

-- Shows two users both attended.
create or replace function public.shared_shows(p_other uuid)
returns table (attendance_id uuid, event_date date, artist_name text, venue_name text, city text)
language sql stable security definer set search_path = ''
as $$
  select mine.attendance_id, mine.event_date, mine.artist_name, mine.venue_name, mine.city
    from public.user_log((select auth.uid())) mine
    join public.attendances theirs on theirs.show_id = mine.show_id and theirs.user_id = p_other
   where public.can_view_user(p_other)
   order by mine.event_date desc;
$$;

revoke execute on function public.shared_shows(uuid) from public, anon;
