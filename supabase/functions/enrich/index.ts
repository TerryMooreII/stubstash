// Background job (pg_cron every 2 min): fills in artist images/genres and
// venue coordinates/images/capacity from free public sources.
//
// Artists: Deezer (best coverage and photo quality) -> MusicBrainz id (looked
//          up by name if missing) -> fanart.tv -> TheAudioDB -> Wikidata/Commons
// Venues:  city centre (Open-Meteo) -> Wikidata (coords, image, capacity) ->
//          Photon -> Nominatim; images from Wikidata or Wikipedia's lead image
//
// Called with the x-cron-secret header. Each run handles a small batch so it
// stays inside MusicBrainz's and Nominatim's 1 request/second policies.

import { HttpError, isCron, json, serve, sleep } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

const ARTIST_BATCH = 8;
const VENUE_BATCH = 6;
const UA = `Stubstash/1.0 (+${Deno.env.get("CONTACT_EMAIL") ?? "https://stubstash.terrymooreii.dev"})`;
/** How far (km) a venue match may be from setlist.fm's city centre. */
const MAX_KM = 45;

type Db = ReturnType<typeof adminClient>;
interface Img { url: string; source: string; credit: string }

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers } });
    if (!res.ok) {
      console.warn("lookup failed", res.status, new URL(url).host);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("lookup error", new URL(url).host, String(err));
    return null;
  }
}

/** Per-host spacing so we respect "1 request per second" policies. */
const lastCall: Record<string, number> = {};
async function polite(host: string, gapMs = 1100) {
  const wait = (lastCall[host] ?? 0) + gapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall[host] = Date.now();
}

function commonsUrl(file: string, width = 1000): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

/** "The SteelDrivers" and "Steeldrivers" compare equal. */
export function norm(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const x = Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

// ---------- artists ----------

async function musicbrainzId(name: string): Promise<string | null> {
  await polite("musicbrainz");
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  const d = await getJson(`https://musicbrainz.org/ws/2/artist?query=${q}&fmt=json&limit=5`);
  const hit = (d?.artists ?? []).find((a: any) => (a.score ?? 0) >= 90 && norm(a.name) === norm(name));
  return hit?.id ?? null;
}

async function fanart(mbid: string): Promise<Img | null> {
  const key = Deno.env.get("FANART_API_KEY");
  if (!key) return null;
  const d = await getJson(`https://webservice.fanart.tv/v3/music/${mbid}?api_key=${key}`);
  const pick = d?.artistthumb?.[0] ?? d?.artistbackground?.[0];
  return pick?.url ? { url: pick.url, source: "fanart.tv", credit: "Image via fanart.tv" } : null;
}

async function audioDb(mbid: string | null, name: string): Promise<{ img: Img | null; genre: string | null }> {
  const key = Deno.env.get("THEAUDIODB_API_KEY") ?? "123";
  const base = `https://www.theaudiodb.com/api/v1/json/${key}`;
  let a = mbid ? (await getJson(`${base}/artist-mb.php?i=${mbid}`))?.artists?.[0] : null;
  if (!a) {
    // A name search can return the wrong band; only trust matching names.
    const hit = (await getJson(`${base}/search.php?s=${encodeURIComponent(name)}`))?.artists?.[0];
    if (hit && norm(hit.strArtist ?? "") === norm(name)) a = hit;
  }
  if (!a) return { img: null, genre: null };
  const thumb = a.strArtistThumb || a.strArtistFanart;
  return {
    img: thumb ? { url: thumb, source: "TheAudioDB", credit: "Image via TheAudioDB" } : null,
    genre: a.strGenre || a.strStyle || null,
  };
}

async function wikidataArtist(mbid: string): Promise<Img | null> {
  const q = `SELECT ?img WHERE { ?a wdt:P434 "${mbid}" . ?a wdt:P18 ?img . } LIMIT 1`;
  const d = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`,
    { Accept: "application/sparql-results+json" });
  const v: string | undefined = d?.results?.bindings?.[0]?.img?.value;
  if (!v) return null;
  const file = decodeURIComponent(v.split("/").pop() ?? "");
  return { url: commonsUrl(file), source: "Wikimedia Commons", credit: `Wikimedia Commons: ${file}` };
}

/** First choice: widest coverage, good square photos. Skips Deezer's blank default picture. */
async function deezer(name: string): Promise<Img | null> {
  const d = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`);
  const hit = (d?.data ?? []).find((a: any) => norm(a.name ?? "") === norm(name));
  const url: string | undefined = hit?.picture_xl;
  if (!url || url.includes("/artist//")) return null;
  return { url, source: "Deezer", credit: "Image via Deezer" };
}

