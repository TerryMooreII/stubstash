// Helpers for upcoming shows (SeatGeek events and plans). Pure functions,
// unit tested in upcoming.test.ts.
import { parseDate, place } from "./format";
import type { CrewMember, PlanItem, PlanStatus, UpcomingEvent, UpcomingSearchParams, UpcomingSuggestions } from "./types";

const DAY = 864e5;

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from today to the event's date (0 = today, negative = past). */
export function daysUntil(dateIso: string, now = new Date()): number {
  const today = parseDate(isoOf(now));
  return Math.round((parseDate(dateIso).getTime() - today.getTime()) / DAY);
}

/** "TONIGHT", "TOMORROW", "IN 12 DAYS", "LAST NIGHT", "PAST" */
export function countdown(dateIso: string, now = new Date()): string {
  const d = daysUntil(dateIso, now);
  if (d === 0) return "TONIGHT";
  if (d === 1) return "TOMORROW";
  if (d === -1) return "LAST NIGHT";
  if (d < 0) return "PAST";
  return `IN ${d} DAYS`;
}

/** "7:30 PM", or "" when the time isn't set. */
export function showTime(localTime: string | null | undefined): string {
  if (!localTime) return "";
  const [h, m] = localTime.split(":").map(Number);
  if (h === undefined || Number.isNaN(h)) return "";
  const hh = h % 12 || 12;
  return `${hh}:${String(m ?? 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Brooklyn, NY" */
export function eventPlace(e: Pick<UpcomingEvent, "city" | "state" | "country_code">): string {
  return place(e.city, e.state, e.country_code);
}

/** "from $45", or "" when SeatGeek has no listings. */
export function priceFrom(e: Pick<UpcomingEvent, "lowest_price">): string {
  return e.lowest_price ? `from $${Math.round(e.lowest_price)}` : "";
}

export const STATUS_LABEL: Record<PlanStatus, string> = {
  going: "GOING",
  interested: "INTERESTED",
  cant: "CAN'T GO",
  invited: "INVITED",
};

/** What a friend's status means, for the crew list. */
export const STATUS_SUB: Record<PlanStatus, string> = {
  going: "Going",
  interested: "Interested",
  cant: "Can't make it",
  invited: "Invited · no reply yet",
};

/** "Maya & Dev going · 1 interested", or "Just you so far". */
export function crewSummary(crew: Pick<CrewMember, "display_name" | "handle" | "status">[], max = 2): string {
  const first = (c: Pick<CrewMember, "display_name" | "handle">) => (c.display_name || c.handle).trim().split(/\s+/)[0];
  const going = crew.filter((c) => c.status === "going");
  const interested = crew.filter((c) => c.status === "interested").length;
  const invited = crew.filter((c) => c.status === "invited").length;
  const parts: string[] = [];
  if (going.length) {
    const names = going.slice(0, max).map(first);
    const more = going.length - names.length;
    parts.push(`${names.join(" & ")}${more > 0 ? ` +${more}` : ""} going`);
  }
  if (interested) parts.push(`${interested} interested`);
  if (invited) parts.push(`${invited} invited`);
  return parts.join(" · ") || "Just you so far";
}

/** Friday to Sunday of this weekend (from today if it's already the weekend). */
export function weekendRange(now = new Date()): { from: string; to: string } {
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const start = new Date(now);
  if (day >= 1 && day <= 4) start.setDate(now.getDate() + (5 - day));
  const end = new Date(now);
  end.setDate(now.getDate() + (day === 0 ? 0 : 7 - day));
  return { from: isoOf(start), to: isoOf(end) };
}

/** Today through `days` from now. */
export function nextDays(days: number, now = new Date()): { from: string; to: string } {
  const end = new Date(now);
  end.setDate(now.getDate() + days);
  return { from: isoOf(now), to: isoOf(end) };
}

/** setlist.fm search for the night of a past event (used for "log this show"). */
export function logQuery(e: Pick<UpcomingEvent, "artist" | "local_date" | "city">): Record<string, string> {
  const q: Record<string, string> = { find: "1", artist: e.artist, date: e.local_date };
  if (e.city) q.city = e.city;
  return q;
}

/** Replaces one event in a list (matched by SeatGeek id), e.g. after changing a plan. */
export function replaceItem(list: PlanItem[], next: PlanItem): PlanItem[] {
  return list.map((x) => (x.event.seatgeek_id === next.event.seatgeek_id ? { ...next, seen: next.seen ?? x.seen } : x));
}

// ---------------------------------------------------------------- search filters
//
// Find shows = the search box (free text, or an artist/venue picked from the
// suggestions) + where (a city, default home, and a distance) + when + which shows.

export type Range = NonNullable<UpcomingSearchParams["range"]>;
export const RANGES: { value: Range; label: string }[] = [
  { value: "25", label: "25 mi" },
  { value: "50", label: "50 mi" },
  { value: "100", label: "100 mi" },
  { value: "250", label: "250 mi" },
  { value: "any", label: "Anywhere" },
];

/** Which shows: everything on SeatGeek, your friends' plans, or artists you've seen. */
export type ShowFilter = "all" | "friends" | "seen";
export const SHOW_FILTERS: { value: ShowFilter; label: string }[] = [
  { value: "all", label: "All shows" },
  { value: "friends", label: "Friends going" },
  { value: "seen", label: "Artists you've seen" },
];

export type When = "6mo" | "month" | "weekend" | "custom";
export const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: "6mo", label: "Next 6 months" },
  { value: "month", label: "Next 30 days" },
  { value: "weekend", label: "This weekend" },
  { value: "custom", label: "Pick dates" },
];

/** An artist or venue picked from the search suggestions (matched by SeatGeek id). */
export type SearchPick =
  | { kind: "artist"; id: number; name: string }
  | { kind: "venue"; id: number; name: string; place: string };

export interface UpcomingFilters {
  pick: SearchPick | null;
  /** Search around this place; null = your home. */
  place: { label: string; lat: number; lng: number } | null;
  range: Range;
  when: When;
  /** Only used when `when` is "custom". */
  from: string;
  to: string;
}

export const emptyUpcomingFilters = (): UpcomingFilters =>
  ({ pick: null, place: null, range: "50", when: "6mo", from: "", to: "" });

/** The date range to search, or {} for the default (today to 6 months out). */
export function whenRange(f: Pick<UpcomingFilters, "when" | "from" | "to">, now = new Date()): { from?: string; to?: string } {
  if (f.when === "weekend") return weekendRange(now);
  if (f.when === "month") return nextDays(30, now);
  if (f.when === "custom") {
    const out: { from?: string; to?: string } = {};
    if (f.from) out.from = f.from;
    if (f.to) out.to = f.to;
    return out;
  }
  return {};
}

/** Search request for the box text, the show filter and the filters. */
export function searchParams(q: string, show: ShowFilter, f: UpcomingFilters, now = new Date()): UpcomingSearchParams {
  const p: UpcomingSearchParams = { range: f.range, ...whenRange(f, now) };
  if (show === "seen") return { ...p, seen_only: true, ...placeParams(f) };
  if (f.pick?.kind === "venue") return { ...p, venue_id: f.pick.id };
  if (f.pick?.kind === "artist") p.performer_id = f.pick.id;
  else if (q.trim()) p.q = q.trim();
  return { ...p, ...placeParams(f) };
}

function placeParams(f: UpcomingFilters) {
  return f.place ? { lat: f.place.lat, lng: f.place.lng, place_label: f.place.label } : {};
}

/** The where part of a search (place or home, and distance), e.g. to keep venue suggestions local. */
export function whereParams(f: UpcomingFilters): Pick<UpcomingSearchParams, "range" | "lat" | "lng" | "place_label"> {
  return { range: f.range, ...placeParams(f) };
}

/** "Within 50 mi of Columbus, OH", "Anywhere", or "At Red Rocks". */
export function whereLabel(f: UpcomingFilters, homeCity: string | null | undefined): string {
  if (f.pick?.kind === "venue") return `At ${f.pick.name}`;
  if (f.range === "any") return "Anywhere";
  const city = f.place?.label ?? homeCity;
  return city ? `Within ${f.range} mi of ${city}` : "Anywhere";
}

/** Short label for the where button: "Columbus, OH · 50 mi" or "Anywhere". */
export function whereShort(f: UpcomingFilters, homeCity: string | null | undefined): string {
  if (f.range === "any") return "Anywhere";
  const city = f.place?.label ?? homeCity;
  if (!city) return "Anywhere";
  return `${city.split(",")[0]} · ${f.range} mi`;
}

const shortDay = (iso: string) => parseDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Next 6 months", "This weekend", "Nov 3 – Dec 1", "From Nov 3". */
export function whenLabel(f: Pick<UpcomingFilters, "when" | "from" | "to">): string {
  if (f.when !== "custom" || (!f.from && !f.to)) {
    return WHEN_OPTIONS.find((o) => o.value === (f.when === "custom" ? "6mo" : f.when))!.label;
  }
  if (f.from && f.to) return `${shortDay(f.from)} – ${shortDay(f.to)}`;
  return f.from ? `From ${shortDay(f.from)}` : `Until ${shortDay(f.to)}`;
}

// ---------------------------------------------------------------- search in the URL
//
// The last search run is kept in the query string so refresh, back and shared
// links bring it back. Defaults are left out:
//   ?q=phish  ?artist=123&name=Phish  ?venue=45&name=Red+Rocks&at=Morrison,+CO
//   &near=Columbus,+OH&lat=39.9612&lng=-82.9988  &range=100
//   &when=month|weekend|custom&from=2026-12-01&to=2026-12-31  &show=friends|seen

export interface UpcomingSearchState {
  q: string;
  show: ShowFilter;
  filters: UpcomingFilters;
}

/** Query keys the search owns (others, like ?tab=, are left alone). */
export const SEARCH_QUERY_KEYS = ["q", "artist", "venue", "name", "at", "near", "lat", "lng", "range", "when", "from", "to", "show"] as const;

type Query = Record<string, unknown>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function str(query: Query, key: string): string {
  const v = Array.isArray(query[key]) ? (query[key] as unknown[])[0] : query[key];
  return typeof v === "string" ? v.trim() : "";
}

function finite(s: string): number | null {
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** True when the URL has any search in it. */
export function hasSearchQuery(query: Query): boolean {
  return SEARCH_QUERY_KEYS.some((k) => str(query, k));
}

/** The search in a URL query; anything missing or invalid falls back to the default. */
export function searchFromQuery(query: Query): UpcomingSearchState {
  const filters = emptyUpcomingFilters();
  const name = str(query, "name").slice(0, 120);
  const artist = finite(str(query, "artist"));
  const venue = finite(str(query, "venue"));
  if (venue && Number.isInteger(venue) && venue > 0 && name) {
    filters.pick = { kind: "venue", id: venue, name, place: str(query, "at").slice(0, 120) };
  } else if (artist && Number.isInteger(artist) && artist > 0 && name) {
    filters.pick = { kind: "artist", id: artist, name };
  }
  const lat = finite(str(query, "lat"));
  const lng = finite(str(query, "lng"));
  const near = str(query, "near").slice(0, 120);
  if (near && lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    filters.place = { label: near, lat, lng };
  }
  const range = str(query, "range");
  if (RANGES.some((r) => r.value === range)) filters.range = range as Range;
  const when = str(query, "when");
  if (WHEN_OPTIONS.some((o) => o.value === when)) filters.when = when as When;
  if (filters.when === "custom") {
    const from = str(query, "from");
    const to = str(query, "to");
    if (ISO.test(from)) filters.from = from;
    if (ISO.test(to)) filters.to = to;
  }
  const show = str(query, "show");
  return {
    q: filters.pick ? "" : str(query, "q").slice(0, 120),
    show: SHOW_FILTERS.some((s) => s.value === show) ? (show as ShowFilter) : "all",
    filters,
  };
}

/** The query string for a search (defaults left out). */
export function searchToQuery({ q, show, filters: f }: UpcomingSearchState): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.pick) {
    out[f.pick.kind] = String(f.pick.id);
    out.name = f.pick.name;
    if (f.pick.kind === "venue" && f.pick.place) out.at = f.pick.place;
  } else if (q.trim()) {
    out.q = q.trim();
  }
  if (f.place) {
    out.near = f.place.label;
    out.lat = f.place.lat.toFixed(4);
    out.lng = f.place.lng.toFixed(4);
  }
  if (f.range !== "50") out.range = f.range;
  if (f.when !== "6mo") out.when = f.when;
  if (f.when === "custom") {
    if (f.from) out.from = f.from;
    if (f.to) out.to = f.to;
  }
  if (show !== "all") out.show = show;
  return out;
}

/** A stable key for comparing two searches. */
export const searchKey = (s: UpcomingSearchState): string => new URLSearchParams(searchToQuery(s)).toString();

/** The default search (what a clean /app/upcoming runs). */
export const defaultSearch = (): UpcomingSearchState => ({ q: "", show: "all", filters: emptyUpcomingFilters() });

/**
 * The SeatGeek venue (from suggestions) that is this event's venue: same name,
 * and same city when both say. Names come from SeatGeek on both sides, so an
 * exact match (ignoring case and punctuation) is reliable.
 */
export function matchVenue(
  venues: UpcomingSuggestions["venues"],
  e: Pick<UpcomingEvent, "venue_name" | "city">,
): UpcomingSuggestions["venues"][number] | null {
  const simple = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const name = simple(e.venue_name);
  const city = simple(e.city);
  return venues.find((v) => simple(v.name) === name && (!city || !v.city || simple(v.city) === city)) ?? null;
}

/**
 * A search for an event's venue: the venue picked (as if chosen from the
 * suggestions) with its city, state as the place, keeping the dates. Without
 * a resolved venue it falls back to the venue name as text around its city.
 */
export function venueSearch(
  e: Pick<UpcomingEvent, "venue_name" | "city" | "state" | "country_code" | "lat" | "lng">,
  base: UpcomingSearchState = defaultSearch(),
  venueId: number | null = null,
): UpcomingSearchState {
  const here = citySearch(e, base);
  const filters = here ? { ...here.filters, pick: null } : { ...base.filters, pick: null };
  const show = base.show === "seen" ? "all" : base.show;
  if (venueId) {
    return { q: "", show, filters: { ...filters, pick: { kind: "venue", id: venueId, name: e.venue_name, place: eventPlace(e) } } };
  }
  return { q: e.venue_name, show, filters };
}

/**
 * A search around an event's city (at the venue's pin), like picking the city in
 * the search box: keeps a picked artist and the dates. Null without a city and pin.
 */
export function citySearch(
  e: Pick<UpcomingEvent, "city" | "state" | "country_code" | "lat" | "lng">,
  base: UpcomingSearchState = defaultSearch(),
): UpcomingSearchState | null {
  if (!e.city || e.lat == null || e.lng == null) return null;
  const f = base.filters;
  return {
    q: f.pick ? "" : base.q,
    show: base.show === "seen" ? "all" : base.show,
    filters: {
      ...f,
      pick: f.pick?.kind === "venue" ? null : f.pick,
      place: { label: eventPlace(e), lat: e.lat, lng: e.lng },
      range: f.range === "any" ? "50" : f.range,
    },
  };
}
