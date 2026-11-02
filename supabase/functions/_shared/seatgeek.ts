// SeatGeek API client: the client id and secret stay server-side and responses
// are cached in public.api_cache (the cache key never includes the secret).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { background, HttpError, sleep } from "./http.ts";

const BASE = "https://api.seatgeek.com/2";

// SeatGeek's API has no artist or venue images; see the seatgeek function for where ours come from.
export interface SgPerformer { id: number; name: string; slug?: string; primary?: boolean }
export interface SgVenue {
  id: number; name: string; city?: string; state?: string; country?: string;
  location?: { lat?: number; lon?: number }; timezone?: string;
}
export interface SgEvent {
  id: number; title: string; short_title?: string; url?: string; type?: string; status?: string;
  datetime_local?: string; datetime_utc?: string; datetime_tbd?: boolean; time_tbd?: boolean; date_tbd?: boolean;
  venue?: SgVenue; performers?: SgPerformer[];
  stats?: { lowest_price?: number | null; listing_count?: number | null };
}
export interface SgEventsPage { events: SgEvent[]; meta: { total: number; page: number; per_page: number } }
export interface SgPerformerHit extends SgPerformer { has_upcoming_events?: boolean; num_upcoming_events?: number; type?: string }
export interface SgVenueHit extends SgVenue { has_upcoming_events?: boolean; num_upcoming_events?: number }

/** GET a SeatGeek path (with its query string). Returns null on 404. */
export async function sgGet<T>(db: SupabaseClient, path: string, ttlMinutes = 15): Promise<T | null> {
  const key = `sg:${path}`;
  const { data: cached } = await db.from("api_cache").select("body, fetched_at").eq("key", key).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < ttlMinutes * 60_000) {
    return (cached.body?.notFound ? null : cached.body) as T | null;
  }

  const id = Deno.env.get("SEATGEEK_CLIENT_ID");
  const secret = Deno.env.get("SEATGEEK_CLIENT_SECRET");
  if (!id) throw new HttpError(503, "Upcoming shows aren't connected yet.");
  const auth = `client_id=${encodeURIComponent(id)}` + (secret ? `&client_secret=${encodeURIComponent(secret)}` : "");
  const url = BASE + path + (path.includes("?") ? "&" : "?") + auth;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
    if (res.status === 404) {
      background(Promise.resolve(db.from("api_cache").upsert({ key, body: { notFound: true }, fetched_at: new Date().toISOString() })));
      return null;
    }
    if (!res.ok) {
      console.error("SeatGeek error", res.status, await res.text());
      throw new HttpError(502, "SeatGeek isn't responding right now.");
    }
    const body = await res.json();
    background(Promise.resolve(db.from("api_cache").upsert({ key, body, fetched_at: new Date().toISOString() })));
    return body as T;
  }
  throw new HttpError(429, "SeatGeek is busy. Try again in a few seconds.");
}

const US_STATES = /^[A-Z]{2}$/;

/** A SeatGeek event in the shape of a public.upcoming_events row (minus our id and images). */
export function toEventRow(e: SgEvent) {
  const performers = e.performers ?? [];
  const lead = performers.find((p) => p.primary) ?? performers[0];
  const local = e.datetime_local ?? "";
  const timeTbd = !!(e.time_tbd || e.datetime_tbd);
  const country = (e.venue?.country ?? "").trim();
  return {
    seatgeek_id: e.id,
    title: e.title,
    artist: lead?.name ?? e.short_title ?? e.title,
    performers: performers.map((p) => p.name).slice(0, 12),
    venue_name: e.venue?.name ?? "Venue TBA",
    city: e.venue?.city ?? null,
    state: e.venue?.state && US_STATES.test(e.venue.state) ? e.venue.state : (e.venue?.state ?? null),
    country_code: /^[A-Z]{2}$/.test(country) ? country : country === "United States" ? "US" : null,
    lat: e.venue?.location?.lat ?? null,
    lng: e.venue?.location?.lon ?? null,
    starts_at: e.date_tbd || !e.datetime_utc ? null : e.datetime_utc.replace(/Z?$/, "Z"),
    local_date: local.slice(0, 10),
    local_time: timeTbd || !local ? null : local.slice(11, 19),
    date_tbd: !!e.date_tbd,
    timezone: e.venue?.timezone ?? null,
    ticket_url: ticketUrl(e.url),
    lowest_price: e.stats?.lowest_price ?? null,
    listing_count: e.stats?.listing_count ?? null,
    status: e.status ?? "normal",
  };
}

/** SeatGeek link, with our partner id when we have one (SEATGEEK_AFFILIATE_ID). */
export function ticketUrl(url: string | undefined): string | null {
  if (!url) return null;
  const aid = Deno.env.get("SEATGEEK_AFFILIATE_ID");
  if (!aid) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("aid", aid);
    return u.toString();
  } catch {
    return url;
  }
}

/** "Billy Strings" -> "billy-strings" (SeatGeek's performer slug style). */
export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
