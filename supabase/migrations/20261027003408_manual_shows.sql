-- RPCs for shows that aren't on setlist.fm. They live only in Stubstash.

-- Replaces a show's setlist from JSON: [{"name":"Set 1","encore":false,"songs":["A","B"]}, ...]
create or replace function public._write_setlist(p_show uuid, p_sets jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  s jsonb;
  song jsonb;
  set_i int := 0;
  pos int := 0;
begin
  delete from public.setlist_songs where show_id = p_show;
  for s in select * from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) loop
    for song in select * from jsonb_array_elements(coalesce(s -> 'songs', '[]'::jsonb)) loop
      if nullif(trim(song #>> '{}'), '') is null then continue; end if;
      pos := pos + 1;
      insert into public.setlist_songs (show_id, set_index, set_name, is_encore, position, name)
      values (p_show, set_i, coalesce(nullif(trim(s ->> 'name'), ''), 'Set'),
              coalesce((s ->> 'encore')::boolean, false), pos, left(trim(song #>> '{}'), 300));
    end loop;
    set_i := set_i + 1;
  end loop;
  update public.shows set setlist_synced_at = now() where id = p_show;
  return pos;
end;
$$;
revoke execute on function public._write_setlist(uuid, jsonb) from public, anon, authenticated;

-- Creates a manual show (reusing an existing artist/venue when an id is given)
-- and logs it for the caller. Returns the new attendance id.
--
-- p: {
--   artist_id?, artist_name?, venue_id?, venue_name?, city?, state_code?, country_code?,
--   event_date, tour_name?, is_festival?, sets?: [...],
--   rating?, seat?, price_cents?, currency?, merch?, notes?
-- }
create or replace function public.create_manual_show(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_artist uuid := nullif(p ->> 'artist_id', '')::uuid;
  v_venue uuid := nullif(p ->> 'venue_id', '')::uuid;
  v_show uuid;
  v_att uuid;
  v_date date := (p ->> 'event_date')::date;
begin
  if me is null then raise exception 'not signed in'; end if;
  if v_date is null then raise exception 'date is required'; end if;
  if v_date > current_date + 1 then raise exception 'that show hasn''t happened yet'; end if;

  if v_artist is not null then
    if not public.can_view_artist(v_artist) then raise exception 'artist not found'; end if;
  else
    if nullif(trim(p ->> 'artist_name'), '') is null then raise exception 'artist is required'; end if;
    -- Reuse a setlist.fm artist with the exact same name, else create a manual one.
    select id into v_artist from public.artists
     where lower(name) = lower(trim(p ->> 'artist_name')) and (source = 'setlistfm' or created_by = me)
     order by (source = 'setlistfm') desc limit 1;
    if v_artist is null then
      insert into public.artists (name, source, created_by)
      values (left(trim(p ->> 'artist_name'), 200), 'manual', me)
      returning id into v_artist;
    end if;
  end if;

  if v_venue is not null then
    if not public.can_view_venue(v_venue) then raise exception 'venue not found'; end if;
  else
    if nullif(trim(p ->> 'venue_name'), '') is null then raise exception 'venue is required'; end if;
    insert into public.venues (name, city, state_code, country_code, source, created_by)
    values (left(trim(p ->> 'venue_name'), 200), nullif(trim(p ->> 'city'), ''),
            nullif(trim(p ->> 'state_code'), ''), upper(nullif(trim(p ->> 'country_code'), '')),
            'manual', me)
    returning id into v_venue;
  end if;

  insert into public.shows (artist_id, venue_id, event_date, tour_name, is_festival, source, created_by)
  values (v_artist, v_venue, v_date, nullif(trim(p ->> 'tour_name'), ''),
          coalesce((p ->> 'is_festival')::boolean, false), 'manual', me)
  returning id into v_show;

  perform public._write_setlist(v_show, p -> 'sets');

  insert into public.attendances (user_id, show_id, rating, seat, price_cents, currency, merch, notes)
  values (me, v_show,
          nullif(p ->> 'rating', '')::numeric,
          nullif(trim(p ->> 'seat'), ''),
          nullif(p ->> 'price_cents', '')::int,
          coalesce(nullif(p ->> 'currency', ''), 'USD'),
          nullif(trim(p ->> 'merch'), ''),
          nullif(trim(p ->> 'notes'), ''))
  returning id into v_att;

  return v_att;
end;
$$;

-- Edits the catalog side of a manual show you created (date, tour, venue text, setlist).
create or replace function public.update_manual_show(p_show uuid, p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  sh public.shows;
begin
  select * into sh from public.shows where id = p_show;
  if sh is null or sh.source <> 'manual' or sh.created_by is distinct from me then
    raise exception 'you can only edit shows you added';
  end if;

  update public.shows set
    event_date  = coalesce((p ->> 'event_date')::date, event_date),
    tour_name   = case when p ? 'tour_name' then nullif(trim(p ->> 'tour_name'), '') else tour_name end,
    is_festival = coalesce((p ->> 'is_festival')::boolean, is_festival)
  where id = p_show;

  update public.venues set
    name       = coalesce(nullif(trim(p ->> 'venue_name'), ''), name),
    city       = case when p ? 'city' then nullif(trim(p ->> 'city'), '') else city end,
    geo_checked_at = case when p ? 'venue_name' or p ? 'city' then null else geo_checked_at end
  where id = sh.venue_id and source = 'manual' and created_by = me;

  update public.artists set
    name = coalesce(nullif(trim(p ->> 'artist_name'), ''), name),
    image_checked_at = case when p ? 'artist_name' then null else image_checked_at end
  where id = sh.artist_id and source = 'manual' and created_by = me;

  if p ? 'sets' then
    perform public._write_setlist(p_show, p -> 'sets');
  end if;
end;
$$;

-- Autocomplete over artists/venues the caller can see (catalog + their own manual entries).
create or replace function public.search_catalog_artists(q text)
returns table (id uuid, name text, image_url text, source public.data_source)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.name, a.image_url, a.source
    from public.artists a
   where char_length(trim(q)) >= 2
     and a.name ilike '%' || trim(q) || '%'
     and (a.source = 'setlistfm' or a.created_by = (select auth.uid()))
   order by (lower(a.name) = lower(trim(q))) desc, extensions.similarity(a.name, q) desc
   limit 8;
$$;

create or replace function public.search_catalog_venues(q text)
returns table (id uuid, name text, city text, state_code text, country_code text, source public.data_source)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.name, v.city, v.state_code, v.country_code, v.source
    from public.venues v
   where char_length(trim(q)) >= 2
     and (v.name ilike '%' || trim(q) || '%' or v.city ilike trim(q) || '%')
     and (v.source = 'setlistfm' or v.created_by = (select auth.uid()))
   order by (lower(v.name) = lower(trim(q))) desc, extensions.similarity(v.name, q) desc
   limit 8;
$$;

revoke execute on function public.create_manual_show(jsonb) from public, anon;
revoke execute on function public.update_manual_show(uuid, jsonb) from public, anon;
revoke execute on function public.search_catalog_artists(text) from public, anon;
revoke execute on function public.search_catalog_venues(text) from public, anon;
