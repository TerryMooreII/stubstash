// setlist.fm gateway for the app. Requires a signed-in user.
//
// POST { action: "search", q?, artist?, artist_mbid?, venue?, city?, state?, country?, tour?, date?, year?, page? }
// POST { action: "artists", q }                             -> { artists: [{ mbid, name, disambiguation }] }
// POST { action: "log", setlistfm_id }                      -> { attendance_id, show_id, created }
// POST { action: "preview_user", username }                 -> { total, earliest }
// POST { action: "import_user", username, page }            -> { page, pages, total, imported, skipped }
// POST { action: "refresh", show_id }                       -> { show_id }

import { HttpError, json, serve } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import {
  isoToSfmDate, sfmDateToIso, sfmGet, summarize, upsertSetlist,
  type SfmPage, type SfmSetlist,
} from "../_shared/setlistfm.ts";

const enc = encodeURIComponent;

function clean(v: unknown, max = 120): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

serve(async (req) => {
  const userId = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  switch (body.action) {
    case "search": {
      const page = Math.max(1, Math.min(50, Number(body.page) || 1));
      let artist = clean(body.artist), venue = clean(body.venue), city = clean(body.city);
      const artistMbid = clean(body.artist_mbid, 36);
      const tour = clean(body.tour);
      const state = clean(body.state, 3)?.toUpperCase();
      const country = clean(body.country, 2)?.toUpperCase();
      if (artistMbid && !/^[0-9a-f-]{36}$/i.test(artistMbid)) throw new HttpError(400, "That artist id doesn't look right.");
      if (country && !/^[A-Z]{2}$/.test(country)) throw new HttpError(400, "Use a two-letter country code.");
      const rawDate = clean(body.date, 10);
      if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) throw new HttpError(400, "Dates look like 2024-07-04.");
      const date = rawDate;
      let year = clean(body.year, 4);
      let q = clean(body.q);

      // Free text: pull out a 4-digit year, then try artist, venue, city in turn.
      if (q) {
        const y = q.match(/\b(19[5-9]\d|20\d\d)\b/);
        if (y && !year) { year = y[1]; q = q.replace(y[0], "").trim() || undefined; }
      }
      const params = (extra: Record<string, string | undefined>) => {
        const p = new URLSearchParams({ p: String(page) });
        if (date) p.set("date", isoToSfmDate(date));
        if (year && !date) p.set("year", year);
        for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
        return p.toString();
      };

      let result: SfmPage | null = null;
      let matchedBy: string | null = null;
      if (artist || artistMbid || venue || city || tour || state || country) {
        // An exact artist id beats a fuzzy name.
        result = await sfmGet<SfmPage>(db, `/search/setlists?${params({
          artistMbid, artistName: artistMbid ? undefined : artist, venueName: venue, cityName: city,
          stateCode: state, countryCode: country, tourName: tour,
        })}`);
        matchedBy = "fields";
      } else if (q) {
        for (const field of ["artistName", "venueName", "cityName"] as const) {
          result = await sfmGet<SfmPage>(db, `/search/setlists?${params({ [field]: q })}`);
          if (result?.setlist?.length) { matchedBy = field.replace("Name", ""); break; }
        }
      } else if (year || date) {
        throw new HttpError(400, "Add an artist, venue, city or tour to search.");
      } else {
        return json({ results: [], total: 0, page: 1, pages: 0, matched_by: null });
      }

      const list = result?.setlist ?? [];
      // Mark which results are already in this user's log.
      const ids = list.map((s) => s.id);
      const { data: mine } = ids.length
        ? await db.from("attendances").select("id, shows!inner(setlistfm_id)").eq("user_id", userId).in("shows.setlistfm_id", ids)
        : { data: [] };
      const have = new Map((mine ?? []).map((r: any) => [r.shows.setlistfm_id, r.id]));

      return json({
        results: list.map((s) => ({ ...summarize(s), attendance_id: have.get(s.id) ?? null })),
        total: result?.total ?? 0,
        page,
        pages: result ? Math.ceil(result.total / result.itemsPerPage) : 0,
        matched_by: matchedBy,
      });
    }

    case "artists": {
      // Artist suggestions for the advanced search, so "Phish" means the band, not a tribute act.
      const q = clean(body.q, 80);
      if (!q || q.length < 2) return json({ artists: [] });
      const res = await sfmGet<{ artist?: { mbid: string; name: string; disambiguation?: string }[] }>(
        db, `/search/artists?artistName=${enc(q)}&sort=relevance&p=1`, 60 * 24,
      );
      return json({
        artists: (res?.artist ?? []).slice(0, 8).map((a) => ({ mbid: a.mbid, name: a.name, disambiguation: a.disambiguation || null })),
      });
    }

    case "log": {
      const id = clean(body.setlistfm_id, 20);
      if (!id || !/^[0-9a-f]+$/i.test(id)) throw new HttpError(400, "Missing setlist id.");
      const setlist = await sfmGet<SfmSetlist>(db, `/setlist/${enc(id)}`, 30);
      if (!setlist) throw new HttpError(404, "That setlist isn't on setlist.fm anymore.");
      const showId = await upsertSetlist(db, setlist);

      const { data: existing } = await db.from("attendances").select("id")
        .eq("user_id", userId).eq("show_id", showId).maybeSingle();
      if (existing) return json({ attendance_id: existing.id, show_id: showId, created: false });

      const { data, error } = await db.from("attendances").insert({ user_id: userId, show_id: showId }).select("id").single();
      if (error) throw error;
      return json({ attendance_id: data.id, show_id: showId, created: true });
    }

    case "preview_user": {
      const username = clean(body.username, 60);
      if (!username) throw new HttpError(400, "Enter your setlist.fm username.");
      const first = await sfmGet<SfmPage>(db, `/user/${enc(username)}/attended?p=1`, 10);
      if (!first || !first.total) return json({ total: 0, earliest: null, pages: 0 });
      const pages = Math.ceil(first.total / first.itemsPerPage);
      const last = pages > 1 ? await sfmGet<SfmPage>(db, `/user/${enc(username)}/attended?p=${pages}`, 10) : first;
      const oldest = last?.setlist?.[last.setlist.length - 1];
      const artists = new Set<string>(), venues = new Set<string>();
      for (const s of first.setlist) { artists.add(s.artist.name); if (s.venue?.id) venues.add(s.venue.id); }
      return json({
        total: first.total,
        pages,
        earliest: oldest ? { artist: oldest.artist.name, venue: oldest.venue?.name, date: sfmDateToIso(oldest.eventDate) } : null,
        sample_artists: [...artists].slice(0, 5),
      });
    }

    case "import_user": {
      const username = clean(body.username, 60);
      const page = Math.max(1, Number(body.page) || 1);
      if (!username) throw new HttpError(400, "Enter your setlist.fm username.");
      const res = await sfmGet<SfmPage>(db, `/user/${enc(username)}/attended?p=${page}`, 10);
      if (!res) return json({ page, pages: 0, total: 0, imported: 0, skipped: 0 });

      let imported = 0, skipped = 0;
      for (const s of res.setlist) {
        try {
          const showId = await upsertSetlist(db, s);
          const { error } = await db.from("attendances").insert({ user_id: userId, show_id: showId });
          if (error && error.code !== "23505") throw error;   // 23505 = already logged
          if (error) skipped++; else imported++;
        } catch (e) {
          console.error("import failed for", s.id, e);
          skipped++;
        }
      }
      if (page === 1) await db.from("profiles").update({ setlistfm_username: username }).eq("id", userId);
      return json({ page, pages: Math.ceil(res.total / res.itemsPerPage), total: res.total, imported, skipped });
    }

    case "refresh": {
      const showId = clean(body.show_id, 40);
      const { data: show } = await db.from("shows").select("id, setlistfm_id, source").eq("id", showId ?? "").maybeSingle();
      if (!show || show.source !== "setlistfm" || !show.setlistfm_id) throw new HttpError(404, "Show not found.");
      const setlist = await sfmGet<SfmSetlist>(db, `/setlist/${enc(show.setlistfm_id)}`, 5);
      if (setlist) await upsertSetlist(db, setlist);
      return json({ show_id: show.id });
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
});
