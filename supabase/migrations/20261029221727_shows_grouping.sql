-- One show = one date at one venue (headliner + openers), festival names, headliners.
-- Badges are unchanged: they still count every set.

alter table public.attendances
  add column if not exists festival_name text check (festival_name is null or char_length(festival_name) between 1 and 100),
  add column if not exists headliner boolean;

-- user_log: show_number now numbers shows (date + venue), and rows carry festival_name / headliner.
drop function if exists public.user_log(uuid);
create function public.user_log(p_user uuid default null)
 returns table(attendance_id uuid, show_id uuid, show_number bigint, event_date date, artist_id uuid, artist_name text,
               artist_image text, venue_id uuid, venue_name text, city text, state_code text, country_code text,
               lat double precision, lng double precision, tour_name text, is_festival boolean, source public.data_source,
               setlistfm_id text, rating numeric, song_count bigint, has_stub boolean, photo_count bigint,
               created_at timestamptz, festival_name text, headliner boolean)
 language sql stable security definer
 set search_path to ''
as $function$
  with target as (select coalesce(p_user, (select auth.uid())) as uid)
  select a.id, s.id,
         dense_rank() over (order by s.event_date, v.id),
         s.event_date,
         ar.id, ar.name, ar.image_url,
         v.id, v.name, v.city, v.state_code, v.country_code,
         coalesce(pin.lat, v.lat, v.city_lat), coalesce(pin.lng, v.lng, v.city_lng),
         s.tour_name, coalesce(a.is_festival, s.is_festival), s.source, s.setlistfm_id,
         a.rating,
         (select count(*) from public.setlist_songs ss where ss.show_id = s.id and not ss.is_tape),
         a.stub_path is not null,
         (select count(*) from public.attendance_photos ph where ph.attendance_id = a.id),
         a.created_at,
         case when coalesce(a.is_festival, s.is_festival) then a.festival_name end,
         a.headliner
    from target
    join public.attendances a on a.user_id = target.uid
    join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id
    join public.venues v on v.id = s.venue_id
    left join public.user_venue_pins pin on pin.user_id = target.uid and pin.venue_id = v.id
   where public.can_view_user(target.uid);
$function$;
grant execute on function public.user_log(uuid) to anon, authenticated;

-- How many shows (date + venue) a user has, optionally in one year.
create or replace function public._show_count(p_user uuid, p_year int default null)
 returns bigint language sql stable security definer set search_path to ''
as $$
  select count(distinct (s.event_date, s.venue_id))
    from public.attendances a join public.shows s on s.id = a.show_id
   where a.user_id = p_user and (p_year is null or extract(year from s.event_date) = p_year);
$$;
revoke execute on function public._show_count(uuid, int) from public, anon, authenticated;

-- Festival name suggestions across everyone, most-used spelling first.
create or replace function public.festival_names(q text)
 returns table(name text, uses bigint)
 language sql stable security definer set search_path to ''
as $$
  select (array_agg(festival_name order by festival_name))[1], count(*)
    from public.attendances
   where festival_name is not null
     and char_length(trim(q)) >= 1
     and lower(festival_name) like '%' || lower(trim(q)) || '%'
   group by lower(festival_name)
   order by (lower(min(festival_name)) like lower(trim(q)) || '%') desc, count(*) desc
   limit 8;
$$;
grant execute on function public.festival_names(text) to authenticated;

-- Mark (or unmark) several of your own shows as a festival in one go.
create or replace function public.set_festival(p_ids uuid[], p_on boolean, p_name text default null)
 returns int language plpgsql security invoker set search_path to ''
