// Helpers for upcoming shows (SeatGeek events and plans). Pure functions,
// unit tested in upcoming.test.ts.
import { parseDate, place } from "./format";
import type { CrewMember, PlanItem, PlanStatus, UpcomingEvent, UpcomingSearchParams } from "./types";

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
