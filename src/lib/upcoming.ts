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

export type Range = NonNullable<UpcomingSearchParams["range"]>;
export const RANGES: { value: Range; label: string }[] = [
  { value: "25", label: "25 mi" },
  { value: "50", label: "50 mi" },
  { value: "100", label: "100 mi" },
  { value: "250", label: "250 mi" },
  { value: "any", label: "Anywhere" },
];

/** Quick filters above the results. */
export type QuickFilter = "all" | "weekend" | "month" | "friends" | "seen";
export const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "Near you" },
  { value: "weekend", label: "This weekend" },
  { value: "month", label: "This month" },
  { value: "friends", label: "Friends going" },
  { value: "seen", label: "Artists you've seen" },
];

export interface UpcomingFilters {
  artist: string;
  venue: string;
  /** Search around this place; null = your home. */
  place: { label: string; lat: number; lng: number } | null;
  range: Range;
  from: string;
  to: string;
}

export const emptyUpcomingFilters = (): UpcomingFilters => ({ artist: "", venue: "", place: null, range: "50", from: "", to: "" });

/** True when the advanced filters change anything beyond the defaults. */
export function filtersActive(f: UpcomingFilters): boolean {
  return !!(f.artist.trim() || f.venue.trim() || f.place || f.range !== "50" || f.from || f.to);
}

/** Search request for the box text, quick filter and advanced filters. */
export function searchParams(q: string, quick: QuickFilter, f: UpcomingFilters, now = new Date()): UpcomingSearchParams {
  const p: UpcomingSearchParams = { range: f.range };
  if (q.trim()) p.q = q.trim();
  if (f.artist.trim()) p.artist = f.artist.trim();
  if (f.venue.trim()) p.venue = f.venue.trim();
  if (f.place) Object.assign(p, { lat: f.place.lat, lng: f.place.lng, place_label: f.place.label });
  if (f.from) p.from = f.from;
  if (f.to) p.to = f.to;
  if (quick === "weekend") Object.assign(p, weekendRange(now));
  if (quick === "month") Object.assign(p, nextDays(30, now));
  if (quick === "seen") p.seen_only = true;
  return p;
}
