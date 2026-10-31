-- Security fixes for friendships and show invites.
--
-- 1. Friendships: the addressee's UPDATE policy didn't stop them rewriting
--    requester_id, so anyone could turn a request from one person into an
--    accepted friendship with someone else. Updates are now limited to the
--    status and responded_at columns, and only on requests still pending.
-- 2. Show invites: the inviter could point an invite at someone else's
--    attendance or companion row. Invites must now belong to the inviter's own
--    attendance (and companion row), can't be edited, expire after 60 days, and
--    claim_show_invite re-checks the chain before linking anything.

-- ---------------------------------------------------------------- friendships

revoke update on public.friendships from anon, authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

drop policy "friendships: addressee responds" on public.friendships;
create policy "friendships: addressee responds" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status in ('accepted', 'declined'));

-- ---------------------------------------------------------------- show invites

revoke update on public.show_invites from anon, authenticated;

drop policy "invites: inviter manages" on public.show_invites;

create policy "invites: inviter reads" on public.show_invites
  for select to authenticated
  using (inviter_id = (select auth.uid()));

create policy "invites: inviter creates" on public.show_invites
  for insert to authenticated
  with check (
    inviter_id = (select auth.uid())
    and claimed_by is null
    and exists (select 1 from public.attendances a
                 where a.id = attendance_id and a.user_id = (select auth.uid()))
    and (companion_id is null or exists (
          select 1 from public.attendance_companions c
           where c.id = companion_id and c.attendance_id = show_invites.attendance_id))
  );

create policy "invites: inviter deletes" on public.show_invites
  for delete to authenticated
  using (inviter_id = (select auth.uid()));

-- Invites older than this can't be opened or claimed.
create or replace function public._invite_live(p_created timestamptz)
returns boolean
language sql stable set search_path = ''
as $$ select p_created > now() - interval '60 days' $$;
revoke execute on function public._invite_live(timestamptz) from public, anon, authenticated;

create or replace function public.peek_show_invite(p_token text)
returns table (inviter_handle text, inviter_name text, artist text, venue text, city text, event_date date, claimed boolean)
language sql stable security definer set search_path = ''
as $$
  select p.handle::text, p.display_name, ar.name, v.name, v.city, s.event_date, i.claimed_by is not null
    from public.show_invites i
    join public.profiles p on p.id = i.inviter_id
    join public.attendances a on a.id = i.attendance_id and a.user_id = i.inviter_id
    join public.shows s on s.id = a.show_id
    join public.artists ar on ar.id = s.artist_id
    join public.venues v on v.id = s.venue_id
   where i.token = p_token
     and public._invite_live(i.created_at);
$$;

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
  if inv is null or not public._invite_live(inv.created_at) then raise exception 'invite not found'; end if;
  if inv.claimed_by is not null and inv.claimed_by <> me then raise exception 'invite already used'; end if;
  if inv.inviter_id = me then raise exception 'that''s your own invite'; end if;

  -- The invite must point at the inviter's own attendance.
  select show_id into v_show from public.attendances
   where id = inv.attendance_id and user_id = inv.inviter_id;
  if v_show is null then raise exception 'invite not found'; end if;

  insert into public.attendances (user_id, show_id) values (me, v_show)
  on conflict (user_id, show_id) do update set updated_at = now()
  returning id into v_att;

  -- Link the companion tag only if it's on that attendance and not already someone else's.
  update public.attendance_companions
     set companion_user_id = me
   where id = inv.companion_id
     and attendance_id = inv.attendance_id
     and (companion_user_id is null or companion_user_id = me);

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

revoke execute on function public.claim_show_invite(text) from public, anon;
