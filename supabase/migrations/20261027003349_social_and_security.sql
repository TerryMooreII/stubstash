-- Friendships, show invites, visibility helpers and row level security policies.
--
-- Visibility rules:
--   * Your own data: always visible to you.
--   * Another user's log: visible if their profile is public or you are friends.
--   * setlist.fm catalog rows: visible to everyone.
--   * Manual shows/artists/venues: visible to the creator and anyone who can see
--     an attendance of that show.
--   * Profile rows are only selectable by their owner. Everyone else goes through
--     the safe RPCs (public_profile, search_people) so home coordinates stay private.

create type public.friendship_status as enum ('pending', 'accepted', 'declined');

create table public.friendships (
  requester_id  uuid not null references auth.users (id) on delete cascade,
  addressee_id  uuid not null references auth.users (id) on delete cascade,
  status        public.friendship_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- Only one row per pair, whichever direction it was sent.
create unique index friendships_pair on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee on public.friendships (addressee_id, status);

-- Invite created when you tag a companion who isn't on Stubstash yet.
create table public.show_invites (
  id             uuid primary key default gen_random_uuid(),
  token          text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  inviter_id     uuid not null references auth.users (id) on delete cascade,
  attendance_id  uuid not null references public.attendances (id) on delete cascade,
  companion_id   uuid references public.attendance_companions (id) on delete set null,
  claimed_by     uuid references auth.users (id) on delete set null,
  claimed_at     timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.friendships enable row level security;
alter table public.show_invites enable row level security;

---------------------------------------------------------------------------
-- Helpers (security definer so they can be used inside policies without
-- recursing through RLS).
---------------------------------------------------------------------------

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

create or replace function public.can_view_user(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select target = (select auth.uid())
      or exists (select 1 from public.profiles p where p.id = target and p.is_public)
      or ((select auth.uid()) is not null and public.are_friends((select auth.uid()), target));
$$;

create or replace function public.can_view_show(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.shows s
    where s.id = target
      and (s.source = 'setlistfm'
           or s.created_by = (select auth.uid())
           or exists (select 1 from public.attendances a
                      where a.show_id = s.id and public.can_view_user(a.user_id)))
  );
$$;

create or replace function public.can_view_artist(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.artists ar
    where ar.id = target
      and (ar.source = 'setlistfm'
           or ar.created_by = (select auth.uid())
           or exists (select 1 from public.shows s where s.artist_id = ar.id and public.can_view_show(s.id)))
  );
$$;

create or replace function public.can_view_venue(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.venues v
    where v.id = target
      and (v.source = 'setlistfm'
           or v.created_by = (select auth.uid())
           or exists (select 1 from public.shows s where s.venue_id = v.id and public.can_view_show(s.id)))
  );
$$;

---------------------------------------------------------------------------
-- Policies
---------------------------------------------------------------------------

-- profiles: owner only (others use RPCs below)
create policy "profiles: owner reads" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner updates" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- catalog: read-only for clients
create policy "artists: visible" on public.artists
  for select to anon, authenticated using (public.can_view_artist(id));
create policy "venues: visible" on public.venues
  for select to anon, authenticated using (public.can_view_venue(id));
create policy "shows: visible" on public.shows
  for select to anon, authenticated using (public.can_view_show(id));
create policy "setlist_songs: visible" on public.setlist_songs
  for select to anon, authenticated using (public.can_view_show(show_id));

-- attendances
create policy "attendances: visible" on public.attendances
  for select to anon, authenticated using (public.can_view_user(user_id));
create policy "attendances: owner inserts" on public.attendances
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_show(show_id));
create policy "attendances: owner updates" on public.attendances
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "attendances: owner deletes" on public.attendances
  for delete to authenticated using (user_id = (select auth.uid()));

-- companions
create policy "companions: visible" on public.attendance_companions
  for select to anon, authenticated using (
    companion_user_id = (select auth.uid())
    or exists (select 1 from public.attendances a
               where a.id = attendance_id and public.can_view_user(a.user_id)));
create policy "companions: owner writes" on public.attendance_companions
  for all to authenticated
  using (exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())));

-- photos
create policy "photos: visible" on public.attendance_photos
  for select to anon, authenticated using (public.can_view_user(user_id));
create policy "photos: owner inserts" on public.attendance_photos
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())));
create policy "photos: owner deletes" on public.attendance_photos
  for delete to authenticated using (user_id = (select auth.uid()));

