-- One profile per auth user. Created automatically on sign-up.

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  handle              extensions.citext not null unique
                        check (handle ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name        text not null default '' check (char_length(display_name) <= 60),
  avatar_path         text,
  home_city           text,
  home_lat            double precision check (home_lat between -90 and 90),
  home_lng            double precision check (home_lng between -180 and 180),
  home_country_code   text check (home_country_code ~ '^[A-Z]{2}$'),
  is_public           boolean not null default false,
  setlistfm_username  text,
  onboarded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index profiles_handle_trgm on public.profiles using gin ((handle::text) extensions.gin_trgm_ops);
create index profiles_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Builds a unique handle from sign-up metadata or the email address.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1), 'fan');
  base := left(regexp_replace(base, '[^A-Za-z0-9_]', '', 'g'), 20);
  if char_length(base) < 3 then
    base := base || 'fan';
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate::extensions.citext) loop
    n := n + 1;
    candidate := left(base, 20) || n::text;
  end loop;

  insert into public.profiles (id, handle, display_name)
  values (new.id, candidate, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
-- Policies are added in the social migration, once the friendship helpers exist.
