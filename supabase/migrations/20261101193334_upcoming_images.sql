-- Images for upcoming shows. SeatGeek's API has no artist or venue images,
-- so the seatgeek function fills these from our catalog, Deezer (artists)
-- and Wikidata/Wikipedia (venues).
alter table public.upcoming_events
  add column image_credit       text,
  add column venue_image_url    text,
  add column venue_image_credit text,
  add column venue_checked_at   timestamptz;

/** Catalog artist photos by name (case-insensitive), for SeatGeek results. */
create or replace function public._artist_images(p_names text[])
returns table (name text, image_url text, image_credit text)
language sql stable security definer set search_path = ''
as $$
  select distinct on (lower(a.name)) lower(a.name), a.image_url, a.image_credit
    from public.artists a
   where a.image_url is not null
     and lower(a.name) = any (select lower(x) from unnest(p_names) x)
   order by lower(a.name), a.created_at;
$$;

/** A catalog venue photo by name and city (case-insensitive). */
create or replace function public._venue_image(p_name text, p_city text)
returns table (image_url text, image_credit text)
language sql stable security definer set search_path = ''
as $$
  select v.image_url, v.image_credit
    from public.venues v
   where v.image_url is not null
     and lower(v.name) = lower(p_name)
     and (p_city is null or lower(v.city) = lower(p_city))
   order by v.created_at
   limit 1;
$$;

revoke execute on function public._artist_images(text[]), public._venue_image(text, text)
  from public, anon, authenticated;

-- Image lookups ("img:" keys) are kept for 30 days; API responses for 2.
select cron.schedule('prune-api-cache', '30 4 * * *', $$
  delete from public.api_cache
   where (key like 'img:%' and fetched_at < now() - interval '30 days')
      or (key not like 'img:%' and fetched_at < now() - interval '2 days')
$$);
