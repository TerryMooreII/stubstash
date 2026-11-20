// "On this day": shows you went to on today's date in earlier years.
import { parseDate } from "./format";
import type { ShowGroup } from "./shows";

export interface Anniversary {
  show: ShowGroup;
  /** Whole years since the show (1 or more). */
  years: number;
}

/** Shows on this month and day in earlier years, most recent first. */
export function onThisDay(shows: ShowGroup[], now = new Date()): Anniversary[] {
  const month = now.getMonth(), day = now.getDate(), year = now.getFullYear();
  return shows
    .map((show) => ({ show, d: parseDate(show.event_date) }))
    .filter(({ d }) => d.getMonth() === month && d.getDate() === day && d.getFullYear() < year)
    .map(({ show, d }) => ({ show, years: year - d.getFullYear() }))
    .sort((a, b) => a.years - b.years);
}

/** "1 YEAR AGO TODAY" / "12 YEARS AGO TODAY" */
export function yearsAgoLabel(years: number): string {
  return `${years} ${years === 1 ? "YEAR" : "YEARS"} AGO TODAY`;
}