-- venue pin fixes
create policy "venue pins: owner" on public.user_venue_pins
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- friendships
create policy "friendships: parties read" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "friendships: request" on public.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
create policy "friendships: addressee responds" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()) and status in ('accepted', 'declined'));
create policy "friendships: either removes" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- show invites
create policy "invites: inviter manages" on public.show_invites
  for all to authenticated
  using (inviter_id = (select auth.uid())) with check (inviter_id = (select auth.uid()));

---------------------------------------------------------------------------
-- Social RPCs
---------------------------------------------------------------------------

-- Safe public view of a profile. Returns null fields for things the caller can't see.
create or replace function public.public_profile(p_handle text)
returns table (
  id uuid, handle text, display_name text, avatar_path text, home_city text,
  is_public boolean, can_view boolean, is_self boolean, friendship text, show_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.handle::text, p.display_name, p.avatar_path,
         case when public.can_view_user(p.id) then p.home_city end,
         p.is_public,
         public.can_view_user(p.id),
         p.id = (select auth.uid()),
         (select case
                   when f.status = 'accepted' then 'friends'
                   when f.status = 'pending' and f.requester_id = (select auth.uid()) then 'sent'
                   when f.status = 'pending' then 'received'
                   else null end
            from public.friendships f
           where (f.requester_id = p.id and f.addressee_id = (select auth.uid()))
              or (f.addressee_id = p.id and f.requester_id = (select auth.uid()))),
         case when public.can_view_user(p.id)
              then (select count(*) from public.attendances a where a.user_id = p.id) end
    from public.profiles p
   where p.handle = p_handle::extensions.citext;
$$;

create or replace function public.search_people(q text)
returns table (id uuid, handle text, display_name text, avatar_path text, is_public boolean,
               friendship text, show_count bigint)
language sql stable security definer set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  term as (select lower(regexp_replace(trim(q), '^@', '')) as t)
  select p.id, p.handle::text, p.display_name, p.avatar_path, p.is_public,
         (select case
                   when f.status = 'accepted' then 'friends'
                   when f.status = 'pending' and f.requester_id = me.uid then 'sent'
                   when f.status = 'pending' then 'received' end
            from public.friendships f
           where (f.requester_id = p.id and f.addressee_id = me.uid)
              or (f.addressee_id = p.id and f.requester_id = me.uid)),
         case when public.can_view_user(p.id)
              then (select count(*) from public.attendances a where a.user_id = p.id) end
    from public.profiles p, me, term
   where me.uid is not null
     and p.id <> me.uid
     and char_length(term.t) >= 2
     and (lower(p.handle::text) like term.t || '%' or lower(p.display_name) like '%' || term.t || '%')
   order by (lower(p.handle::text) = term.t) desc, p.handle
   limit 20;
$$;

-- Sends (or accepts, if they already asked you) a friend request by handle.
create or replace function public.send_friend_request(p_handle text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  them uuid;
  existing public.friendships;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into them from public.profiles where handle = regexp_replace(p_handle, '^@', '')::extensions.citext;
  if them is null then raise exception 'no user with that handle'; end if;
  if them = me then raise exception 'that''s you'; end if;

  select * into existing from public.friendships
   where (requester_id = me and addressee_id = them) or (requester_id = them and addressee_id = me);

  if existing is null then
    insert into public.friendships (requester_id, addressee_id) values (me, them);
    return 'sent';
  elsif existing.status = 'accepted' then
    return 'friends';
  elsif existing.requester_id = them and existing.status = 'pending' then
    update public.friendships set status = 'accepted', responded_at = now()
     where requester_id = them and addressee_id = me;
    return 'friends';
  elsif existing.requester_id = them and existing.status = 'declined' then
    -- They were declined by us earlier; flip it into a fresh request from us.
    delete from public.friendships where requester_id = them and addressee_id = me;
    insert into public.friendships (requester_id, addressee_id) values (me, them);
    return 'sent';
  else
    return 'sent';
  end if;
end;
$$;

-- Accepted friends plus head-to-head numbers.
create or replace function public.my_friends()
returns table (id uuid, handle text, display_name text, avatar_path text,
               show_count bigint, shared_count bigint, since timestamptz)
language sql stable security definer set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  fr as (
    select case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as fid,
           coalesce(f.responded_at, f.created_at) as since
      from public.friendships f, me
     where f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  )
  select p.id, p.handle::text, p.display_name, p.avatar_path,
         (select count(*) from public.attendances a where a.user_id = p.id),
         (select count(*) from public.attendances a
            join public.attendances b on b.show_id = a.show_id and b.user_id = (select uid from me)
           where a.user_id = p.id),
         fr.since
    from fr join public.profiles p on p.id = fr.fid
   order by 6 desc, p.handle;
$$;

create or replace function public.incoming_friend_requests()
returns table (requester_id uuid, handle text, display_name text, avatar_path text,
               created_at timestamptz, shared_example text)
language sql stable security definer set search_path = ''
as $$
  select f.requester_id, p.handle::text, p.display_name, p.avatar_path, f.created_at,
         (select ar.name || ' · ' || v.name || ' · ' || to_char(s.event_date, 'Mon FMDD')
            from public.attendances a
            join public.attendances b on b.show_id = a.show_id and b.user_id = f.requester_id
            join public.shows s on s.id = a.show_id
            join public.artists ar on ar.id = s.artist_id
            join public.venues v on v.id = s.venue_id
           where a.user_id = (select auth.uid())
           order by s.event_date desc limit 1)
    from public.friendships f
    join public.profiles p on p.id = f.requester_id
   where f.addressee_id = (select auth.uid()) and f.status = 'pending'
   order by f.created_at desc;
$$;

-- Public profiles (not yet friends) who logged the same shows as you.
create or replace function public.suggested_people()
returns table (id uuid, handle text, display_name text, avatar_path text,
               shared_count bigint, example text)
language sql stable security definer set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  overlap as (
    select b.user_id, count(*) as n, max(s.event_date) as last_date
      from public.attendances a
      join public.attendances b on b.show_id = a.show_id and b.user_id <> a.user_id
      join public.shows s on s.id = a.show_id
      join me on a.user_id = me.uid
     group by b.user_id
  )
  select p.id, p.handle::text, p.display_name, p.avatar_path, o.n,
         (select ar.name || ', ' || v.name || ' ' || to_char(s.event_date, 'Mon FMDD')
            from public.attendances a
            join public.attendances b on b.show_id = a.show_id and b.user_id = p.id
            join public.shows s on s.id = a.show_id
            join public.artists ar on ar.id = s.artist_id
            join public.venues v on v.id = s.venue_id
           where a.user_id = (select uid from me)
           order by s.event_date desc limit 1)
    from overlap o
    join public.profiles p on p.id = o.user_id
   where p.is_public
     and not exists (select 1 from public.friendships f
                      where (f.requester_id = p.id and f.addressee_id = (select uid from me))
                         or (f.addressee_id = p.id and f.requester_id = (select uid from me)))
   order by o.n desc, o.last_date desc
   limit 10;
$$;

-- Claims a show invite: adds the show to the new user's log, links the
-- companion tag, and makes the two of you friends.
create or replace function public.claim_show_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.show_invites;
  v_show uuid;
  v_att uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into inv from public.show_invites where token = p_token for update;
  if inv is null then raise exception 'invite not found'; end if;
  if inv.claimed_by is not null and inv.claimed_by <> me then raise exception 'invite already used'; end if;
  if inv.inviter_id = me then raise exception 'that''s your own invite'; end if;

  select show_id into v_show from public.attendances where id = inv.attendance_id;

  insert into public.attendances (user_id, show_id) values (me, v_show)
  on conflict (user_id, show_id) do update set updated_at = now()
  returning id into v_att;

  update public.attendance_companions set companion_user_id = me where id = inv.companion_id;
  update public.show_invites set claimed_by = me, claimed_at = now() where id = inv.id;

  insert into public.friendships (requester_id, addressee_id, status, responded_at)
  values (inv.inviter_id, me, 'accepted', now())
  on conflict do nothing;
  update public.friendships set status = 'accepted', responded_at = now()
   where status <> 'accepted'
     and ((requester_id = inv.inviter_id and addressee_id = me) or (requester_id = me and addressee_id = inv.inviter_id));

  return v_att;
end;
$$;

-- Lets someone opening an invite link see what show it is before signing up.
create or replace function public.peek_show_invite(p_token text)
returns table (inviter_handle text, inviter_name text, artist text, venue text, city text, event_date date, claimed boolean)
language sql stable security definer set search_path = ''
as $$
  select p.handle::text, p.display_name, ar.name, v.name, v.city, s.event_date, i.claimed_by is not null
    from public.show_invites i
    join public.profiles p on p.id = i.inviter_id
    join public.attendances a on a.id = i.attendance_id
    join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id
    join public.venues v on v.id = s.venue_id
   where i.token = p_token;
$$;

-- Lock down helper execution: clients call RPCs, not internals.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.claim_show_invite(text) from public, anon;
revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.my_friends() from public, anon;
revoke execute on function public.incoming_friend_requests() from public, anon;
revoke execute on function public.suggested_people() from public, anon;
revoke execute on function public.search_people(text) from public, anon;
