-- Storage buckets. Files are stored under "<user_id>/..." so ownership is the first folder.
--   avatars: public read
--   photos, stubs: private; readable by anyone allowed to see the owner's log (signed URLs)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true,  2097152,  array['image/jpeg','image/png','image/webp']),
  ('photos',  'photos',  false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('stubs',   'stubs',   false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

create policy "avatars: public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

create policy "media: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'photos', 'stubs')
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "media: owner updates" on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars', 'photos', 'stubs')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "media: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'photos', 'stubs')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "media: viewers read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('photos', 'stubs')
         and public.can_view_user(((storage.foldername(name))[1])::uuid));
