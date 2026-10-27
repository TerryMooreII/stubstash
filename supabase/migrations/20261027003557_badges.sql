-- Badges are defined in a table (so copy/colors can change without code)
-- and earned status is computed live from the user's log.

create table public.badge_definitions (
  key          text primary key,
  name         text not null,
  description  text not null,
  color        text not null,           -- design token name, e.g. 'yellow', 'teal'
  target       int not null check (target > 0),
  sort_order   int not null default 0
);
alter table public.badge_definitions enable row level security;
create policy "badges: readable" on public.badge_definitions for select to anon, authenticated using (true);

insert into public.badge_definitions (key, name, description, color, target, sort_order) values
  ('venue_regular',   'Venue Regular',     '5 shows at the same venue',              'orange', 5,    10),
  ('superfan',        'Superfan',          'See one artist 10 times',                'yellow', 10,   20),
  ('passport',        'Passport Stamped',  'A show outside your home country',       'teal',   1,    30),
  ('coast_to_coast',  'Coast to Coast',    'Shows on both US coasts in one year',    'slate',  1,    40),
  ('thousand_club',   'Thousand Club',     'Hear 1,000 songs live',                  'mint',   1000, 50),
  ('double_header',   'Double Header',     'Two shows in one day',                   'teal',   1,    60),
  ('century_club',    'Century Club',      '100 shows',                              'yellow', 100,  70),
  ('festival_rat',    'Festival Rat',      '10 festivals',                           'gold',   10,   80),
  ('road_warrior',    'Road Warrior',      'Travel 10,000 miles to shows',           'orange', 10000,90),
  ('first_timer',     'Fresh Ears',        'Hear 500 songs for the first time',      'mint',   500,  100);

create or replace function public.user_badges(p_user uuid default null)
returns table (key text, name text, description text, color text, target int,
               progress int, earned boolean, sort_order int)
language sql stable security definer set search_path = ''
as $$
  with target as (select coalesce(p_user, (select auth.uid())) as uid),
  prof as (select p.* from public.profiles p, target where p.id = target.uid),
  log as (select l.* from target, public.user_log(target.uid) l),
  songs as (select us.* from target, public._user_songs(target.uid) us where public.can_view_user(target.uid)),
  vals as (
    select 'venue_regular' k, coalesce((select max(n) from (select count(*) n from log group by venue_id) x), 0)::int v
    union all select 'superfan', coalesce((select max(n) from (select count(*) n from log group by artist_id) x), 0)::int
    union all select 'passport', (select count(*) from log, prof
                                   where prof.home_country_code is not null and log.country_code is not null
                                     and log.country_code <> prof.home_country_code)::int
    union all select 'coast_to_coast', (select count(*) from (
                     select extract(year from event_date) from log where country_code = 'US'
                      group by 1 having bool_or(lng < -114) and bool_or(lng > -82)) x)::int
    union all select 'thousand_club', (select count(*) from songs)::int
    union all select 'double_header', (select count(*) from (select event_date from log group by 1 having count(*) > 1) x)::int
    union all select 'century_club', (select count(*) from log)::int
    union all select 'festival_rat', (select count(*) from log where is_festival)::int
    union all select 'road_warrior', (select coalesce(round(sum(2 * public.distance_miles(prof.home_lat, prof.home_lng, log.lat, log.lng))), 0) from log, prof)::int
    union all select 'first_timer', (select count(*) from songs where hear_index = 1)::int
  )
  select b.key, b.name, b.description, b.color, b.target,
         least(vals.v, b.target), vals.v >= b.target, b.sort_order
    from public.badge_definitions b
    join vals on vals.k = b.key
   where exists (select 1 from target where public.can_view_user(target.uid))
   order by (vals.v >= b.target) desc, b.sort_order;
$$;
