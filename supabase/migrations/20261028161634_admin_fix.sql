-- admin_artists returned mbid as uuid; the column is text. Return types can't
-- change in place, so drop and recreate (grants re-applied below).
drop function if exists public.admin_artists(text, text, int, int);

create or replace function public.admin_artists(q text default null, p_filter text default 'all', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, name text, mbid text, disambiguation text, genre text, source public.data_source,
  image_url text, image_source text, image_credit text, image_checked_at timestamptz,
  shows bigint, fans bigint, created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  return query
  with base as (
    select a.id, a.name, a.mbid, a.disambiguation, a.genre, a.source,
           a.image_url, a.image_source, a.image_credit, a.image_checked_at,
           (select count(*) from public.shows s where s.artist_id = a.id) shows,
           (select count(distinct t.user_id) from public.shows s join public.attendances t on t.show_id = s.id where s.artist_id = a.id) fans,
           a.created_at
      from public.artists a
     where (q is null or q = '' or a.name ilike '%' || q || '%')
       and case p_filter
             when 'no_image' then a.image_url is null
             when 'manual' then a.source = 'manual'
             when 'unused' then not exists (select 1 from public.shows s where s.artist_id = a.id)
             else true end
  )
  select b.*, count(*) over () total from base b
   order by b.fans desc, b.name
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.admin_artists(text, text, int, int) from public, anon;
grant execute on function public.admin_artists(text, text, int, int) to authenticated;
