-- Upcoming shows: find concerts on SeatGeek, mark yourself going / interested /
-- can't go, and invite friends.
--
--   upcoming_events  SeatGeek events someone has opened or planned. Public
--                    listing data, written only by the "seatgeek" edge function.
--   event_plans      One row per person per event. 'invited' means a friend
--                    invited you and you haven't answered yet.
--
-- Who sees a plan: you see your own; friends see your going/interested plans;
-- the friend who invited you also sees your pending invite and a "can't go".
-- Everything is read through the functions below (the table is owner-only).

create table public.upcoming_events (
  id             uuid primary key default gen_random_uuid(),
  seatgeek_id    bigint not null unique,
  title          text not null,
  artist         text not null,
  performers     text[] not null default '{}',
  image_url      text,
  venue_name     text not null,
  city           text,
  state          text,
  country_code   text,
  lat            double precision,
  lng            double precision,
  starts_at      timestamptz,             -- UTC; null when the date isn't set yet
  local_date     date not null,
  local_time     time,                    -- null when the time isn't set yet
  date_tbd       boolean not null default false,
  timezone       text,
  ticket_url     text,
  lowest_price   numeric(10, 2),
  listing_count  int,
  status         text not null default 'normal',
  fetched_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index upcoming_events_date on public.upcoming_events (local_date);

alter table public.upcoming_events enable row level security;
create policy "upcoming_events: signed-in users read" on public.upcoming_events
  for select to authenticated using (true);

create type public.plan_status as enum ('going', 'interested', 'cant', 'invited');

create table public.event_plans (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.upcoming_events (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  status         public.plan_status not null,
  invited_by     uuid references auth.users (id) on delete set null,
  note           text check (char_length(note) <= 280),
  log_nudged_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_plans_user on public.event_plans (user_id);
create index event_plans_invited_by on public.event_plans (invited_by);

create trigger event_plans_updated_at before update on public.event_plans
  for each row execute function public.set_updated_at();

alter table public.event_plans enable row level security;
create policy "event_plans: owner reads" on public.event_plans
  for select to authenticated using (user_id = (select auth.uid()));
-- No write policies: plans change through the seatgeek edge function and invite_to_event().

-- ---------------------------------------------------------------- helpers

create or replace function public._is_friend(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

/** May p_viewer see p_owner's plan? */
create or replace function public._plan_visible(p_viewer uuid, p_owner uuid, p_status public.plan_status, p_invited_by uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_viewer is not null and (
    p_owner = p_viewer
    or ((p_status in ('going', 'interested') or p_invited_by = p_viewer) and public._is_friend(p_viewer, p_owner))
  );
$$;

/** One event as the app sees it: the event, your plan, and the friends you may see. */
create or replace function public._plan_item(p_viewer uuid, p_event uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'event', to_jsonb(e) - 'fetched_at' - 'created_at',
    'status', mine.status,
    'note', mine.note,
    'invited_by', case when ib.id is not null then jsonb_build_object(
      'id', ib.id, 'handle', ib.handle::text, 'display_name', ib.display_name, 'avatar_path', ib.avatar_path) end,
    'crew', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.user_id, 'handle', pr.handle::text, 'display_name', pr.display_name,
               'avatar_path', pr.avatar_path, 'status', p.status, 'invited_by_me', p.invited_by = p_viewer)
             order by case p.status when 'going' then 0 when 'interested' then 1 when 'invited' then 2 else 3 end, pr.handle)
        from public.event_plans p
        join public.profiles pr on pr.id = p.user_id
       where p.event_id = e.id and p.user_id <> p_viewer
         and public._plan_visible(p_viewer, p.user_id, p.status, p.invited_by)
    ), '[]'::jsonb)
  )
  from public.upcoming_events e
  left join public.event_plans mine on mine.event_id = e.id and mine.user_id = p_viewer
  left join public.profiles ib on ib.id = mine.invited_by
  where e.id = p_event;
$$;

/** _plan_item for SeatGeek ids (search results). Events nobody has opened yet are left out. */
create or replace function public._plan_items_by_seatgeek(p_viewer uuid, p_ids bigint[])
returns table (seatgeek_id bigint, item jsonb)
language sql stable security definer set search_path = ''
as $$
  select e.seatgeek_id, public._plan_item(p_viewer, e.id)
    from public.upcoming_events e
   where e.seatgeek_id = any (p_ids);
$$;

/** How many of your logged shows each artist name (case-insensitive) played. */
create or replace function public._artist_seen_counts(p_user uuid, p_names text[])
returns table (name text, shows int)
language sql stable security definer set search_path = ''
as $$
  select lower(ar.name), count(distinct a.show_id)::int
    from public.attendances a
    join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id
   where a.user_id = p_user
     and lower(ar.name) = any (select lower(x) from unnest(p_names) x)
   group by 1;
$$;

/** Your most-seen artists, for the "Artists you've seen" filter. */
create or replace function public._top_artist_names(p_user uuid, p_limit int)
returns setof text
language sql stable security definer set search_path = ''
as $$
  select ar.name
    from public.attendances a
    join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id
   where a.user_id = p_user
   group by ar.name
   order by count(*) desc, ar.name
   limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function
  public._is_friend(uuid, uuid),
  public._plan_visible(uuid, uuid, public.plan_status, uuid),
  public._plan_item(uuid, uuid),
  public._plan_items_by_seatgeek(uuid, bigint[]),
  public._artist_seen_counts(uuid, text[]),
  public._top_artist_names(uuid, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- app API

/** Your plans and pending invites from yesterday on (not "can't go"), soonest first. */
create or replace function public.my_plans()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(public._plan_item((select auth.uid()), e.id) order by e.local_date, e.starts_at), '[]'::jsonb)
    from public.event_plans p
    join public.upcoming_events e on e.id = p.event_id
   where p.user_id = (select auth.uid())
     and p.status <> 'cant'
     and e.local_date >= current_date - 1;
$$;

/** One event's plan and crew, by its Stubstash id. */
create or replace function public.event_plan(p_event uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select public._plan_item((select auth.uid()), p_event) where (select auth.uid()) is not null;
$$;

/** Upcoming shows friends are going to or interested in, soonest first. */
create or replace function public.friends_going_events(p_limit int default 50)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(public._plan_item((select auth.uid()), x.id) order by x.local_date, x.starts_at), '[]'::jsonb)
    from (
      select e.id, e.local_date, e.starts_at
        from public.upcoming_events e
       where e.local_date >= current_date
         and exists (
           select 1 from public.event_plans p
            where p.event_id = e.id and p.user_id <> (select auth.uid())
              and p.status in ('going', 'interested')
              and public._is_friend((select auth.uid()), p.user_id)
         )
       order by e.local_date, e.starts_at
       limit least(greatest(p_limit, 1), 100)
    ) x;
$$;

/**
 * Invites friends to an event you're going to or interested in. People who
 * already have a plan for it are skipped. Returns how many were invited.
 */
create or replace function public.invite_to_event(p_event uuid, p_users uuid[], p_note text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  u uuid;
  k int;
  n int := 0;
  clean_note text := nullif(btrim(left(coalesce(p_note, ''), 280)), '');
begin
  if me is null then raise exception 'Please sign in.'; end if;
  if coalesce(array_length(p_users, 1), 0) > 50 then raise exception 'Invite up to 50 people at a time.'; end if;
  if not exists (select 1 from public.upcoming_events e where e.id = p_event and e.local_date >= current_date) then
    raise exception 'That show has already happened.';
  end if;
  if not exists (select 1 from public.event_plans p
                  where p.event_id = p_event and p.user_id = me and p.status in ('going', 'interested')) then
    raise exception 'Mark yourself going or interested first.';
  end if;

  foreach u in array coalesce(p_users, '{}') loop
    continue when u = me or not public._is_friend(me, u);
    insert into public.event_plans (event_id, user_id, status, invited_by, note)
    values (p_event, u, 'invited', me, clean_note)
    on conflict (event_id, user_id) do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;

revoke execute on function public.my_plans(), public.event_plan(uuid), public.friends_going_events(int),
  public.invite_to_event(uuid, uuid[], text) from public, anon;

-- ---------------------------------------------------------------- notifications

create or replace function public._on_event_plan_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.upcoming_events;
  when_txt text;
  link text;
  replied_to uuid;
  f record;
begin
  select * into ev from public.upcoming_events where id = new.event_id;
  when_txt := to_char(ev.local_date, 'Dy, Mon FMDD') || ' · ' || ev.venue_name;
  link := '/app/upcoming/' || ev.seatgeek_id;

  -- A friend invited you.
  if tg_op = 'INSERT' and new.status = 'invited' then
    perform public._notify(new.user_id, 'event_invite', new.invited_by,
      public._display_name(new.invited_by) || ' invited you to ' || ev.artist,
      coalesce('"' || new.note || '" · ', '') || when_txt, link);
    return new;
  end if;

  -- You answered an invite: tell the friend who sent it.
  if tg_op = 'UPDATE' and old.status = 'invited' and new.status <> 'invited' and new.invited_by is not null then
    replied_to := new.invited_by;
    perform public._notify(new.invited_by, 'event_reply', new.user_id,
      public._display_name(new.user_id) || case new.status
        when 'going' then ' is in for '
        when 'interested' then ' might come to '
        else ' can''t make ' end || ev.artist,
      when_txt, link);
  end if;

  -- You're going: tell friends who are going or interested (not the one you just replied to).
  if new.status = 'going' and (tg_op = 'INSERT' or old.status is distinct from 'going') then
    for f in
      select p.user_id from public.event_plans p
       where p.event_id = new.event_id and p.user_id <> new.user_id
         and p.status in ('going', 'interested')
         and p.user_id is distinct from replied_to
         and public._is_friend(p.user_id, new.user_id)
    loop
      perform public._notify(f.user_id, 'friend_going', new.user_id,
        public._display_name(new.user_id) || ' is going to ' || ev.artist || ' too',
        when_txt, link, 'friend_going:' || ev.id, '{n} friends are going to ' || ev.artist);
    end loop;
  end if;
  return new;
end;
$$;

create trigger event_plans_notify after insert or update of status on public.event_plans
  for each row execute function public._on_event_plan_change();

-- Morning after a show you were going to (10am your time): log it, unless you already have.
create or replace function public.queue_plan_log_nudges()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.id, p.user_id, e.artist, e.venue_name, e.seatgeek_id
      from public.event_plans p
      join public.upcoming_events e on e.id = p.event_id
      join public.profiles pr on pr.id = p.user_id
     where p.status = 'going' and p.log_nudged_at is null
       and e.status <> 'cancelled' and not e.date_tbd
       and extract(hour from now() at time zone pr.timezone) = 10
       and e.local_date = (now() at time zone pr.timezone)::date - 1
       and not exists (
         select 1 from public.attendances a
           join public.shows s on s.id = a.show_id
           join public.artists ar on ar.id = s.artist_id
          where a.user_id = p.user_id and s.event_date = e.local_date and lower(ar.name) = lower(e.artist)
       )
  loop
    perform public._notify(r.user_id, 'log_plan', null, 'How was ' || r.artist || '?',
      'Log last night at ' || r.venue_name || ' with the real setlist.', '/app/upcoming/' || r.seatgeek_id || '?log=1');
    update public.event_plans set log_nudged_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.queue_plan_log_nudges() from public, anon, authenticated;

select cron.schedule('plan-log-nudges', '20 * * * *', $$ select public.queue_plan_log_nudges() $$);
-- Old events (and their plans) aren't needed once they're well past.
select cron.schedule('prune-upcoming-events', '50 4 * * *',
  $$ delete from public.upcoming_events where local_date < current_date - 60 $$);
