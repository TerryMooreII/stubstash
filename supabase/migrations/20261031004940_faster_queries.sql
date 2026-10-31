-- Speed-ups for stats, search, row security and background jobs.
-- Same results as before; checked against live data before applying.

-- ---------------------------------------------------------------- home lookups
-- _home_at runs once per show inside the stats functions. As SECURITY DEFINER
-- with a pinned search_path Postgres can't fold it into the calling query, so
-- every call paid function overhead. Plain SQL functions get inlined. They're
-- still only callable from other functions (execute stays revoked), and every
-- name is schema-qualified.
create or replace function public._user_homes(p_user uuid)
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

create or replace function public._home_at(p_user uuid, p_date date)
returns table (city text, lat double precision, lng double precision, country_code text)
language sql stable
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

-- ---------------------------------------------------------------- stats
-- dashboard_stats: one_timers counted the log once per song; now one grouped count.
-- user_badges: full_run compared every show with every other; now a window count.

-- Patched in place (as earlier migrations do) so other edits to these
-- functions are kept. Fails loudly if the expected text isn't there.
do $do$
declare
  d text := pg_get_functiondef('public.dashboard_stats(uuid)'::regprocedure);
  a_old text := $a$  songs as (select * from public._user_songs(uid)),
$a$;
  a_new text := $a$  songs as (select * from public._user_songs(uid)),
  artist_sets as (select artist_id, count(*) n from log group by artist_id),
$a$;
  b_old text := $a$                       from songs s
                      where s.times_heard = 1
                        and (select count(*) from log l where l.artist_id = s.artist_id) >= 3$a$;
  b_new text := $a$                       from songs s
                       join artist_sets a on a.artist_id = s.artist_id and a.n >= 3
                      where s.times_heard = 1$a$;
begin
  if position(a_old in d) = 0 or position(b_old in d) = 0 then
    raise exception 'dashboard_stats: expected one_timers text not found';
  end if;
  execute replace(replace(d, a_old, a_new), b_old, b_new);
end
$do$;

do $do$
declare
  d text := pg_get_functiondef('public.user_badges(uuid)'::regprocedure);
  old text := $a$    union all select 'full_run', coalesce((select max((select count(*) from log b where b.artist_id = a.artist_id
                                                         and b.event_date between a.event_date and a.event_date + 6))
                                             from log a), 0)::int$a$;
  new text := $a$    union all select 'full_run', coalesce((select max(n) from (
                     select count(*) over (partition by artist_id order by event_date
                                           range between current row and interval '6 days' following) n
                       from log) x), 0)::int$a$;
begin
  if position(old in d) = 0 then
    raise exception 'user_badges: expected full_run text not found';
  end if;
  execute replace(d, old, new);
end
$do$;

-- ---------------------------------------------------------------- indexes

-- check_new_badges (every 5 min) looks for attendances updated recently.
create index if not exists attendances_updated_at on public.attendances (updated_at);
-- queue_rating_nudges (hourly) looks for unrated, un-nudged attendances.
create index if not exists attendances_needs_rating on public.attendances (show_id)
  where rating is null and rating_nudged_at is null;
create index if not exists badge_awards_key on public.badge_awards (key);
-- search_catalog_venues matches on city too.
create index if not exists venues_city_trgm on public.venues using gin (city extensions.gin_trgm_ops);

-- ---------------------------------------------------------------- people search
-- ilike (not lower() like) so the trigram indexes on handle and display_name are used.
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
     and (p.handle::text ilike term.t || '%' or p.display_name ilike '%' || term.t || '%')
   order by (lower(p.handle::text) = term.t) desc, p.handle
   limit 20;
$function$;

-- ---------------------------------------------------------------- row security
-- Check the cheap column conditions first so most rows skip the function call.

drop policy "attendances: visible" on public.attendances;
create policy "attendances: visible" on public.attendances
  for select to anon, authenticated
  using (user_id = (select auth.uid()) or public.can_view_user(user_id));

drop policy "photos: visible" on public.attendance_photos;
create policy "photos: visible" on public.attendance_photos
  for select to anon, authenticated
  using (user_id = (select auth.uid()) or public.can_view_user(user_id));

drop policy "shows: visible" on public.shows;
create policy "shows: visible" on public.shows
  for select to anon, authenticated
  using (source = 'setlistfm' or created_by = (select auth.uid()) or public.can_view_show(id));

drop policy "artists: visible" on public.artists;
create policy "artists: visible" on public.artists
  for select to anon, authenticated
  using (source = 'setlistfm' or created_by = (select auth.uid()) or public.can_view_artist(id));

drop policy "venues: visible" on public.venues;
create policy "venues: visible" on public.venues
  for select to anon, authenticated
  using (source = 'setlistfm' or created_by = (select auth.uid()) or public.can_view_venue(id));

-- ---------------------------------------------------------------- jobs
-- Only wake the enrich edge function when something is waiting to be filled in.
select cron.unschedule('enrich-catalog');
select cron.schedule('enrich-catalog', '*/2 * * * *', $$
  select public._call_edge_function('enrich', '{}')
   where exists (select 1 from public.artists where image_checked_at is null)
      or exists (select 1 from public.venues where geo_checked_at is null or image_checked_at is null)
$$);
