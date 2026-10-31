// Shows as people think of them: everything at one venue on one date is one
// show (headliner + openers), on one ticket. Each artist keeps its own page
// (attendance) with its own setlist. Also spots likely festivals.
import { placeOf } from "./format";
import type { LogEntry } from "./types";

export interface ShowGroup {
  key: string;            // "<date>|<venue name, lowercased>"
  show_number: number;
  event_date: string;
  venue_id: string;
  venue_name: string;
  city: string | null;
  state_code: string | null;
  country_code: string | null;
  /** Headliner first, then openers. */
  acts: LogEntry[];
  is_festival: boolean;
  festival_name: string | null;
  source: LogEntry["source"];
  song_count: number;
  rating: number | null;
}

/**
 * Same date + same venue name = same show. Matching on the name (not the venue
 * record) keeps duplicate venue records, like a hand-added "RamKat" saved twice, together.
 */
export const showKey = (e: Pick<LogEntry, "event_date" | "venue_name">) => `${e.event_date}|${e.venue_name.trim().toLowerCase()}`;

/** Headliner: the one you picked, else the most songs, else the one logged first. */
function byBilling(a: LogEntry, b: LogEntry): number {
  if (!!a.headliner !== !!b.headliner) return a.headliner ? -1 : 1;
  if (a.song_count !== b.song_count) return b.song_count - a.song_count;
  return a.created_at.localeCompare(b.created_at);
}

/** Groups log entries into shows, newest first (same order as the log). */
export function groupShows(entries: LogEntry[]): ShowGroup[] {
  const map = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const k = showKey(e);
    const list = map.get(k);
    if (list) list.push(e);
    else map.set(k, [e]);
  }
  const out: ShowGroup[] = [];
  for (const [key, list] of map) {
    const acts = [...list].sort(byBilling);
    const head = acts[0]!;
    const rated = acts.filter((a) => a.rating != null);
    out.push({
      key,
      show_number: head.show_number,
      event_date: head.event_date,
      venue_id: head.venue_id,
      venue_name: head.venue_name,
      city: head.city,
      state_code: head.state_code,
      country_code: head.country_code,
      acts,
      is_festival: acts.some((a) => a.is_festival),
      festival_name: acts.find((a) => a.festival_name)?.festival_name ?? null,
      source: acts.every((a) => a.source === "manual") ? "manual" : "setlistfm",
      song_count: acts.reduce((n, a) => n + a.song_count, 0),
      // The headliner's rating, else the best one you gave that night.
      rating: head.rating ?? (rated.length ? Math.max(...rated.map((a) => a.rating!)) : null),
    });
  }
  return out.sort((a, b) => b.event_date.localeCompare(a.event_date) || b.show_number - a.show_number);
}

/** SsTicketRow props for a show: headliner, openers (each linking to its own page), place. */
export function ticketProps(g: ShowGroup, base = "/app/shows") {
  const head = g.acts[0]!;
  return {
    to: `${base}/${head.attendance_id}`,
    date: g.event_date,
    artist: head.artist_name,
    openers: g.acts.slice(1).map((a) => ({ name: a.artist_name, to: `${base}/${a.attendance_id}` })),
    venue: g.venue_name,
    place: placeOf(g),
    number: g.show_number,
    source: g.source,
    festival: g.is_festival ? g.festival_name ?? true : null,
    songs: g.song_count,
    rating: g.rating,
  };
}

/** SsTicketRow props for a single log entry (one act, no openers). */
export function entryTicketProps(e: LogEntry, base = "/app/shows") {
  return {
    to: `${base}/${e.attendance_id}`,
    date: e.event_date,
    artist: e.artist_name,
    venue: e.venue_name,
    place: placeOf(e),
    number: e.show_number,
    source: e.source,
    songs: e.song_count,
    rating: e.rating,
  };
}

/** Distinct festivals: by name, or (unnamed) by venue and year. */
export function festivalCount(entries: LogEntry[]): number {
  const keys = new Set(
    entries.filter((e) => e.is_festival).map((e) => e.festival_name?.toLowerCase() ?? `${e.venue_id}:${e.event_date.slice(0, 4)}`),
  );
  return keys.size;
}

export interface FestivalSuggestion {
  key: string;          // stable id for "dismiss"
  venue_name: string;
  place: { city: string | null; state_code: string | null; country_code: string | null };
  from: string;
  to: string;
  days: number;
  artists: number;
  attendanceIds: string[];
}

const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 86_400_000);

/**
 * Likely festivals that aren't marked yet: one venue on back-to-back days
 * (2+ days) with 3+ artists in total, or a single day with 5+ artists.
 */
export function suggestFestivals(entries: LogEntry[]): FestivalSuggestion[] {
  const byVenue = new Map<string, ShowGroup[]>();
  for (const g of groupShows(entries)) {
    const venueKey = g.venue_name.trim().toLowerCase();
    const list = byVenue.get(venueKey);
    if (list) list.push(g);
    else byVenue.set(venueKey, [g]);
  }
  const out: FestivalSuggestion[] = [];
  for (const shows of byVenue.values()) {
    const sorted = [...shows].sort((a, b) => a.event_date.localeCompare(b.event_date));
    let run: ShowGroup[] = [];
    const flush = () => {
      if (!run.length) return;
      const artists = run.reduce((n, g) => n + g.acts.length, 0);
      const ok = (run.length >= 2 && artists >= 3) || artists >= 5;
      const unmarked = run.flatMap((g) => g.acts).filter((a) => !a.is_festival);
      if (ok && unmarked.length) {
        const first = run[0]!, last = run[run.length - 1]!;
        out.push({
          key: `${first.venue_id}:${first.event_date}`,
          venue_name: first.venue_name,
          place: { city: first.city, state_code: first.state_code, country_code: first.country_code },
          from: first.event_date,
          to: last.event_date,
          days: run.length,
          artists,
          attendanceIds: run.flatMap((g) => g.acts.map((a) => a.attendance_id)),
        });
      }
      run = [];
    };
    for (const g of sorted) {
      const prev = run[run.length - 1];
      if (prev && dayNum(g.event_date) - dayNum(prev.event_date) > 1) flush();
      run.push(g);
    }
    flush();
  }
  return out.sort((a, b) => b.from.localeCompare(a.from));
}
