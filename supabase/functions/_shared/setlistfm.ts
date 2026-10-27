// setlist.fm API client: API key stays server-side, responses are cached in
// public.api_cache, and calls are spaced out to respect the ~2 req/sec limit.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError, sleep } from "./http.ts";

const BASE = "https://api.setlist.fm/rest/1.0";
const MIN_GAP_MS = 600;
let lastCall = 0;

export interface SfmCoords { lat?: number; long?: number }
export interface SfmCity {
  id?: string; name?: string; state?: string; stateCode?: string;
  coords?: SfmCoords; country?: { code?: string; name?: string };
}
export interface SfmVenue { id?: string; name?: string; city?: SfmCity; url?: string }
export interface SfmArtist { mbid?: string; name: string; sortName?: string; disambiguation?: string; url?: string }
export interface SfmSong { name?: string; info?: string; tape?: boolean; cover?: { name?: string } }
export interface SfmSet { name?: string; encore?: number; song?: SfmSong[] }
export interface SfmSetlist {
  id: string; versionId?: string; eventDate: string; url?: string; info?: string;
  artist: SfmArtist; venue: SfmVenue; tour?: { name?: string }; sets?: { set?: SfmSet[] };
}
export interface SfmPage { total: number; page: number; itemsPerPage: number; setlist: SfmSetlist[] }

/** GET a setlist.fm path. Returns null on 404 (setlist.fm uses 404 for "no results"). */
export async function sfmGet<T>(db: SupabaseClient, path: string, ttlMinutes = 60): Promise<T | null> {
  const key = `sfm:${path}`;
  const { data: cached } = await db.from("api_cache").select("body, fetched_at").eq("key", key).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < ttlMinutes * 60_000) {
    return (cached.body?.notFound ? null : cached.body) as T | null;
  }

  const apiKey = Deno.env.get("SETLISTFM_API_KEY");
  if (!apiKey) throw new HttpError(503, "setlist.fm isn't connected yet.");

  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();

    const res = await fetch(BASE + path, {
      headers: { "x-api-key": apiKey, Accept: "application/json", "Accept-Language": "en" },
    });
    if (res.status === 429) { await sleep(1200 * (attempt + 1)); continue; }
    if (res.status === 404) {
      await db.from("api_cache").upsert({ key, body: { notFound: true }, fetched_at: new Date().toISOString() });
      return null;
    }
    if (!res.ok) {
      console.error("setlist.fm error", res.status, await res.text());
      throw new HttpError(502, "setlist.fm isn't responding right now.");
    }
    const body = await res.json();
    await db.from("api_cache").upsert({ key, body, fetched_at: new Date().toISOString() });
    return body as T;
  }
  throw new HttpError(429, "setlist.fm is busy. Try again in a few seconds.");
}

/** "27-09-2026" -> "2026-09-27" */
export function sfmDateToIso(d: string): string {
  const [dd, mm, yyyy] = d.split("-");
  return `${yyyy}-${mm}-${dd}`;
}
/** "2026-09-27" -> "27-09-2026" */
export function isoToSfmDate(d: string): string {
  const [yyyy, mm, dd] = d.split("-");
  return `${dd}-${mm}-${yyyy}`;
}

export function songCount(s: SfmSetlist): number {
  return (s.sets?.set ?? []).reduce((n, set) => n + (set.song ?? []).filter((x) => x.name && !x.tape).length, 0);
}

const FEST = /\b(fest|festival|fair|jam ?cruise|weekend|lollapalooza|bonnaroo|coachella|primavera|glastonbury|outside lands|austin city limits|governors ball)\b/i;
export function looksLikeFestival(s: SfmSetlist): boolean {
  return FEST.test(s.tour?.name ?? "") || FEST.test(s.venue?.name ?? "") || FEST.test(s.info ?? "");
}

/** Shape sent to the app for search results. */
export function summarize(s: SfmSetlist) {
  return {
    setlistfm_id: s.id,
    date: sfmDateToIso(s.eventDate),
    artist: s.artist.name,
    artist_mbid: s.artist.mbid ?? null,
    venue: s.venue?.name ?? "Unknown venue",
    city: s.venue?.city?.name ?? null,
    state_code: s.venue?.city?.stateCode ?? null,
    country_code: s.venue?.city?.country?.code ?? null,
    tour: s.tour?.name ?? null,
    songs: songCount(s),
    url: s.url ?? null,
  };
}

