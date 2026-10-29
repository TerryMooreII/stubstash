-- Profile header photo: 1..16 picks a bundled concert photo; null = picked automatically from the user id.
alter table public.profiles
  add column if not exists header_photo smallint check (header_photo between 1 and 16);

drop function if exists public.public_profile(text);
create function public.public_profile(p_handle text)
 returns table(id uuid, handle text, display_name text, avatar_path text, home_city text, is_public boolean,
               can_view boolean, is_self boolean, friendship text, show_count bigint, header_photo smallint)
 language sql stable security definer
 set search_path to ''
as $function$
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
              then (select count(*) from public.attendances a where a.user_id = p.id) end,
         p.header_photo
    from public.profiles p
   where p.handle = p_handle::extensions.citext;
$function$;
grant execute on function public.public_profile(text) to anon, authenticated;
