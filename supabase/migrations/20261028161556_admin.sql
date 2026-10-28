-- Admin role and admin-only RPCs: health overview, user list, catalog cleanup
-- (edit, re-run lookups, merge duplicates).
--
-- Admins live in their own table with RLS on and no policies, so the app can
-- never read or write it directly. Grant admin with SQL only:
--   insert into public.admins (user_id) values ('<auth user id>');
-- Suspending and deleting users needs the Auth admin API, so that lives in the
-- "admin" edge function, which checks is_admin() the same way.

create table public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create or replace function public._require_admin()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- overview

create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  out jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'users',        (select count(*) from auth.users),
      'users_7d',     (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'users_30d',    (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'active_7d',    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'suspended',    (select count(*) from auth.users where banned_until > now()),
      'unconfirmed',  (select count(*) from auth.users where email_confirmed_at is null),
      'public',       (select count(*) from public.profiles where is_public),
      'attendances',  (select count(*) from public.attendances),
      'attendances_7d', (select count(*) from public.attendances where created_at > now() - interval '7 days'),
      'shows',        (select count(*) from public.shows),
      'manual_shows', (select count(*) from public.shows where source = 'manual'),
      'artists',      (select count(*) from public.artists),
      'venues',       (select count(*) from public.venues),
      'songs',        (select count(*) from public.setlist_songs),
      'photos',       (select count(*) from public.attendance_photos),
      'friendships',  (select count(*) from public.friendships where status = 'accepted'),
      'push_devices', (select count(*) from public.push_subscriptions)
    ),
    -- Last 12 weeks, oldest first.
    'weekly', (
      select jsonb_agg(jsonb_build_object(
        'week', to_char(w, 'YYYY-MM-DD'),
        'signups', (select count(*) from auth.users u where u.created_at >= w and u.created_at < w + interval '7 days'),
        'logged',  (select count(*) from public.attendances a where a.created_at >= w and a.created_at < w + interval '7 days')
      ) order by w)
      from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') w
    ),
    'catalog', jsonb_build_object(
      'artists_pending',   (select count(*) from public.artists where image_checked_at is null),
      'artists_no_image',  (select count(*) from public.artists where image_checked_at is not null and image_url is null),
      'venues_pending',    (select count(*) from public.venues where geo_checked_at is null or image_checked_at is null),
      'venues_city_only',  (select count(*) from public.venues where lat is null),
      'venues_no_image',   (select count(*) from public.venues where image_checked_at is not null and image_url is null),
      'unused_artists',    (select count(*) from public.artists a where not exists (select 1 from public.shows s where s.artist_id = a.id)),
      'unused_venues',     (select count(*) from public.venues v where not exists (select 1 from public.shows s where s.venue_id = v.id)),
      'api_cache_rows',    (select count(*) from public.api_cache),
      'api_cache_bytes',   (select pg_total_relation_size('public.api_cache'))
    ),
    'jobs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_start', r.start_time, 'last_status', r.status, 'last_message', left(r.return_message, 300),
        'failures_24h', (select count(*) from cron.job_run_details d
                          where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours')
      ) order by j.jobname), '[]'::jsonb)
      from cron.job j
      left join lateral (
        select d.start_time, d.status, d.return_message from cron.job_run_details d
         where d.jobid = j.jobid order by d.start_time desc limit 1
      ) r on true
    ),
    -- Edge function calls made by the jobs (pg_net keeps a few hours of these).
    'http', jsonb_build_object(
      'ok',     (select count(*) from net._http_response where status_code between 200 and 299),
      'failed', (select count(*) from net._http_response where status_code is null or status_code >= 300),
      'recent_failures', (
        select coalesce(jsonb_agg(x order by x.created desc), '[]'::jsonb) from (
          select created, status_code, left(coalesce(error_msg, content::text), 300) as message
            from net._http_response where status_code is null or status_code >= 300
           order by created desc limit 10
        ) x
      )
    )
  ) into out;
  return out;
end;
$$;

-- ---------------------------------------------------------------- users

