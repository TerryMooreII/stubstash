-- In-app notifications + web push for social events, badges and the
-- morning-after rating nudge. Each kind can be switched on/off per channel
-- (in-app, push) in profiles.notification_prefs:
--   { "friend_show": { "inapp": true, "push": false }, ... }   (missing = on)
--
-- Events are created by triggers (friend requests, logged shows, companions,
-- invites) and by cron (badges, rating nudges). Push is sent by the "push"
-- edge function ({ action: "deliver", id }), called through pg_net.

create type public.notification_kind as enum (
  'friend_request',   -- someone sent you a friend request
  'friend_accepted',  -- someone accepted yours
  'friend_show',      -- a friend logged a recent show (grouped)
  'same_show',        -- a friend logged a show you also logged (grouped)
  'tagged',           -- a friend said you went with them
  'invite_claimed',   -- someone claimed your "you were there" invite
  'badge_earned',
  'rate_show'         -- morning-after "rate last night"
);

alter table public.profiles add column notification_prefs jsonb not null default '{}'::jsonb
  check (jsonb_typeof(notification_prefs) = 'object');

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        public.notification_kind not null,
  actor_id    uuid references auth.users (id) on delete cascade,
  title       text not null,
  body        text,
  url         text,
  group_key   text,
  count       int not null default 1,
  in_app      boolean not null default true,   -- false: push-only (in-app switched off)
  read_at     timestamptz,
  pushed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index notifications_feed on public.notifications (user_id, updated_at desc) where in_app;
create index notifications_group on public.notifications (user_id, group_key) where read_at is null;
create index notifications_actor on public.notifications (actor_id);

alter table public.notifications enable row level security;
create policy "notifications: owner reads" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()) and in_app);
create policy "notifications: owner deletes" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- Live updates for the bell (Realtime respects the select policy above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------- core

create or replace function public.notify_enabled(p_user uuid, p_kind public.notification_kind, p_channel text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select (p.notification_prefs -> p_kind::text ->> p_channel)::boolean
                     from public.profiles p where p.id = p_user), true);
$$;

/**
 * Creates (or groups into) a notification and queues a push.
 * Never notifies you about your own action (recipient = actor or = the signed-in caller).
 * With p_group: an unread notification with the same key from the last 12 hours is
 * bumped instead (count + 1, title from p_title_many with {n} = count); no extra push.
 */