/**
 * Saves a setlist.fm setlist into the catalog (artist, venue, show, songs).
 * Re-running is safe: rows are upserted by their setlist.fm ids, and the setlist
 * is rewritten only when setlist.fm's version id changed.
 */
export async function upsertSetlist(db: SupabaseClient, s: SfmSetlist): Promise<string> {
  // Artist (by MusicBrainz id when present, else by exact name among setlist.fm artists)
  let artistId: string | undefined;
  if (s.artist.mbid) {
    const { data, error } = await db.from("artists").upsert({
      mbid: s.artist.mbid, name: s.artist.name, sort_name: s.artist.sortName ?? null,
      disambiguation: s.artist.disambiguation || null, setlistfm_url: s.artist.url ?? null, source: "setlistfm",
    }, { onConflict: "mbid" }).select("id").single();
    if (error) throw error;
    artistId = data.id;
  } else {
    const { data: found } = await db.from("artists").select("id")
      .eq("source", "setlistfm").is("mbid", null).eq("name", s.artist.name).limit(1).maybeSingle();
    if (found) artistId = found.id;
    else {
      const { data, error } = await db.from("artists").insert({ name: s.artist.name, source: "setlistfm" }).select("id").single();
      if (error) throw error;
      artistId = data.id;
    }
  }

  // Venue
  const city = s.venue?.city;
  const venueRow = {
    setlistfm_id: s.venue?.id ?? `noid:${s.venue?.name}:${city?.name}`,
    name: s.venue?.name || "Unknown venue",
    city: city?.name ?? null,
    state: city?.state ?? null,
    state_code: city?.stateCode ?? null,
    country_code: city?.country?.code ?? null,
    country_name: city?.country?.name ?? null,
    city_lat: city?.coords?.lat ?? null,
    city_lng: city?.coords?.long ?? null,
    source: "setlistfm",
  };
  const { data: venue, error: venueErr } = await db.from("venues")
    .upsert(venueRow, { onConflict: "setlistfm_id" }).select("id").single();
  if (venueErr) throw venueErr;

  // Show
  const { data: existing } = await db.from("shows").select("id, setlistfm_version")
    .eq("setlistfm_id", s.id).maybeSingle();
  const showRow = {
    setlistfm_id: s.id,
    setlistfm_version: s.versionId ?? null,
    setlistfm_url: s.url ?? null,
    artist_id: artistId,
    venue_id: venue.id,
    event_date: sfmDateToIso(s.eventDate),
    tour_name: s.tour?.name ?? null,
    info: s.info ?? null,
    is_festival: looksLikeFestival(s),
    source: "setlistfm",
  };
  const { data: show, error: showErr } = await db.from("shows")
    .upsert(showRow, { onConflict: "setlistfm_id" }).select("id").single();
  if (showErr) throw showErr;

  if (!existing || existing.setlistfm_version !== s.versionId) {
    const rows: Record<string, unknown>[] = [];
    let pos = 0;
    (s.sets?.set ?? []).forEach((set, setIndex) => {
      const setName = set.encore ? (set.encore > 1 ? `Encore ${set.encore}` : "Encore") : set.name || (setIndex === 0 ? "Set" : `Set ${setIndex + 1}`);
      for (const song of set.song ?? []) {
        if (!song.name?.trim()) continue;
        pos++;
        rows.push({
          show_id: show.id, set_index: setIndex, set_name: setName, is_encore: !!set.encore,
          position: pos, name: song.name.trim().slice(0, 300), info: song.info ?? null,
          is_cover: !!song.cover, cover_artist: song.cover?.name ?? null, is_tape: !!song.tape,
        });
      }
    });
    await db.from("setlist_songs").delete().eq("show_id", show.id);
    if (rows.length) {
      const { error } = await db.from("setlist_songs").insert(rows);
      if (error) throw error;
    }
    await db.from("shows").update({ setlist_synced_at: new Date().toISOString() }).eq("id", show.id);
  }
  return show.id;
}