create or replace function public.admin_users(q text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, email text, handle text, display_name text, home_city text, is_public boolean, is_admin boolean,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, banned_until timestamptz,
  onboarded boolean, show_count bigint, last_logged_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  return query
  with base as (
    select u.id, u.email::text, p.handle::text, p.display_name, p.home_city, coalesce(p.is_public, false) is_public,
           exists (select 1 from public.admins a where a.user_id = u.id) is_admin,
           u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null email_confirmed,
           case when u.banned_until > now() then u.banned_until end banned_until,
           p.onboarded_at is not null onboarded,
           (select count(*) from public.attendances a where a.user_id = u.id) show_count,
           (select max(a.created_at) from public.attendances a where a.user_id = u.id) last_logged_at
      from auth.users u
      left join public.profiles p on p.id = u.id
     where q is null or q = ''
        or u.email ilike '%' || q || '%'
        or p.handle::text ilike '%' || q || '%'
        or p.display_name ilike '%' || q || '%'
  )
  select b.*, count(*) over () total from base b
   order by b.created_at desc
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

-- ---------------------------------------------------------------- catalog

create or replace function public.admin_artists(q text default null, p_filter text default 'all', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, name text, mbid text, disambiguation text, genre text, source public.data_source,
  image_url text, image_source text, image_credit text, image_checked_at timestamptz,
  shows bigint, fans bigint, created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  return query
  with base as (
    select a.id, a.name, a.mbid, a.disambiguation, a.genre, a.source,
           a.image_url, a.image_source, a.image_credit, a.image_checked_at,
           (select count(*) from public.shows s where s.artist_id = a.id) shows,
           (select count(distinct t.user_id) from public.shows s join public.attendances t on t.show_id = s.id where s.artist_id = a.id) fans,
           a.created_at
      from public.artists a
     where (q is null or q = '' or a.name ilike '%' || q || '%')
       and case p_filter
             when 'no_image' then a.image_url is null
             when 'manual' then a.source = 'manual'
             when 'unused' then not exists (select 1 from public.shows s where s.artist_id = a.id)
             else true end
  )
  select b.*, count(*) over () total from base b
   order by b.fans desc, b.name
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_venues(q text default null, p_filter text default 'all', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, name text, city text, state_code text, country_code text, lat double precision, lng double precision,
  city_lat double precision, city_lng double precision, geo_source public.geo_source, wikidata_id text, capacity int,
  source public.data_source, image_url text, image_source text, image_credit text, image_checked_at timestamptz,
  shows bigint, fans bigint, created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  return query
  with base as (
    select v.id, v.name, v.city, v.state_code, v.country_code, v.lat, v.lng, v.city_lat, v.city_lng,
           v.geo_source, v.wikidata_id, v.capacity, v.source, v.image_url, v.image_source, v.image_credit, v.image_checked_at,
           (select count(*) from public.shows s where s.venue_id = v.id) shows,
           (select count(distinct t.user_id) from public.shows s join public.attendances t on t.show_id = s.id where s.venue_id = v.id) fans,
           v.created_at
      from public.venues v
     where (q is null or q = '' or v.name ilike '%' || q || '%' or v.city ilike '%' || q || '%')
       and case p_filter
             when 'no_image' then v.image_url is null
             when 'no_pin' then v.lat is null
             when 'manual' then v.source = 'manual'
             when 'unused' then not exists (select 1 from public.shows s where s.venue_id = v.id)
             else true end
  )
  select b.*, count(*) over () total from base b
   order by b.fans desc, b.name
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

/** Edit an artist. Keys: name, genre, image_url, image_credit, disambiguation. A new image_url is marked as set by an admin. */
create or replace function public.admin_update_artist(p_id uuid, patch jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  update public.artists a set
    name = coalesce(nullif(trim(patch->>'name'), ''), a.name),
    genre = case when patch ? 'genre' then nullif(trim(patch->>'genre'), '') else a.genre end,
    disambiguation = case when patch ? 'disambiguation' then nullif(trim(patch->>'disambiguation'), '') else a.disambiguation end,
    image_url = case when patch ? 'image_url' then nullif(trim(patch->>'image_url'), '') else a.image_url end,
    image_source = case when patch ? 'image_url' then case when nullif(trim(patch->>'image_url'), '') is null then null else 'admin' end else a.image_source end,
    image_credit = case when patch ? 'image_credit' then nullif(trim(patch->>'image_credit'), '')
                        when patch ? 'image_url' then null else a.image_credit end,
    image_checked_at = case when patch ? 'image_url' then now() else a.image_checked_at end
  where a.id = p_id;
  if not found then raise exception 'Artist not found.'; end if;
end;
$$;

/** Edit a venue. Keys: name, city, state_code, country_code, capacity, image_url, image_credit, lat+lng (pin). */
create or replace function public.admin_update_venue(p_id uuid, patch jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  update public.venues v set
    name = coalesce(nullif(trim(patch->>'name'), ''), v.name),
    city = case when patch ? 'city' then nullif(trim(patch->>'city'), '') else v.city end,
    state_code = case when patch ? 'state_code' then nullif(upper(trim(patch->>'state_code')), '') else v.state_code end,
    country_code = case when patch ? 'country_code' then nullif(upper(trim(patch->>'country_code')), '') else v.country_code end,
    capacity = case when patch ? 'capacity' then nullif(patch->>'capacity', '')::int else v.capacity end,
    image_url = case when patch ? 'image_url' then nullif(trim(patch->>'image_url'), '') else v.image_url end,
    image_source = case when patch ? 'image_url' then case when nullif(trim(patch->>'image_url'), '') is null then null else 'admin' end else v.image_source end,
    image_credit = case when patch ? 'image_credit' then nullif(trim(patch->>'image_credit'), '')
                        when patch ? 'image_url' then null else v.image_credit end,
    image_checked_at = case when patch ? 'image_url' then now() else v.image_checked_at end,
    lat = case when patch ? 'lat' then (patch->>'lat')::double precision else v.lat end,
    lng = case when patch ? 'lng' then (patch->>'lng')::double precision else v.lng end,
    geo_source = case when patch ? 'lat' then 'user'::public.geo_source else v.geo_source end,
    geo_checked_at = case when patch ? 'lat' then now() else v.geo_checked_at end
  where v.id = p_id;
  if not found then raise exception 'Venue not found.'; end if;
end;
$$;

/** Queue artists/venues for the image + pin lookup job (runs every 2 minutes). Keeps admin-set pins. */
create or replace function public.admin_requeue(p_kind text, p_ids uuid[])
returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  perform public._require_admin();
  if p_kind = 'artist' then
    update public.artists set image_checked_at = null where id = any (p_ids);
  elsif p_kind = 'venue' then
    update public.venues set image_checked_at = null, geo_checked_at = null where id = any (p_ids);
  else
    raise exception 'Unknown kind %', p_kind;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

/** Merge a duplicate artist into another: moves its shows, keeps the better data, deletes the duplicate. */
create or replace function public.admin_merge_artists(p_from uuid, p_into uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  src public.artists;
  moved int;
begin
  perform public._require_admin();
  if p_from = p_into then raise exception 'Pick two different artists.'; end if;
  select * into src from public.artists where id = p_from;
  if not found or not exists (select 1 from public.artists where id = p_into) then raise exception 'Artist not found.'; end if;

  update public.shows set artist_id = p_into where artist_id = p_from;
  get diagnostics moved = row_count;
  delete from public.artists where id = p_from;

  -- Fill gaps on the kept artist from the duplicate.
  update public.artists a set
    mbid = coalesce(a.mbid, src.mbid),
    genre = coalesce(a.genre, src.genre),
    setlistfm_url = coalesce(a.setlistfm_url, src.setlistfm_url),
    image_url = coalesce(a.image_url, src.image_url),
    image_source = case when a.image_url is null then src.image_source else a.image_source end,
    image_credit = case when a.image_url is null then src.image_credit else a.image_credit end
  where a.id = p_into;
  return moved;
end;
$$;

/** Merge a duplicate venue into another: moves shows and personal pins, keeps the better data. */
create or replace function public.admin_merge_venues(p_from uuid, p_into uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  src public.venues;
  moved int;
begin
  perform public._require_admin();
  if p_from = p_into then raise exception 'Pick two different venues.'; end if;
  select * into src from public.venues where id = p_from;
  if not found or not exists (select 1 from public.venues where id = p_into) then raise exception 'Venue not found.'; end if;

  update public.shows set venue_id = p_into where venue_id = p_from;
  get diagnostics moved = row_count;
  -- Personal pins: keep the one already on the kept venue.
  delete from public.user_venue_pins p where p.venue_id = p_from
     and exists (select 1 from public.user_venue_pins k where k.venue_id = p_into and k.user_id = p.user_id);
  update public.user_venue_pins set venue_id = p_into where venue_id = p_from;
  delete from public.venues where id = p_from;

  update public.venues v set
    lat = coalesce(v.lat, src.lat), lng = coalesce(v.lng, src.lng),
    geo_source = case when v.lat is null and src.lat is not null then src.geo_source else v.geo_source end,
    city_lat = coalesce(v.city_lat, src.city_lat), city_lng = coalesce(v.city_lng, src.city_lng),
    wikidata_id = coalesce(v.wikidata_id, src.wikidata_id),
    capacity = coalesce(v.capacity, src.capacity),
    image_url = coalesce(v.image_url, src.image_url),
    image_source = case when v.image_url is null then src.image_source else v.image_source end,
    image_credit = case when v.image_url is null then src.image_credit else v.image_credit end
  where v.id = p_into;
  return moved;
end;
$$;

/** Delete catalog rows no show uses (left over from deleted manual shows or merges). */
create or replace function public.admin_prune_unused()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare a int; v int;
begin
  perform public._require_admin();
  delete from public.artists x where not exists (select 1 from public.shows s where s.artist_id = x.id);
  get diagnostics a = row_count;
  delete from public.venues x where not exists (select 1 from public.shows s where s.venue_id = x.id);
  get diagnostics v = row_count;
  return jsonb_build_object('artists', a, 'venues', v);
end;
$$;

-- Only signed-in users can call these; each one checks is_admin() itself.
revoke execute on function
  public._require_admin(), public.admin_overview(), public.admin_users(text, int, int),
  public.admin_artists(text, text, int, int), public.admin_venues(text, text, int, int),
  public.admin_update_artist(uuid, jsonb), public.admin_update_venue(uuid, jsonb),
  public.admin_requeue(text, uuid[]), public.admin_merge_artists(uuid, uuid),
  public.admin_merge_venues(uuid, uuid), public.admin_prune_unused()
  from public, anon;
grant execute on function
  public.admin_overview(), public.admin_users(text, int, int),
  public.admin_artists(text, text, int, int), public.admin_venues(text, text, int, int),
  public.admin_update_artist(uuid, jsonb), public.admin_update_venue(uuid, jsonb),
  public.admin_requeue(text, uuid[]), public.admin_merge_artists(uuid, uuid),
  public.admin_merge_venues(uuid, uuid), public.admin_prune_unused()
  to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
