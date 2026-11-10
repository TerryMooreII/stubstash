// SeatGeek gateway for upcoming shows. Requires a signed-in user.
//
// POST { action: "suggest", q, lat?, lng?, range? }
//        -> { artists: [{ id, name, upcoming }], venues: [{ id, name, city, state, upcoming }] }
//        Artists and venues with upcoming shows whose names match, for the search box.
//        Venues are limited to the same where as search (the place or your home, and the range).
// POST { action: "search", q?, performer_id?, venue_id?, lat?, lng?, range?, from?, to?, seen_only?, page? }
//        -> { results: PlanItem[], total, page, pages, near, elsewhere, pending_images }
//        q is free text. performer_id / venue_id are exact SeatGeek ids (picked from suggest).
//        Without lat/lng it searches around your home (if set). range: 25 | 50 | 100 | 250 | "any" (miles).
//        A venue search ignores the distance. When an artist has no shows nearby,
//        `elsewhere` is how many they have anywhere (else 0). `pending_images` lists
//        artists whose photos haven't been looked up yet (ask with "images").
// POST { action: "images", names }                 -> { images: { [lower-cased name]: { url, credit } } }
// POST { action: "event", seatgeek_id }            -> PlanItem
// POST { action: "plan", seatgeek_id, status }     -> PlanItem   (status: going | interested | cant | null to clear)
//
// PlanItem = { event, status, note, invited_by, crew, seen } (see public._plan_item).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { background, HttpError, json, serve } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import {
  sgGet, slugify, toEventRow, type SgEvent, type SgEventsPage, type SgPerformerHit, type SgVenueHit,
} from "../_shared/seatgeek.ts";
import { deezer, km, nameVariants, norm, wikidataVenue, type Img } from "../_shared/images.ts";

