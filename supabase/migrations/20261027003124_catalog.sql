-- Shared catalog of artists, venues, shows and setlists.
-- Rows from setlist.fm are written only by edge functions (service role).
-- Manual rows are created through the create_manual_show() RPC and are visible
-- only to people allowed to see them (see the social migration).

create type public.data_source as enum ('setlistfm', 'manual');
create type public.geo_source as enum ('nominatim', 'city', 'user', 'none');

create table public.artists (
  id                uuid primary key default gen_random_uuid(),
  mbid              text unique,
  name              text not null check (char_length(name) between 1 and 200),
  sort_name         text,
  disambiguation    text,
  setlistfm_url     text,
  genre             text,
  source            public.data_source not null default 'setlistfm',
  created_by        uuid references auth.users (id) on delete set null,
  image_url         text,
  image_source      text,
  image_credit      text,
  image_checked_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index artists_name_trgm on public.artists using gin (name extensions.gin_trgm_ops);
create index artists_image_pending on public.artists (created_at) where image_checked_at is null;
create trigger artists_updated_at before update on public.artists
  for each row execute function public.set_updated_at();

create table public.venues (
  id                uuid primary key default gen_random_uuid(),
  setlistfm_id      text unique,
  name              text not null check (char_length(name) between 1 and 200),
  city              text,
  state             text,
  state_code        text,
  country_code      text,
  country_name      text,
  city_lat          double precision,
  city_lng          double precision,
  lat               double precision,
  lng               double precision,
  geo_source        public.geo_source not null default 'none',
  geo_checked_at    timestamptz,
  capacity          int check (capacity > 0),
  wikidata_id       text,
  source            public.data_source not null default 'setlistfm',
  created_by        uuid references auth.users (id) on delete set null,
  image_url         text,
  image_source      text,
  image_credit      text,
  image_checked_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index venues_name_trgm on public.venues using gin (name extensions.gin_trgm_ops);
create index venues_geo_pending on public.venues (created_at) where geo_checked_at is null;
create index venues_image_pending on public.venues (created_at) where image_checked_at is null;
create trigger venues_updated_at before update on public.venues
  for each row execute function public.set_updated_at();

-- Best known coordinates for a venue (exact pin, else city centre).
create or replace function public.venue_lat(v public.venues) returns double precision
language sql immutable set search_path = '' as $$ select coalesce(v.lat, v.city_lat) $$;
create or replace function public.venue_lng(v public.venues) returns double precision
language sql immutable set search_path = '' as $$ select coalesce(v.lng, v.city_lng) $$;

create table public.shows (
  id                  uuid primary key default gen_random_uuid(),
  setlistfm_id        text unique,
  setlistfm_version   text,
  setlistfm_url       text,
  artist_id           uuid not null references public.artists (id) on delete restrict,
  venue_id            uuid not null references public.venues (id) on delete restrict,
  event_date          date not null,
  tour_name           text,
  info                text,
  is_festival         boolean not null default false,
  source              public.data_source not null default 'setlistfm',
  created_by          uuid references auth.users (id) on delete set null,
  setlist_synced_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index shows_artist_date on public.shows (artist_id, event_date desc);
create index shows_venue_date on public.shows (venue_id, event_date desc);
create index shows_created_by on public.shows (created_by) where created_by is not null;
create trigger shows_updated_at before update on public.shows
  for each row execute function public.set_updated_at();

create table public.setlist_songs (
  id            uuid primary key default gen_random_uuid(),
  show_id       uuid not null references public.shows (id) on delete cascade,
  set_index     int not null check (set_index >= 0),
  set_name      text not null default 'Set',
  is_encore     boolean not null default false,
  position      int not null check (position >= 1),   -- 1-based order across the whole show
  name          text not null check (char_length(name) between 1 and 300),
  song_key      text generated always as (public.song_key(name)) stored,
  info          text,
  is_cover      boolean not null default false,
  cover_artist  text,
  is_tape       boolean not null default false,
  unique (show_id, position)
);
create index setlist_songs_key on public.setlist_songs (song_key);

-- Short-lived cache of setlist.fm API responses to stay under the rate limit.
create table public.api_cache (
  key         text primary key,
  body        jsonb not null,
  fetched_at  timestamptz not null default now()
);

alter table public.artists enable row level security;
alter table public.venues enable row level security;
alter table public.shows enable row level security;
alter table public.setlist_songs enable row level security;
alter table public.api_cache enable row level security;  -- no policies: service role only
