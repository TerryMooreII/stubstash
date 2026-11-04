-- Friend requests you sent that haven't been accepted yet.
-- Declined ones are listed too, so the sender can't tell they were declined.
create or replace function public.outgoing_friend_requests()
returns table (addressee_id uuid, handle text, display_name text, avatar_path text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select f.addressee_id, p.handle::text, p.display_name, p.avatar_path, f.created_at
    from public.friendships f
    join public.profiles p on p.id = f.addressee_id
   where f.requester_id = (select auth.uid()) and f.status in ('pending', 'declined')
   order by f.created_at desc;
$$;

revoke execute on function public.outgoing_friend_requests() from public, anon;
grant execute on function public.outgoing_friend_requests() to authenticated;
