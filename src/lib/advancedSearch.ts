// Filters for the "find an older show" setlist.fm search, and how they map to
// the API request and the page URL (so back/refresh keep the search).
import type { LocationQuery } from "vue-router";
import type { SetlistSearchParams } from "./types";

export interface AdvancedFilters {
  artist: string;
  artist_mbid: string;
  year: string;
  date: string;
  venue: string;
  city: string;
  state: string;
  country: string;
  tour: string;
}

const KEYS: (keyof AdvancedFilters)[] = ["artist", "artist_mbid", "year", "date", "venue", "city", "state", "country", "tour"];

export const emptyFilters = (): AdvancedFilters => ({
  artist: "", artist_mbid: "", year: "", date: "", venue: "", city: "", state: "", country: "", tour: "",
});

/** True when setlist.fm has something to search on (a year or date alone isn't enough). */
export function hasWhere(f: AdvancedFilters): boolean {
  return !!(f.artist.trim() || f.artist_mbid || f.venue.trim() || f.city.trim() || f.tour.trim() || f.state.trim() || f.country);
}

export function toParams(f: AdvancedFilters): SetlistSearchParams {
  const p: SetlistSearchParams = {};
  for (const k of KEYS) {
    const v = f[k].trim();
    if (v) p[k] = v;
  }
  if (p.date) delete p.year; // an exact date wins
  if (p.artist_mbid) delete p.artist; // exact artist wins over the name
  return p;
}

/** Page URL query for these filters (empty values left out). */
export function toQuery(f: AdvancedFilters): Record<string, string> {
  const q: Record<string, string> = { find: "1" };
  for (const k of KEYS) if (f[k].trim()) q[k] = f[k].trim();
  return q;
}

export function fromQuery(q: LocationQuery): AdvancedFilters {
  const f = emptyFilters();
  for (const k of KEYS) {
    const v = q[k];
    if (typeof v === "string") f[k] = v.slice(0, 120);
  }
  return f;
}

/** Short summary of active filters, e.g. "Phish · 1997 · Red Rocks". */
export function describe(f: AdvancedFilters): string {
  const where = [f.venue, f.city, f.state, f.country].map((s) => s.trim()).filter(Boolean).join(", ");
  return [f.artist.trim(), f.date || f.year, where, f.tour.trim()].filter(Boolean).join(" · ");
}