const PER_PAGE = 25;
const RANGES = new Set(["25", "50", "100", "250", "any"]);
const STATUSES = new Set(["going", "interested", "cant"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type EventRow = ReturnType<typeof toEventRow>;
/** How far (km) a Wikidata venue may be from SeatGeek's venue pin. */
const VENUE_MATCH_KM = 3;
const IMG_CACHE_DAYS = 30;

const imgFresh = (fetchedAt: string) => Date.now() - new Date(fetchedAt).getTime() < IMG_CACHE_DAYS * 864e5;

/** Cached "img:" lookups (kept 30 days, misses too) for many keys in one query. */
async function cachedImages(db: SupabaseClient, keys: string[]): Promise<Map<string, Img | null>> {
  const out = new Map<string, Img | null>();
  if (!keys.length) return out;
  const { data } = await db.from("api_cache").select("key, body, fetched_at").in("key", keys);
  for (const r of data ?? []) if (imgFresh(r.fetched_at)) out.set(r.key, r.body?.img ?? null);
  return out;
}

/** Runs a lookup and caches what it found (or that it found nothing). */
async function lookUpAndCache(db: SupabaseClient, key: string, look: () => Promise<Img | null>): Promise<Img | null> {
  const img = await look().catch(() => null);
  background(Promise.resolve(db.from("api_cache").upsert({ key, body: { img }, fetched_at: new Date().toISOString() })));
  return img;
}

/**
 * Artist photos by lower-cased name: our catalog first, then cached Deezer
 * lookups. Artists never looked up are fetched from Deezer when `lookUp` is
 * set; otherwise they're returned as `pending` for the app to ask for next.
 */
async function artistImages(
  db: SupabaseClient, names: string[], lookUp: boolean,
): Promise<{ images: Map<string, Img>; pending: string[] }> {
  const out = new Map<string, Img>();
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return { images: out, pending: [] };
  const keyOf = (n: string) => `img:deezer:${norm(n)}`;
  // Our catalog and the Deezer cache, at the same time.
  const [{ data }, cached] = await Promise.all([
    db.rpc("_artist_images", { p_names: unique }),
    cachedImages(db, unique.map(keyOf)),
  ]);
  for (const r of (data ?? []) as { name: string; image_url: string; image_credit: string | null }[]) {
    out.set(r.name, { url: r.image_url, source: "", credit: r.image_credit ?? "" });
  }
  const missing = unique.filter((n) => !out.has(n.toLowerCase()));
  const unknown: string[] = [];
  for (const n of missing) {
    if (!cached.has(keyOf(n))) unknown.push(n);
    else if (cached.get(keyOf(n))) out.set(n.toLowerCase(), cached.get(keyOf(n))!);
  }
  if (!lookUp) return { images: out, pending: unknown };
  await Promise.all(unknown.map(async (n) => {
    const img = await lookUpAndCache(db, keyOf(n), () => deezer(n));
    if (img) out.set(n.toLowerCase(), img);
  }));
  return { images: out, pending: [] };
}

/** A venue photo: our catalog first, then Wikidata/Wikipedia near SeatGeek's pin (slow: several requests). */
async function venueImage(db: SupabaseClient, row: EventRow): Promise<Img | null> {
  const { data } = await db.rpc("_venue_image", { p_name: row.venue_name, p_city: row.city });
  const mine = (data ?? [])[0] as { image_url: string; image_credit: string | null } | undefined;
  if (mine) return { url: mine.image_url, source: "", credit: mine.image_credit ?? "" };
  if (row.lat == null || row.lng == null) return null;
  const near = { lat: row.lat, lng: row.lng };
  const key = `img:venue:${norm(row.venue_name)}:${near.lat.toFixed(2)},${near.lng.toFixed(2)}`;
  const hit = await cachedImages(db, [key]);
  if (hit.has(key)) return hit.get(key) ?? null;
  return lookUpAndCache(db, key, async () => (await wikidataVenue(nameVariants(row.venue_name), near, VENUE_MATCH_KM))?.img ?? null);
}

function clean(v: unknown, max = 120): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** A positive whole number, or undefined. */
function posInt(v: unknown): number | undefined {
  const n = num(v);
  return n && Number.isInteger(n) && n > 0 ? n : undefined;
}

function seatgeekId(v: unknown): number {
  const n = num(v);
  if (!n || !Number.isInteger(n) || n <= 0) throw new HttpError(400, "Missing event id.");
  return n;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Where to search: the place picked (lat/lng), else your home; null for anywhere or no home. */
async function resolveWhere(db: SupabaseClient, userId: string, body: Record<string, unknown>, range: string) {
  if (range === "any") return null;
  let lat = num(body.lat), lng = num(body.lng);
  let label: string | null = null;
  if (lat !== undefined && lng !== undefined) {
    label = clean(body.place_label) ?? null;
  } else {
    const { data: me } = await db.from("profiles").select("home_city, home_lat, home_lng").eq("id", userId).single();
    if (me?.home_lat == null || me?.home_lng == null) return null;
    lat = me.home_lat as number; lng = me.home_lng as number; label = me.home_city ?? null;
  }
  if (Math.abs(lat!) > 90 || Math.abs(lng!) > 180) throw new HttpError(400, "That location doesn't look right.");
  return { lat: lat!, lng: lng!, miles: Number(range), label };
}

/** Times you've seen each artist, keyed by lower-cased name. */
async function seenCounts(db: SupabaseClient, userId: string, names: string[]): Promise<Map<string, number>> {
  if (!names.length) return new Map();
  const { data, error } = await db.rpc("_artist_seen_counts", { p_user: userId, p_names: [...new Set(names)] });
  if (error) throw error;
  return new Map((data ?? []).map((r: { name: string; shows: number }) => [r.name, r.shows]));
}

/** Your plan for a saved event. Pass the artist when you have it, so the seen count runs alongside. */
async function planItem(db: SupabaseClient, userId: string, eventId: string, artist?: string) {
  const [item, early] = await Promise.all([
    db.rpc("_plan_item", { p_viewer: userId, p_event: eventId }),
    artist ? seenCounts(db, userId, [artist]) : null,
  ]);
  if (item.error) throw item.error;
  const data = item.data;
  if (!data) throw new HttpError(404, "That show isn't available anymore.");
  const name = String(data.event.artist);
  const seen = early && artist === name ? early : await seenCounts(db, userId, [name]);
  return { ...data, seen: seen.get(name.toLowerCase()) ?? 0 };
}

interface Saved { id: string; artist: string; local_date: string }

/**
 * Saves (or refreshes) an event from SeatGeek and returns it. The artist photo is
 * looked up straight away; the venue photo (several slow requests) is looked up
 * after the response and saved for next time.
 */
async function saveEvent(db: SupabaseClient, sgId: number, maxAgeMinutes: number): Promise<Saved> {
  const { data: have } = await db.from("upcoming_events")
    .select("id, artist, local_date, fetched_at, image_url, venue_checked_at").eq("seatgeek_id", sgId).maybeSingle();
  const fresh = have && Date.now() - new Date(have.fetched_at).getTime() < maxAgeMinutes * 60_000;
  if (fresh) return have;

  const ev = await sgGet<SgEvent>(db, `/events/${sgId}`, 30);
  if (!ev) {
    if (have) return have; // gone from SeatGeek (often after the show); keep what we have
    throw new HttpError(404, "That show isn't on SeatGeek anymore.");
  }
  const row = toEventRow(ev);
  if (!row.local_date) throw new HttpError(404, "That show doesn't have a date yet.");
  const images: Record<string, unknown> = {};
  if (!have?.image_url) {
    const a = (await artistImages(db, [row.artist], true)).images.get(row.artist.toLowerCase());
    if (a) Object.assign(images, { image_url: a.url, image_credit: a.credit || null });
  }
  const { data, error } = await db.from("upcoming_events")
    .upsert({ ...row, ...images, fetched_at: new Date().toISOString() }, { onConflict: "seatgeek_id" })
    .select("id").single();
  if (error) throw error;

  if (!have?.venue_checked_at) {
    background((async () => {
      const venue = await venueImage(db, row);
      await db.from("upcoming_events").update({
        venue_image_url: venue?.url ?? null, venue_image_credit: venue?.credit || null,
        venue_checked_at: new Date().toISOString(),
      }).eq("id", data.id);
    })());
  }
  return { id: data.id, artist: row.artist, local_date: row.local_date };
}

serve(async (req) => {
  const userId = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  switch (body.action) {
    case "search": {
      const page = Math.max(1, Math.min(20, Number(body.page) || 1));
      const today = new Date().toISOString().slice(0, 10);
      const from = clean(body.from, 10) ?? today;
      const to = clean(body.to, 10) ?? addDays(today, 183);
      if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) throw new HttpError(400, "Dates look like 2026-12-31.");
      if (to < from) throw new HttpError(400, "The end date is before the start date.");
      const range = String(body.range ?? "50");
      if (!RANGES.has(range)) throw new HttpError(400, "Pick a distance of 25, 50, 100 or 250 miles, or anywhere.");

      const p = new URLSearchParams({
        "taxonomies.name": "concert",
        "datetime_local.gte": `${from < today ? today : from}T00:00:00`,
        "datetime_local.lte": `${to}T23:59:59`,
        sort: "datetime_local.asc",
        per_page: String(PER_PAGE),
        page: String(page),
      });
      const performerId = posInt(body.performer_id);
      const venueId = posInt(body.venue_id);
      if (performerId) p.set("performers.id", String(performerId));
      if (venueId) p.set("venue.id", String(venueId));
      const q = clean(body.q);
      if (q && !performerId && !venueId) p.set("q", q);

      // Where: the place picked in the search, else your home. A venue is its own place.
      const where = venueId ? null : await resolveWhere(db, userId, body, range);
      const near = where?.label ?? null;
      if (where) {
        p.set("lat", where.lat.toFixed(3));
        p.set("lon", where.lng.toFixed(3));
        p.set("range", `${range}mi`);
      }

      // "Artists you've seen": SeatGeek matches performers by slug, so we guess slugs from names.
      if (body.seen_only) {
        const { data: names, error } = await db.rpc("_top_artist_names", { p_user: userId, p_limit: 40 });
        if (error) throw error;
        const slugs: string[] = [...new Set<string>((names ?? []).map((n: string) => slugify(n)).filter(Boolean))];
        if (!slugs.length) return json({ results: [], total: 0, page, pages: 0, near, elsewhere: 0 });
        p.delete("q");
        p.delete("performers.id");
        p.delete("venue.id");
        for (const s of slugs) p.append("performers.slug", s);
      }

      const res = await sgGet<SgEventsPage>(db, `/events?${p.toString()}`, 15);
      const rows: EventRow[] = (res?.events ?? []).map(toEventRow).filter((r) => r.local_date);

      const [plans, seen, photos] = await Promise.all([
        rows.length
          ? db.rpc("_plan_items_by_seatgeek", { p_viewer: userId, p_ids: rows.map((r) => r.seatgeek_id) })
          : Promise.resolve({ data: [], error: null }),
        seenCounts(db, userId, rows.map((r) => r.artist)),
        artistImages(db, rows.map((r) => r.artist), false),
      ]);
      if (plans.error) throw plans.error;
      // deno-lint-ignore no-explicit-any
      const known = new Map<number, any>((plans.data ?? []).map((x: { seatgeek_id: number; item: unknown }) => [Number(x.seatgeek_id), x.item]));

      const results = rows.map((row) => {
        const item = known.get(row.seatgeek_id);
        const photo = photos.images.get(row.artist.toLowerCase());
        return {
          // Fresh SeatGeek data over what we saved (our id and images) when someone opened it before.
          event: {
            image_url: null, image_credit: null, venue_image_url: null, venue_image_credit: null,
            ...(item?.event ?? {}),
            ...row,
            ...(photo ? { image_url: photo.url, image_credit: photo.credit || null } : {}),
            id: item?.event?.id ?? null,
          },
          status: item?.status ?? null,
          note: item?.note ?? null,
          invited_by: item?.invited_by ?? null,
          crew: item?.crew ?? [],
          seen: seen.get(row.artist.toLowerCase()) ?? 0,
        };
      });
      const total = res?.meta?.total ?? 0;

      // An artist with nothing nearby: say how many shows they have anywhere in these dates.
      let elsewhere = 0;
      if (!total && performerId && p.has("lat") && !body.seen_only) {
        const any = new URLSearchParams(p);
        for (const k of ["lat", "lon", "range"]) any.delete(k);
        any.set("per_page", "1");
        any.set("page", "1");
        const all = await sgGet<SgEventsPage>(db, `/events?${any.toString()}`, 15);
        elsewhere = all?.meta?.total ?? 0;
      }
      return json({
        results, total, page, pages: Math.ceil(total / PER_PAGE), near, elsewhere, pending_images: photos.pending,
      });
    }

    case "images": {
      // Photos for the artists a search listed as pending (looked up now and cached).
      const names = (Array.isArray(body.names) ? body.names : [])
        .map((n: unknown) => clean(n)).filter((n: string | undefined): n is string => !!n).slice(0, PER_PAGE);
      const { images } = await artistImages(db, names, true);
      return json({
        images: Object.fromEntries([...images].map(([name, img]) => [name, { url: img.url, credit: img.credit || null }])),
      });
    }

    case "suggest": {
      const q = clean(body.q, 80);
      if (!q || q.length < 2) return json({ artists: [], venues: [] });
      const range = String(body.range ?? "50");
      if (!RANGES.has(range)) throw new HttpError(400, "Pick a distance of 25, 50, 100 or 250 miles, or anywhere.");
      const where = await resolveWhere(db, userId, body, range);

      const enc = encodeURIComponent(q);
      const venueGeo = where ? `&lat=${where.lat.toFixed(3)}&lon=${where.lng.toFixed(3)}&range=${range}mi` : "";
      const [performers, venues] = await Promise.all([
        sgGet<{ performers: SgPerformerHit[] }>(db, `/performers?q=${enc}&taxonomies.name=concert&per_page=10`, 60),
        sgGet<{ venues: SgVenueHit[] }>(db, `/venues?q=${enc}${venueGeo}&per_page=25`, 60),
      ]);
      const artists = (performers?.performers ?? [])
        .filter((a) => a.has_upcoming_events || (a.num_upcoming_events ?? 0) > 0)
        .slice(0, 5)
        .map((a) => ({ id: a.id, name: a.name, upcoming: a.num_upcoming_events ?? 0 }));
      // Also check the distance ourselves, in case SeatGeek loosens the range for a name match.
      const inRange = (v: SgVenueHit) => {
        if (!where) return true;
        const { lat, lon } = v.location ?? {};
        return lat != null && lon != null && km(where.lat, where.lng, lat, lon) <= where.miles * 1.609;
      };
      const places = (venues?.venues ?? [])
        .filter((v) => (v.has_upcoming_events || (v.num_upcoming_events ?? 0) > 0) && inRange(v))
        .slice(0, 5)
        .map((v) => ({
          id: v.id, name: v.name, city: v.city ?? null,
          state: v.state && /^[A-Z]{2}$/.test(v.state) ? v.state : null,
          upcoming: v.num_upcoming_events ?? 0,
        }));
      return json({ artists, venues: places });
    }

    case "event": {
      const ev = await saveEvent(db, seatgeekId(body.seatgeek_id), 30);
      return json(await planItem(db, userId, ev.id, ev.artist));
    }

    case "plan": {
      const status = body.status === null ? null : String(body.status);
      if (status !== null && !STATUSES.has(status)) throw new HttpError(400, "Pick going, interested or can't go.");
      const ev = await saveEvent(db, seatgeekId(body.seatgeek_id), 6 * 60);
      const eventId = ev.id;
      const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
      if (ev.local_date < yesterday) throw new HttpError(400, "That show has already happened. Log it instead.");

      if (status === null) {
        const { error } = await db.from("event_plans").delete().eq("event_id", eventId).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await db.from("event_plans")
          .upsert({ event_id: eventId, user_id: userId, status }, { onConflict: "event_id,user_id" });
        if (error) throw error;
      }
      return json(await planItem(db, userId, eventId, ev.artist));
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
});