async function enrichArtists(db: Db) {
  const { data: rows } = await db.from("artists").select("id, mbid, name")
    .is("image_checked_at", null).order("created_at").limit(ARTIST_BATCH);
  let done = 0;
  for (const a of rows ?? []) {
    const update: Record<string, unknown> = { image_checked_at: new Date().toISOString() };
    let mbid: string | null = a.mbid;
    if (!mbid) {
      mbid = await musicbrainzId(a.name);
      if (mbid) {
        // mbid is unique: only store it if no other artist row already has it.
        const { data: taken } = await db.from("artists").select("id").eq("mbid", mbid).maybeSingle();
        if (!taken) update.mbid = mbid;
      }
    }
    let img: Img | null = await deezer(a.name);
    if (!img && mbid) img = await fanart(mbid);
    const adb = await audioDb(mbid, a.name); // also our genre source
    img ??= adb.img;
    if (!img && mbid) img = await wikidataArtist(mbid);
    Object.assign(update, {
      image_url: img?.url ?? null, image_source: img?.source ?? null, image_credit: img?.credit ?? null,
      genre: adb.genre,
    });
    await db.from("artists").update(update).eq("id", a.id);
    done++;
  }
  return done;
}

// ---------- venues ----------

/**
 * Search names to try for a venue, most specific first:
 *   "ACL Live at The Moody Theater" -> [full, "The Moody Theater", "Moody Theater"]
 *   "Red Rocks Amphitheatre (Morrison)" -> [full, "Red Rocks Amphitheatre"]
 */
export function nameVariants(name: string): string[] {
  const out = [name.trim()];
  const add = (s: string) => {
    const t = s.trim();
    if (t.length >= 3 && !out.includes(t)) out.push(t);
  };
  const noParens = name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  add(noParens);
  const at = noParens.match(/\bat\s+(.+)$/i);
  if (at) add(at[1]!);
  const base = at ? at[1]! : noParens;
  add(base.replace(/^the\s+/i, ""));
  return out.slice(0, 3);
}

/** City centre from Open-Meteo's free geocoder. "Winston-Salem, NC" -> Winston-Salem. */
async function cityCentre(v: any): Promise<{ lat: number; lng: number } | null> {
  const city = String(v.city ?? "").split(",")[0]!.trim();
  if (!city) return null;
  const d = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en`);
  let list: any[] = d?.results ?? [];
  if (v.country_code) list = list.filter((r) => r.country_code === String(v.country_code).toUpperCase());
  const state = String(v.state ?? "").toLowerCase();
  const pick = (state && list.find((r) => String(r.admin1 ?? "").toLowerCase() === state)) || list[0];
  return pick ? { lat: pick.latitude, lng: pick.longitude } : null;
}

interface WdVenue { qid: string; lat: number; lng: number; img: Img | null; capacity: number | null }

/** Lead image of the English Wikipedia article (free images only). */
async function wikipediaImage(title: string): Promise<Img | null> {
  const d = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&pilicense=free&titles=${encodeURIComponent(title)}`,
  );
  const page: any = Object.values(d?.query?.pages ?? {})[0];
  const file: string | undefined = page?.pageimage;
  return file ? { url: commonsUrl(file), source: "Wikimedia Commons", credit: `Wikimedia Commons: ${file}` } : null;
}

async function wdEntities(ids: string[]): Promise<Record<string, any>> {
  if (!ids.length) return {};
  const d = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|sitelinks&sitefilter=enwiki&ids=${ids.join("|")}`,
  );
  return d?.entities ?? {};
}

async function wdDetails(qid: string, e: any): Promise<WdVenue | null> {
  const c = e?.claims ?? {};
  const coord = c.P625?.[0]?.mainsnak?.datavalue?.value;
  const file: string | undefined = c.P18?.[0]?.mainsnak?.datavalue?.value;
  const capRaw = c.P1083?.[0]?.mainsnak?.datavalue?.value?.amount;
  let img: Img | null = file ? { url: commonsUrl(file), source: "Wikimedia Commons", credit: `Wikimedia Commons: ${file}` } : null;
  const wiki: string | undefined = e?.sitelinks?.enwiki?.title;
  if (!img && wiki) img = await wikipediaImage(wiki);
  return {
    qid,
    lat: coord?.latitude, lng: coord?.longitude,
    img,
    capacity: capRaw ? Math.round(Math.abs(Number(capRaw))) || null : null,
  };
}

/** Wikidata item for the venue: name search, then keep the one whose coordinates are near the city. */
async function wikidataVenue(names: string[], near: { lat: number; lng: number }): Promise<WdVenue | null> {
  for (const name of names) {
    const s = await getJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=7&search=${encodeURIComponent(name)}`,
    );
    const ids: string[] = (s?.search ?? []).map((r: any) => r.id).filter((id: string) => /^Q\d+$/.test(id));
    const ents = await wdEntities(ids);
    for (const id of ids) {
      const coord = ents[id]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
      if (coord && km(near.lat, near.lng, coord.latitude, coord.longitude) <= MAX_KM) return wdDetails(id, ents[id]);
    }
  }
  return null;
}