as $$
declare
  n int;
  nm text := nullif(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
begin
  update public.attendances
     set is_festival = p_on,
         festival_name = case when p_on then left(nm, 100) end,
         updated_at = now()
   where id = any(p_ids) and user_id = (select auth.uid());
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.set_festival(uuid[], boolean, text) to authenticated;

-- Pick the headliner for a show (same date + venue): this set on, the others off.
create or replace function public.set_headliner(p_attendance uuid)
 returns void language sql security invoker set search_path to ''
as $$
  update public.attendances a
     set headliner = (a.id = p_attendance)
    from public.shows s, public.attendances me, public.shows ms
   where me.id = p_attendance and me.user_id = (select auth.uid()) and ms.id = me.show_id
     and a.user_id = me.user_id and s.id = a.show_id
     and s.event_date = ms.event_date and s.venue_id = ms.venue_id;
$$;
grant execute on function public.set_headliner(uuid) to authenticated;

-- Show counts now mean shows (date + venue) everywhere people see them.
create or replace function public.year_in_review(p_year integer, p_user uuid default null)
 returns jsonb language sql stable security definer set search_path to ''
as $function$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  alllog as (select l.* from target, public.user_log(target.uid) l),
  log as (select * from alllog where extract(year from event_date) = p_year),
  songs as (select us.* from target, public._user_songs(target.uid) us
             where extract(year from us.event_date) = p_year and public.can_view_user(target.uid)),
  top_artist as (select artist_name, count(*) n from log group by artist_name order by n desc, artist_name limit 1),
  top_venue as (select venue_name, count(distinct event_date) n from log group by venue_name order by n desc, venue_name limit 1),
  best as (select * from log order by rating desc nulls last, event_date desc limit 1)
  select jsonb_build_object(
    'year', p_year,
    'shows', (select count(distinct (event_date, venue_id)) from log),
    'artists', (select count(distinct artist_id) from log),
    'venues', (select count(distinct venue_id) from log),
    'songs', (select count(*) from songs),
    'first_hears', (select count(*) from songs where hear_index = 1),
    'miles', (select coalesce(round(sum(2 * public.distance_miles(prof.home_lat, prof.home_lng, l.lat, l.lng))), 0)
                from (select distinct on (event_date, venue_id) * from log) l, prof),
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

create or replace function public.my_friends()
 returns table(id uuid, handle text, display_name text, avatar_path text, show_count bigint, shared_count bigint, since timestamptz)
 language sql stable security definer set search_path to ''
as $function$
  with me as (select (select auth.uid()) as uid),
  fr as (
    select case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as fid,
           coalesce(f.responded_at, f.created_at) as since
      from public.friendships f, me
     where f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  )
  select p.id, p.handle::text, p.display_name, p.avatar_path,
         public._show_count(p.id),
         (select count(*) from public.attendances a
            join public.attendances b on b.show_id = a.show_id and b.user_id = (select uid from me)
           where a.user_id = p.id),
         fr.since
    from fr join public.profiles p on p.id = fr.fid
   order by 6 desc, p.handle;
$function$;

create or replace function public.search_people(q text)
 returns table(id uuid, handle text, display_name text, avatar_path text, is_public boolean, friendship text, show_count bigint)
 language sql stable security definer set search_path to ''
as $function$
  with me as (select (select auth.uid()) as uid),
  term as (select lower(regexp_replace(trim(q), '^@', '')) as t)
  select p.id, p.handle::text, p.display_name, p.avatar_path, p.is_public,
         (select case
                   when f.status = 'accepted' then 'friends'
                   when f.status = 'pending' and f.requester_id = me.uid then 'sent'
                   when f.status = 'pending' then 'received' end
            from public.friendships f
           where (f.requester_id = p.id and f.addressee_id = me.uid)
              or (f.addressee_id = p.id and f.requester_id = me.uid)),
         case when public.can_view_user(p.id) then public._show_count(p.id) end
    from public.profiles p, me, term
   where me.uid is not null
     and p.id <> me.uid
     and char_length(term.t) >= 2
     and (lower(p.handle::text) like term.t || '%' or lower(p.display_name) like '%' || term.t || '%')
   order by (lower(p.handle::text) = term.t) desc, p.handle
   limit 20;
$function$;

create or replace function public.public_profile(p_handle text)
 returns table(id uuid, handle text, display_name text, avatar_path text, home_city text, is_public boolean,
               can_view boolean, is_self boolean, friendship text, show_count bigint, header_photo smallint)
 language sql stable security definer set search_path to ''
as $function$
  select p.id, p.handle::text, p.display_name, p.avatar_path,
         case when public.can_view_user(p.id) then p.home_city end,
         p.is_public,
         public.can_view_user(p.id),
         p.id = (select auth.uid()),
         (select case
                   when f.status = 'accepted' then 'friends'
                   when f.status = 'pending' and f.requester_id = (select auth.uid()) then 'sent'
                   when f.status = 'pending' then 'received'
                   else null end
            from public.friendships f
           where (f.requester_id = p.id and f.addressee_id = (select auth.uid()))
              or (f.addressee_id = p.id and f.requester_id = (select auth.uid()))),
         case when public.can_view_user(p.id) then public._show_count(p.id) end,
         p.header_photo
    from public.profiles p
   where p.handle = p_handle::extensions.citext;
$function$;

-- dashboard_stats: shows, festivals, per-year and miles count shows (date + venue); 'sets' keeps the raw total.
do $do$
declare
  d text := pg_get_functiondef('public.dashboard_stats(uuid)'::regprocedure);
  pairs text[][] := array[
    array[$a$'shows',        (select count(*) from log),$a$,
          $b$'shows',        (select count(distinct (event_date, venue_id)) from log),
      'sets',         (select count(*) from log),$b$],
    array[$a$'festivals',    (select count(*) from log where is_festival),$a$,
          $b$'festivals',    (select count(distinct coalesce(lower(festival_name), venue_id::text || ':' || extract(year from event_date)))
                          from log where is_festival),$b$],
    array[$a$'miles',        (select coalesce(round(sum(2 * public.distance_miles(prof.home_lat, prof.home_lng, lat, lng))), 0) from log),$a$,
          $b$'miles',        (select coalesce(round(sum(2 * public.distance_miles(prof.home_lat, prof.home_lng, lat, lng))), 0)
                          from (select distinct on (event_date, venue_id) lat, lng from log) x),$b$],
    array[$a$(select extract(year from event_date)::int y, count(*) n from log group by 1) x)$a$,
          $b$(select extract(year from event_date)::int y, count(distinct (event_date, venue_id)) n from log group by 1) x)$b$]
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    if position(pairs[i][1] in d) = 0 then
      raise exception 'dashboard_stats: expected text not found (%)', left(pairs[i][1], 40);
    end if;
    d := replace(d, pairs[i][1], pairs[i][2]);
  end loop;
  execute d;
end
$do$;