create or replace function public._notify(
  p_user uuid, p_kind public.notification_kind, p_actor uuid,
  p_title text, p_body text, p_url text,
  p_group text default null, p_title_many text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  want_app boolean;
  want_push boolean;
  bumped uuid;
  new_id uuid;
begin
  if p_user is null or p_user = p_actor or p_user = (select auth.uid()) then return; end if;
  want_app := public.notify_enabled(p_user, p_kind, 'inapp');
  want_push := public.notify_enabled(p_user, p_kind, 'push')
               and exists (select 1 from public.push_subscriptions s where s.user_id = p_user);
  if not want_app and not want_push then return; end if;

  if p_group is not null then
    update public.notifications n set
      count = n.count + 1,
      title = coalesce(replace(p_title_many, '{n}', (n.count + 1)::text), p_title),
      body = p_body,
      updated_at = now()
     where n.user_id = p_user and n.group_key = p_group and n.read_at is null
       and n.created_at > now() - interval '12 hours'
    returning n.id into bumped;
    if bumped is not null then return; end if;
  end if;

  insert into public.notifications (user_id, kind, actor_id, title, body, url, group_key, in_app)
  values (p_user, p_kind, p_actor, p_title, p_body, p_url, p_group, want_app)
  returning id into new_id;

  if want_push then
    perform public._call_edge_function('push', jsonb_build_object('action', 'deliver', 'id', new_id));
  end if;
end;
$$;

create or replace function public._display_name(p_user uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(p.display_name, ''), '@' || p.handle::text, 'Someone') from public.profiles p where p.id = p_user;
$$;

-- ---------------------------------------------------------------- triggers

create or replace function public._on_friendship_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public._notify(new.addressee_id, 'friend_request', new.requester_id,
      public._display_name(new.requester_id) || ' wants to be friends', 'Compare shows and see each other''s logs.',
      '/app/friends');
  elsif new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    -- Tell the person who asked. (Invite claims insert an accepted row; that has its own notification.)
    if tg_op = 'UPDATE' then
      perform public._notify(new.requester_id, 'friend_accepted', new.addressee_id,
        public._display_name(new.addressee_id) || ' accepted your friend request', 'Go see how your shows stack up.',
        '/u/' || (select p.handle::text from public.profiles p where p.id = new.addressee_id));
    end if;
  end if;
  return new;
end;
$$;
create trigger friendships_notify after insert or update of status on public.friendships
  for each row execute function public._on_friendship_change();

create or replace function public._on_attendance_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  me_name text := public._display_name(new.user_id);
  me_handle text := (select p.handle::text from public.profiles p where p.id = new.user_id);
  sh record;
  f record;
  their_att uuid;
begin
  select s.event_date, ar.name artist, v.name venue
    into sh
    from public.shows s join public.artists ar on ar.id = s.artist_id join public.venues v on v.id = s.venue_id
   where s.id = new.show_id;

  for f in
    select case when fr.requester_id = new.user_id then fr.addressee_id else fr.requester_id end as id
      from public.friendships fr
     where fr.status = 'accepted' and (fr.requester_id = new.user_id or fr.addressee_id = new.user_id)
  loop
    select a.id into their_att from public.attendances a where a.user_id = f.id and a.show_id = new.show_id;
    if their_att is not null then
      perform public._notify(f.id, 'same_show', new.user_id,
        me_name || ' was at ' || sh.artist || ' too',
        sh.venue || ' · ' || to_char(sh.event_date, 'Mon FMDD, YYYY'),
        '/app/shows/' || their_att,
        'same_show:' || new.user_id, me_name || ' was at {n} of your shows too');
    elsif sh.event_date >= current_date - 14 then
      perform public._notify(f.id, 'friend_show', new.user_id,
        me_name || ' saw ' || sh.artist,
        sh.venue || ' · ' || to_char(sh.event_date, 'Mon FMDD'),
        '/u/' || me_handle || '/shows/' || new.id,
        'friend_show:' || new.user_id, me_name || ' logged {n} shows');
    end if;
  end loop;
  return new;
end;
$$;
create trigger attendances_notify after insert on public.attendances
  for each row execute function public._on_attendance_insert();

-- Grouped "friend_show" notifications point at one show; once grouped, send them to the profile.
create or replace function public._on_notification_grouped()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.count > 1 and new.kind = 'friend_show' then
    new.url := '/u/' || (select p.handle::text from public.profiles p where p.id = new.actor_id);
  elsif new.count > 1 and new.kind = 'same_show' then
    new.url := '/u/' || (select p.handle::text from public.profiles p where p.id = new.actor_id);
  end if;
  return new;
end;
$$;
create trigger notifications_grouped before update of count on public.notifications
  for each row execute function public._on_notification_grouped();

create or replace function public._on_companion_tagged()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
  sh record;
  their_att uuid;
begin
  if new.companion_user_id is null or (tg_op = 'UPDATE' and old.companion_user_id is not distinct from new.companion_user_id) then
    return new;
  end if;
  select a.user_id into owner from public.attendances a where a.id = new.attendance_id;
  select s.id, s.event_date, ar.name artist, v.name venue into sh
    from public.attendances a join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id join public.venues v on v.id = s.venue_id
   where a.id = new.attendance_id;
  select a.id into their_att from public.attendances a where a.user_id = new.companion_user_id and a.show_id = sh.id;

  perform public._notify(new.companion_user_id, 'tagged', owner,
    public._display_name(owner) || ' says you went to ' || sh.artist || ' together',
    sh.venue || ' · ' || to_char(sh.event_date, 'Mon FMDD, YYYY') || case when their_att is null then ' · Add it to your log' else '' end,
    case when their_att is not null then '/app/shows/' || their_att
         else '/app/log?find=1&artist=' || replace(sh.artist, '&', '%26') || '&date=' || sh.event_date end);
  return new;
end;
$$;
create trigger companions_notify after insert or update of companion_user_id on public.attendance_companions
  for each row execute function public._on_companion_tagged();

create or replace function public._on_invite_claimed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  sh record;
begin
  if new.claimed_by is null or old.claimed_by is not distinct from new.claimed_by then return new; end if;
  select ar.name artist, v.name venue into sh
    from public.attendances a join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id join public.venues v on v.id = s.venue_id
   where a.id = new.attendance_id;
  -- They're now in the log for the same show; one notification is enough.
  delete from public.notifications n
   where n.user_id = new.inviter_id and n.actor_id = new.claimed_by and n.kind = 'same_show' and n.read_at is null
     and n.created_at > now() - interval '1 minute';
  perform public._notify(new.inviter_id, 'invite_claimed', new.claimed_by,
    public._display_name(new.claimed_by) || ' joined from your invite',
    'They''re in for ' || sh.artist || ' at ' || sh.venue || ', and you''re friends now.',
    '/u/' || (select p.handle::text from public.profiles p where p.id = new.claimed_by));
  return new;
end;
$$;
create trigger show_invites_notify after update of claimed_by on public.show_invites
  for each row execute function public._on_invite_claimed();

-- ---------------------------------------------------------------- badges

-- Badges already announced, so each one notifies once.
create table public.badge_awards (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null references public.badge_definitions (key) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.badge_awards enable row level security;

/** Earned badge keys for a user, computed as that user (user_badges checks who's asking). */
create or replace function public._earned_badges(p_user uuid)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  keys text[];
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select coalesce(array_agg(b.key), '{}') into keys from public.user_badges(p_user) b where b.earned;
  perform set_config('request.jwt.claims', '', true);
  return keys;
end;
$$;

-- Every 5 minutes: announce badges for people who logged something recently.
create or replace function public.check_new_badges()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  u uuid;
  k text;
  b public.badge_definitions;
  n int := 0;
begin
  for u in select distinct a.user_id from public.attendances a where a.updated_at > now() - interval '15 minutes' loop
    foreach k in array public._earned_badges(u) loop
      insert into public.badge_awards (user_id, key) values (u, k) on conflict do nothing;
      if found then
        select * into b from public.badge_definitions where key = k;
        perform public._notify(u, 'badge_earned', null, 'Badge unlocked: ' || b.name, b.description, '/app/me');
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end;
$$;

-- Badges people already have don't get announced.
do $$
declare u uuid; k text;
begin
  for u in select id from auth.users loop
    foreach k in array public._earned_badges(u) loop
      insert into public.badge_awards (user_id, key) values (u, k) on conflict do nothing;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------- rating nudge

-- Shows from "yesterday" (user's timezone) still unrated, for users whose local time is 10am.
create or replace function public.queue_rating_nudges()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select a.id, a.user_id, ar.name artist, v.name venue
      from public.attendances a
      join public.profiles p on p.id = a.user_id
      join public.shows s on s.id = a.show_id
      join public.artists ar on ar.id = s.artist_id
      join public.venues v on v.id = s.venue_id
     where a.rating is null and a.rating_nudged_at is null
       and extract(hour from now() at time zone p.timezone) = 10
       and s.event_date = (now() at time zone p.timezone)::date - 1
  loop
    perform public._notify(r.user_id, 'rate_show', null, 'How was ' || r.artist || '?',
      'Rate last night at ' || r.venue || ' while it''s fresh.', '/app/shows/' || r.id || '?rate=1');
    update public.attendances set rating_nudged_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

select cron.unschedule('rating-nudges');
select cron.schedule('rating-nudges', '15 * * * *', $$ select public.queue_rating_nudges() $$);
select cron.schedule('badge-check', '*/5 * * * *', $$ select public.check_new_badges() $$);
-- Keep 90 days of read notifications.
select cron.schedule('prune-notifications', '45 4 * * *',
  $$ delete from public.notifications where read_at is not null and read_at < now() - interval '90 days' $$);

-- ---------------------------------------------------------------- app API

create or replace function public.my_notifications(p_limit int default 30, p_before timestamptz default null)
returns table (
  id uuid, kind public.notification_kind, title text, body text, url text, count int,
  read_at timestamptz, created_at timestamptz, updated_at timestamptz,
  actor_handle text, actor_name text, actor_avatar text
)
language sql stable security definer set search_path = ''
as $$
  select n.id, n.kind, n.title, n.body, n.url, n.count, n.read_at, n.created_at, n.updated_at,
         p.handle::text, p.display_name, p.avatar_path
    from public.notifications n
    left join public.profiles p on p.id = n.actor_id
   where n.user_id = (select auth.uid()) and n.in_app
     and (p_before is null or n.updated_at < p_before)
   order by n.updated_at desc
   limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.unread_notifications()
returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.notifications
   where user_id = (select auth.uid()) and in_app and read_at is null;
$$;

/** Marks the given notifications read, or all of them when p_ids is null. */
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql security definer set search_path = ''
as $$
  update public.notifications set read_at = now()
   where user_id = (select auth.uid()) and read_at is null
     and (p_ids is null or id = any (p_ids));
$$;

revoke execute on function
  public._notify(uuid, public.notification_kind, uuid, text, text, text, text, text),
  public._display_name(uuid), public._earned_badges(uuid), public.check_new_badges(),
  public.queue_rating_nudges(), public.notify_enabled(uuid, public.notification_kind, text)
  from public, anon, authenticated;
revoke execute on function public.my_notifications(int, timestamptz), public.unread_notifications(),
  public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.my_notifications(int, timestamptz), public.unread_notifications(),
  public.mark_notifications_read(uuid[]) to authenticated;

-- Replaced by queue_rating_nudges().
drop function if exists public.due_rating_nudges();
