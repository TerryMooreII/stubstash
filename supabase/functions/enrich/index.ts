// Background job (pg_cron every 2 min): fills in artist images/genres and
// venue coordinates/images/capacity from free public sources.
//
// Artists: fanart.tv -> TheAudioDB -> Wikidata/Wikimedia Commons (by MusicBrainz id)
// Venues:  OpenStreetMap Nominatim (with Wikidata tag) -> Wikidata image + capacity
//
// Called with the x-cron-secret header. Each run handles a small batch so it
// stays well inside Nominatim's 1 request/second policy.

import { HttpError, isCron, json, serve, sleep } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

const ARTIST_BATCH = 8;
const VENUE_BATCH = 8;
const UA = `Stubstash/1.0 (+${Deno.env.get("CONTACT_EMAIL") ?? "https://stubstash.terrymooreii.dev"})`;

interface Img { url: string; source: string; credit: string }

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function commonsUrl(file: string, width = 1000): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

// ---------- artists ----------

async function fanart(mbid: string): Promise<Img | null> {
  const key = Deno.env.get("FANART_API_KEY");
  if (!key) return null;
  const d = await getJson(`https://webservice.fanart.tv/v3/music/${mbid}?api_key=${key}`);
  const pick = d?.artistthumb?.[0] ?? d?.artistbackground?.[0];
  return pick?.url ? { url: pick.url, source: "fanart.tv", credit: "Image via fanart.tv" } : null;
}

async function audioDb(mbid: string | null, name: string): Promise<{ img: Img | null; genre: string | null }> {
  const key = Deno.env.get("THEAUDIODB_API_KEY") ?? "123";
  const url = mbid
    ? `https://www.theaudiodb.com/api/v1/json/${key}/artist-mb.php?i=${mbid}`
    : `https://www.theaudiodb.com/api/v1/json/${key}/search.php?s=${encodeURIComponent(name)}`;
  const d = await getJson(url);
  const a = d?.artists?.[0];
  if (!a) return { img: null, genre: null };
  // A name search can return the wrong band; only trust exact name matches.
  if (!mbid && a.strArtist?.toLowerCase() !== name.toLowerCase()) return { img: null, genre: null };
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

async function enrichArtists(db: ReturnType<typeof adminClient>) {
  const { data: rows } = await db.from("artists").select("id, mbid, name")
    .is("image_checked_at", null).order("created_at").limit(ARTIST_BATCH);
  let done = 0;
  for (const a of rows ?? []) {
    let img: Img | null = null;
    let genre: string | null = null;
    if (a.mbid) img = await fanart(a.mbid);
    const adb = await audioDb(a.mbid, a.name);
    genre = adb.genre;
    img ??= adb.img;
    if (!img && a.mbid) img = await wikidataArtist(a.mbid);
    await db.from("artists").update({
      image_url: img?.url ?? null, image_source: img?.source ?? null, image_credit: img?.credit ?? null,
      genre, image_checked_at: new Date().toISOString(),
    }).eq("id", a.id);
    done++;
  }
  return done;
}

// ---------- venues ----------

let lastNominatim = 0;
async function nominatim(q: string): Promise<any | null> {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastNominatim = Date.now();
  const d = await getJson(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&extratags=1&q=${encodeURIComponent(q)}`,
  );
  return Array.isArray(d) && d.length ? d[0] : null;
}

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

async function wikidataVenue(qid: string): Promise<{ img: Img | null; capacity: number | null }> {
  const d = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const claims = d?.entities?.[qid]?.claims ?? {};
  const file: string | undefined = claims.P18?.[0]?.mainsnak?.datavalue?.value;
  const capRaw = claims.P1083?.[0]?.mainsnak?.datavalue?.value?.amount;
  const capacity = capRaw ? Math.round(Math.abs(Number(capRaw))) || null : null;
  return {
    img: file ? { url: commonsUrl(file), source: "Wikimedia Commons", credit: `Wikimedia Commons: ${file}` } : null,
    capacity,
  };
}

async function enrichVenues(db: ReturnType<typeof adminClient>) {
  const { data: rows } = await db.from("venues")
    .select("id, name, city, state, country_name, country_code, city_lat, city_lng, geo_source")
    .or("geo_checked_at.is.null,image_checked_at.is.null")
    .order("created_at").limit(VENUE_BATCH);
  let done = 0;
  for (const v of rows ?? []) {
    const place = [v.city, v.state, v.country_name ?? v.country_code].filter(Boolean).join(", ");
    const update: Record<string, unknown> = {
      geo_checked_at: new Date().toISOString(),
      image_checked_at: new Date().toISOString(),
    };

    // Try the full name first, then simpler variants (max 3 lookups per venue).
    let hit: any = null;
    for (const name of nameVariants(v.name)) {
      const where = v.city ? `${name}, ${v.city}` : `${name}, ${place}`;
      hit = await nominatim(where);
      // Reject matches that landed far from setlist.fm's city (wrong "Fillmore", etc.)
      if (hit && v.city_lat != null && v.city_lng != null) {
        const dLat = Math.abs(Number(hit.lat) - v.city_lat), dLng = Math.abs(Number(hit.lon) - v.city_lng);
        if (dLat > 0.6 || dLng > 0.8) hit = null;
      }
      if (hit) break;
    }

    if (hit && v.geo_source !== "user") {
      update.lat = Number(hit.lat);
      update.lng = Number(hit.lon);
      update.geo_source = "nominatim";
      const qid: string | undefined = hit.extratags?.wikidata;
      if (qid && /^Q\d+$/.test(qid)) {
        update.wikidata_id = qid;
        const wd = await wikidataVenue(qid);
        if (wd.img) Object.assign(update, { image_url: wd.img.url, image_source: wd.img.source, image_credit: wd.img.credit });
        if (wd.capacity) update.capacity = wd.capacity;
      }
    } else if (v.city_lat == null && place) {
      // Manual venue with no coordinates at all: fall back to the city centre.
      const cityHit = await nominatim(place);
      if (cityHit) Object.assign(update, { city_lat: Number(cityHit.lat), city_lng: Number(cityHit.lon), geo_source: "city" });
    } else if (v.geo_source === "none") {
      update.geo_source = "city";
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
