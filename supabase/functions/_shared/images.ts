// Free image and place lookups shared by the enrich job and the seatgeek function.
// Artists: Deezer. Venues: Wikidata (coordinates, photo, capacity) with
// Wikipedia's lead image as a fallback.

import { contactUrl } from "./http.ts";

export const UA = `Stubstash/1.0 (+${contactUrl()})`;
/** How far (km) a venue match may be from where we expect it. */
export const MAX_KM = 45;

export interface Img { url: string; source: string; credit: string }

export async function getJson(url: string, headers: Record<string, string> = {}): Promise<any | null> {
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

export function commonsUrl(file: string, width = 1000): string {
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

export function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const x = Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

// ---------- artists ----------

/** First choice: widest coverage, good square photos. Skips Deezer's blank default picture. */
export async function deezer(name: string): Promise<Img | null> {
  const d = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`);
  const hit = (d?.data ?? []).find((a: any) => norm(a.name ?? "") === norm(name));
  const url: string | undefined = hit?.picture_xl;
  if (!url || url.includes("/artist//")) return null;
  return { url, source: "Deezer", credit: "Image via Deezer" };
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

export interface WdVenue { qid: string; lat: number; lng: number; img: Img | null; capacity: number | null }

/** Lead image of the English Wikipedia article (free images only). */
export async function wikipediaImage(title: string): Promise<Img | null> {
  const d = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&pilicense=free&titles=${encodeURIComponent(title)}`,
  );
  const page: any = Object.values(d?.query?.pages ?? {})[0];
  const file: string | undefined = page?.pageimage;
  return file ? { url: commonsUrl(file), source: "Wikimedia Commons", credit: `Wikimedia Commons: ${file}` } : null;
}

export async function wdEntities(ids: string[]): Promise<Record<string, any>> {
  if (!ids.length) return {};
  const d = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|sitelinks&sitefilter=enwiki&ids=${ids.join("|")}`,
  );
  return d?.entities ?? {};
}

export async function wdDetails(qid: string, e: any): Promise<WdVenue | null> {
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
export async function wikidataVenue(names: string[], near: { lat: number; lng: number }, maxKm = MAX_KM): Promise<WdVenue | null> {
  for (const name of names) {
    const s = await getJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=7&search=${encodeURIComponent(name)}`,
    );
    const ids: string[] = (s?.search ?? []).map((r: any) => r.id).filter((id: string) => /^Q\d+$/.test(id));
    const ents = await wdEntities(ids);
    for (const id of ids) {
      const coord = ents[id]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
      if (coord && km(near.lat, near.lng, coord.latitude, coord.longitude) <= maxKm) return wdDetails(id, ents[id]);
    }
  }
  return null;
}

export async function wikidataById(qid: string): Promise<WdVenue | null> {
  const ents = await wdEntities([qid]);
  return ents[qid] ? wdDetails(qid, ents[qid]) : null;
}
