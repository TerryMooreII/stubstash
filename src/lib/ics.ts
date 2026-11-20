// "Add to calendar": builds an .ics file for an upcoming show. No server needed.
import { eventPlace } from "./upcoming";
import type { UpcomingEvent } from "./types";

type CalendarEvent = Pick<
  UpcomingEvent,
  "seatgeek_id" | "artist" | "performers" | "venue_name" | "city" | "state" | "country_code" | "starts_at" | "local_date" | "local_time" | "ticket_url"
>;

/** Shows are blocked out for this long (SeatGeek has no end times). */
const SHOW_HOURS = 3;

/** Escapes text for an iCalendar value (RFC 5545 §3.3.11). */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** A Date as UTC "20261119T013000Z". */
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** "2026-11-19" plus some days, as "20261119". */
function dayStamp(iso: string, addDays = 0): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + addDays)).toISOString().slice(0, 10).replace(/-/g, "");
}

/** Folds lines longer than 75 bytes, as the format asks (continuation lines start with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

/**
 * The show as a one-event calendar file. With a start time it's a timed event
 * (in UTC, so calendars show it in the right zone); without one it's all day.
 */
export function eventIcs(e: CalendarEvent, pageUrl: string, now = new Date()): string {
  const timed = !!e.starts_at && !!e.local_time;
  const start = timed ? new Date(e.starts_at!) : null;
  const others = e.performers.filter((p) => p !== e.artist);
  const description = [
    others.length ? `With ${others.join(", ")}` : "",
    e.ticket_url ? `Tickets: ${e.ticket_url}` : "",
    `Plans: ${pageUrl}`,
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stubstash//Upcoming shows//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:seatgeek-${e.seatgeek_id}@stubstash`,
    `DTSTAMP:${utcStamp(now)}`,
    ...(start
      ? [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(new Date(start.getTime() + SHOW_HOURS * 3_600_000))}`]
      : [`DTSTART;VALUE=DATE:${dayStamp(e.local_date)}`, `DTEND;VALUE=DATE:${dayStamp(e.local_date, 1)}`]),
    `SUMMARY:${icsText(`${e.artist} at ${e.venue_name}`)}`,
    `LOCATION:${icsText([e.venue_name, eventPlace(e)].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${icsText(description)}`,
    `URL:${pageUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "billy-strings-2026-12-31.ics" */
export function icsFileName(e: Pick<UpcomingEvent, "artist" | "local_date">): string {
  const slug = e.artist.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "show";
  return `${slug}-${e.local_date}.ics`;
}

/** Hands the file to the device: opens the calendar's "add event" on phones, downloads elsewhere. */
export function downloadIcs(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