async function wikidataById(qid: string): Promise<WdVenue | null> {
  const ents = await wdEntities([qid]);
  return ents[qid] ? wdDetails(qid, ents[qid]) : null;
}

interface GeoHit { lat: number; lng: number; qid: string | null; source: "photon" | "nominatim" }

/** Photon (komoot's OSM geocoder). Ignores matches that are just a city or street. */
async function photon(names: string[], v: any, near: { lat: number; lng: number }): Promise<GeoHit | null> {
  for (const name of names) {
    const q = encodeURIComponent(`${name}, ${String(v.city ?? "").split(",")[0]}`);
    const d = await getJson(`https://photon.komoot.io/api/?q=${q}&limit=5&lat=${near.lat}&lon=${near.lng}`);
    for (const f of d?.features ?? []) {
      const p = f.properties ?? {};
      if (["place", "highway", "boundary"].includes(p.osm_key)) continue;
      const [lng, lat] = f.geometry?.coordinates ?? [];
      if (lat == null || km(near.lat, near.lng, lat, lng) > MAX_KM) continue;
      const qid = p.extra?.wikidata;
      return { lat, lng, qid: /^Q\d+$/.test(qid ?? "") ? qid : null, source: "photon" };
    }
  }
  return null;
}

async function nominatim(name: string, v: any, near: { lat: number; lng: number }): Promise<GeoHit | null> {
  await polite("nominatim");
  const q = encodeURIComponent(`${name}, ${v.city ?? ""}`);
  const d = await getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&extratags=1&q=${q}`);
  const hit = Array.isArray(d) ? d[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat), lng = Number(hit.lon);
  if (km(near.lat, near.lng, lat, lng) > MAX_KM || hit.addresstype === "city") return null;
  const qid = hit.extratags?.wikidata;
  return { lat, lng, qid: /^Q\d+$/.test(qid ?? "") ? qid : null, source: "nominatim" };
}

async function enrichVenues(db: Db) {
  const { data: rows } = await db.from("venues")
    .select("id, name, city, state, country_code, city_lat, city_lng, lat, lng, geo_source, wikidata_id")
    .or("geo_checked_at.is.null,image_checked_at.is.null")
    .order("created_at").limit(VENUE_BATCH);
  let done = 0;
  for (const v of rows ?? []) {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { geo_checked_at: now, image_checked_at: now };

    let near = v.city_lat != null && v.city_lng != null ? { lat: v.city_lat, lng: v.city_lng } : null;
    if (!near) {
      near = await cityCentre(v);
      if (near) Object.assign(update, { city_lat: near.lat, city_lng: near.lng });
    }

    const names = nameVariants(v.name);
    let wd: WdVenue | null = null;
    let geo: GeoHit | null = null;
    if (v.wikidata_id) wd = await wikidataById(v.wikidata_id);
    if (!wd && near) wd = await wikidataVenue(names, near);
    if ((!wd || wd.lat == null) && near) {
      geo = await photon(names, v, near);
      geo ??= await nominatim(names[0]!, v, near);
      if (!wd && geo?.qid) wd = await wikidataById(geo.qid);
    }

    const keepPin = v.geo_source === "user";
    if (!keepPin) {
      if (wd?.lat != null) Object.assign(update, { lat: wd.lat, lng: wd.lng, geo_source: "wikidata" });
      else if (geo) Object.assign(update, { lat: geo.lat, lng: geo.lng, geo_source: geo.source });
      else if (near) update.geo_source = "city";
    }
    if (wd) {
      update.wikidata_id = wd.qid;
      if (wd.img) Object.assign(update, { image_url: wd.img.url, image_source: wd.img.source, image_credit: wd.img.credit });
      if (wd.capacity) update.capacity = wd.capacity;
    }

    await db.from("venues").update(update).eq("id", v.id);
    done++;
  }
  return done;
}

serve(async (req) => {
  const db = adminClient();
  if (!(await isCron(req, db))) throw new HttpError(401, "Not allowed.");
  const artists = await enrichArtists(db);
  const venues = await enrichVenues(db);
  return json({ artists, venues });
});
