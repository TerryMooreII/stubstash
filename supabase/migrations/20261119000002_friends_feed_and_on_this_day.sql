-- Friends feed (what your friends have been to lately) and the "on this day"
-- anniversary notification.

-- ---------------------------------------------------------------- friends feed

/**
 * Your friends' latest shows, newest first: one row per friend per show (a
 * venue on a date; the headliner stands for the bill), at most p_per_friend
 * each so one busy friend doesn't fill the feed.
 */
create or replace function public.friends_feed(p_limit int default 30, p_per_friend int default 5)
returns table(attendance_id uuid, user_id uuid, handle text, display_name text, avatar_path text,
              event_date date, artist_name text, artist_image text, venue_name text, city text,
              state_code text, country_code text, rating numeric, acts bigint, was_there boolean,
              logged_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  fr as (
    select case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as fid
      from public.friendships f, me
     where f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  ),
  acts as (
    select a.id, a.user_id, a.rating, a.created_at, coalesce(a.headliner, false) as headliner, s.event_date,
           ar.name as artist_name, ar.image_url as artist_image,
           v.name as venue_name, v.city, v.state_code, v.country_code,
           lower(btrim(v.name)) as venue_key,
           (select count(*) from public.setlist_songs ss where ss.show_id = s.id and not ss.is_tape) as songs,
           exists (select 1 from public.attendances mine
                    where mine.user_id = (select uid from me) and mine.show_id = a.show_id) as mine
      from fr
      join public.attendances a on a.user_id = fr.fid
      join public.shows s on s.id = a.show_id
      join public.artists ar on ar.id = s.artist_id
      join public.venues v on v.id = s.venue_id
     where s.event_date <= current_date
  ),
  shows as (
    -- Headliner: the one they picked, else the most songs, else logged first (as in lib/shows.ts).
    select distinct on (x.user_id, x.event_date, x.venue_key)
           x.*,
           count(*) over (partition by x.user_id, x.event_date, x.venue_key) as n_acts,
           max(x.created_at) over (partition by x.user_id, x.event_date, x.venue_key) as last_logged,
           bool_or(x.mine) over (partition by x.user_id, x.event_date, x.venue_key) as was_there
      from acts x
     order by x.user_id, x.event_date, x.venue_key, x.headliner desc, x.songs desc, x.created_at
  ),
  ranked as (
    select s.*, row_number() over (partition by s.user_id order by s.event_date desc, s.last_logged desc) as rn
      from shows s
  )
  select r.id, r.user_id, p.handle::text, p.display_name, p.avatar_path,
         r.event_date, r.artist_name, r.artist_image, r.venue_name, r.city, r.state_code, r.country_code,
         r.rating, r.n_acts, r.was_there, r.last_logged
    from ranked r
    join public.profiles p on p.id = r.user_id
   where r.rn <= least(greatest(p_per_friend, 1), 20)
   order by r.event_date desc, r.last_logged desc
   limit least(greatest(p_limit, 1), 100);
$$;
revoke execute on function public.friends_feed(int, int) from public, anon;
grant execute on function public.friends_feed(int, int) to authenticated;

-- ---------------------------------------------------------------- on this day

/**
 * At 10am local time: one notification for a show you went to on this date in
 * an earlier year (the best-rated one, then the most recent). Once a day at most.
 */
create or replace function public.queue_on_this_day()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct on (a.user_id)
           a.id, a.user_id, ar.name artist, v.name venue,
           extract(year from (now() at time zone p.timezone))::int - extract(year from s.event_date)::int as years
      from public.attendances a
      join public.profiles p on p.id = a.user_id
      join public.shows s on s.id = a.show_id
      join public.artists ar on ar.id = s.artist_id
      join public.venues v on v.id = s.venue_id
     where extract(hour from now() at time zone p.timezone) = 10
       and to_char(s.event_date, 'MM-DD') = to_char((now() at time zone p.timezone)::date, 'MM-DD')
       and s.event_date < (now() at time zone p.timezone)::date - 300
       and not exists (
         select 1 from public.notifications x
          where x.user_id = a.user_id and x.kind = 'on_this_day' and x.created_at > now() - interval '20 hours'
       )
     order by a.user_id, a.rating desc nulls last, coalesce(a.headliner, false) desc, s.event_date desc
  loop
    perform public._notify(r.user_id, 'on_this_day', null,
      case when r.years = 1 then 'A year ago today: ' else r.years || ' years ago today: ' end || r.artist,
      'You were at ' || r.venue || '. Take a look back.', '/app/shows/' || r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.queue_on_this_day() from public, anon, authenticated;

select cron.schedule('on-this-day', '25 * * * *', $$ select public.queue_on_this_day() $$);
