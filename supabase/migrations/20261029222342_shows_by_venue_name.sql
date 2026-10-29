-- A show = one date at one venue *name* (duplicate venue records with the same
-- name, e.g. "RamKat" saved twice with different city text, still group).
do $do$
declare
  fn text;
  d text;
  pairs text[][] := array[
    array['dense_rank() over (order by s.event_date, v.id)', 'dense_rank() over (order by s.event_date, lower(trim(v.name)))'],
    array['count(distinct (event_date, venue_id))', 'count(distinct (event_date, lower(trim(venue_name))))'],
    array['distinct on (event_date, venue_id)', 'distinct on (event_date, lower(trim(venue_name)))']
  ];
  i int;
  hit boolean;
begin
  foreach fn in array array['public.user_log(uuid)', 'public.dashboard_stats(uuid)', 'public.year_in_review(integer, uuid)'] loop
    d := pg_get_functiondef(fn::regprocedure);
    hit := false;
    for i in 1 .. array_length(pairs, 1) loop
      if position(pairs[i][1] in d) > 0 then hit := true; end if;
      d := replace(d, pairs[i][1], pairs[i][2]);
    end loop;
    if not hit then raise exception '% had nothing to update', fn; end if;
    execute d;
  end loop;
end
$do$;

create or replace function public._show_count(p_user uuid, p_year int default null)
 returns bigint language sql stable security definer set search_path to ''
as $$
  select count(distinct (s.event_date, lower(trim(v.name))))
    from public.attendances a
    join public.shows s on s.id = a.show_id
    join public.venues v on v.id = s.venue_id
   where a.user_id = p_user and (p_year is null or extract(year from s.event_date) = p_year);
$$;

create or replace function public.set_headliner(p_attendance uuid)
 returns void language sql security invoker set search_path to ''
as $$
  update public.attendances a
     set headliner = (a.id = p_attendance)
    from public.shows s, public.venues v, public.attendances me, public.shows ms, public.venues mv
   where me.id = p_attendance and me.user_id = (select auth.uid()) and ms.id = me.show_id and mv.id = ms.venue_id
     and a.user_id = me.user_id and s.id = a.show_id and v.id = s.venue_id
     and s.event_date = ms.event_date and lower(trim(v.name)) = lower(trim(mv.name));
$$;
