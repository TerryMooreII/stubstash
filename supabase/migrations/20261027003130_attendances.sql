-- A user's personal log: which shows they attended and what the night was like.

create table public.attendances (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  show_id          uuid not null references public.shows (id) on delete cascade,
  rating           numeric(2,1) check (rating >= 0.5 and rating <= 5 and (rating * 2) = floor(rating * 2)),
  seat             text check (char_length(seat) <= 80),
  price_cents      int check (price_cents >= 0),
  currency         text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  merch            text check (char_length(merch) <= 200),
  notes            text check (char_length(notes) <= 4000),
  is_festival      boolean,                 -- user override; null = use shows.is_festival
  stub_path        text,                    -- storage path in the "stubs" bucket
  rating_nudged_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, show_id)
);
create index attendances_show on public.attendances (show_id);
create trigger attendances_updated_at before update on public.attendances
  for each row execute function public.set_updated_at();

-- People who were there with you. Either a Stubstash user or just a name.
create table public.attendance_companions (
  id                 uuid primary key default gen_random_uuid(),
  attendance_id      uuid not null references public.attendances (id) on delete cascade,
  companion_user_id  uuid references auth.users (id) on delete set null,
  name               text not null check (char_length(name) between 1 and 60),
  created_at         timestamptz not null default now(),
  unique (attendance_id, companion_user_id)
);
create index attendance_companions_user on public.attendance_companions (companion_user_id);

create table public.attendance_photos (
  id             uuid primary key default gen_random_uuid(),
  attendance_id  uuid not null references public.attendances (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  storage_path   text not null unique,
  width          int,
  height         int,
  created_at     timestamptz not null default now()
);
create index attendance_photos_attendance on public.attendance_photos (attendance_id, created_at);

-- A user's own correction of where a venue is. Does not change the shared venue.
create table public.user_venue_pins (
  user_id     uuid not null references auth.users (id) on delete cascade,
  venue_id    uuid not null references public.venues (id) on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  updated_at  timestamptz not null default now(),
  primary key (user_id, venue_id)
);

alter table public.attendances enable row level security;
alter table public.attendance_companions enable row level security;
alter table public.attendance_photos enable row level security;
alter table public.user_venue_pins enable row level security;
