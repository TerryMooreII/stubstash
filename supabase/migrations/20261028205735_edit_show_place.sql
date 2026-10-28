-- Editing a show you added can now change the venue's state and country.
-- Changing the venue name or place also clears the old map position so the
-- lookup job finds it again (a pin you placed by hand is kept).

create or replace function public.update_manual_show(p_show uuid, p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  sh public.shows;
  place_changed boolean := p ? 'city' or p ? 'state_code' or p ? 'country_code';
  moved boolean := place_changed or p ? 'venue_name';
begin
  select * into sh from public.shows where id = p_show;
  if sh is null or sh.source <> 'manual' or sh.created_by is distinct from me then
    raise exception 'you can only edit shows you added';
  end if;
  if p ? 'country_code' and nullif(trim(p ->> 'country_code'), '') is not null
     and upper(trim(p ->> 'country_code')) !~ '^[A-Z]{2}$' then
    raise exception 'Use a two-letter country code, like US';
  end if;

  update public.shows set
    event_date  = coalesce((p ->> 'event_date')::date, event_date),
    tour_name   = case when p ? 'tour_name' then nullif(trim(p ->> 'tour_name'), '') else tour_name end,
    is_festival = coalesce((p ->> 'is_festival')::boolean, is_festival)
  where id = p_show;

  update public.venues set
    name         = coalesce(nullif(trim(p ->> 'venue_name'), ''), name),
    city         = case when p ? 'city' then nullif(trim(p ->> 'city'), '') else city end,
    state_code   = case when p ? 'state_code' then upper(nullif(trim(p ->> 'state_code'), '')) else state_code end,
    state        = case when p ? 'state_code' then null else state end,
    country_code = case when p ? 'country_code' then upper(nullif(trim(p ->> 'country_code'), '')) else country_code end,
    country_name = case when p ? 'country_code' then null else country_name end,
    city_lat     = case when place_changed then null else city_lat end,
    city_lng     = case when place_changed then null else city_lng end,
    lat          = case when moved and geo_source <> 'user' then null else lat end,
    lng          = case when moved and geo_source <> 'user' then null else lng end,
    geo_source   = case when moved and geo_source <> 'user' then 'none' else geo_source end,
    wikidata_id  = case when moved then null else wikidata_id end,
    -- The old photo may belong to the old match; an admin-set image stays.
    image_url    = case when moved and image_source is distinct from 'admin' then null else image_url end,
    image_source = case when moved and image_source is distinct from 'admin' then null else image_source end,
    image_credit = case when moved and image_source is distinct from 'admin' then null else image_credit end,
    geo_checked_at   = case when moved then null else geo_checked_at end,
    image_checked_at = case when moved then null else image_checked_at end
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
