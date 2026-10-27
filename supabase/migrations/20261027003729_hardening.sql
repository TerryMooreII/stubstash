-- Fixes from the Supabase security/performance advisors.

-- are_friends() is callable over the API; only answer for pairs that include the caller
-- so it can't be used to map other people's friend lists.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) in (a, b)
     and exists (
       select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
     );
$$;

-- Covering indexes for foreign keys.
create index if not exists artists_created_by on public.artists (created_by);
create index if not exists venues_created_by on public.venues (created_by);
create index if not exists attendance_photos_user on public.attendance_photos (user_id);
create index if not exists show_invites_attendance on public.show_invites (attendance_id);
create index if not exists show_invites_claimed_by on public.show_invites (claimed_by);
create index if not exists show_invites_companion on public.show_invites (companion_id);
create index if not exists show_invites_inviter on public.show_invites (inviter_id);
create index if not exists user_venue_pins_venue on public.user_venue_pins (venue_id);

-- One SELECT policy on companions instead of two overlapping ones.
drop policy "companions: owner writes" on public.attendance_companions;
create policy "companions: owner inserts" on public.attendance_companions
  for insert to authenticated
  with check (exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())));
create policy "companions: owner updates" on public.attendance_companions
  for update to authenticated
  using (exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())));
create policy "companions: owner deletes" on public.attendance_companions
  for delete to authenticated
  using (exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())));
