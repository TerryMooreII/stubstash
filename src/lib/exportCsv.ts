// CSV export of your log: one row per show, oldest first. Everything except
// photos, the stub image and setlists. See exportAttendances() in api.ts.

export interface ExportAttendance {
  id: string;
  rating: number | null;
  seat: string | null;
  price_cents: number | null;
  currency: string | null;
  merch: string | null;
  notes: string | null;
  is_festival: boolean | null;
  created_at: string;
  show: {
    event_date: string;
    tour_name: string | null;
    info: string | null;
    is_festival: boolean;
    source: "setlistfm" | "manual";
    setlistfm_url: string | null;
    artist: { name: string };
    venue: { name: string; city: string | null; state_code: string | null; country_code: string | null };
  };
  companions: { name: string }[];
}

export const CSV_HEADER = [
  "Show #", "Date", "Artist", "Venue", "City", "State", "Country", "Tour", "Show notes", "Festival", "Source",
  "setlist.fm link", "Rating", "Seat", "Price", "Currency", "Merch", "Your notes", "Went with", "Logged on",
];

/**
 * Quotes a cell when needed. Cells that a spreadsheet would run as a formula
 * (starting with = + @, or - followed by a letter) get a leading apostrophe.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let s = String(value);
  if (/^[=+@\t\r]/.test(s) || /^-[^\d\s.]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text: CRLF line endings and a BOM so Excel reads UTF-8 (accents) correctly. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Local calendar date (YYYY-MM-DD) of a timestamp. */
function localDay(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Builds the CSV rows (header first), oldest show first. `numbers` maps
 * attendance id -> the show number the app displays; otherwise they count up from 1.
 */
export function exportRows(list: ExportAttendance[], numbers?: Map<string, number>): (string | number | null)[][] {
  const sorted = [...list].sort(
    (a, b) => a.show.event_date.localeCompare(b.show.event_date) || a.created_at.localeCompare(b.created_at),
  );
  return [
    CSV_HEADER,
    ...sorted.map((a, i) => [
      numbers?.get(a.id) ?? i + 1,
      a.show.event_date,
      a.show.artist.name,
      a.show.venue.name,
      a.show.venue.city,
      a.show.venue.state_code,
      a.show.venue.country_code,
      a.show.tour_name,
      a.show.info,
      (a.is_festival ?? a.show.is_festival) ? "yes" : "no",
      a.show.source === "manual" ? "added by you" : "setlist.fm",
      a.show.setlistfm_url,
      a.rating,
      a.seat,
      a.price_cents == null ? null : (a.price_cents / 100).toFixed(2),
      a.price_cents == null ? null : a.currency,
      a.merch,
      a.notes,
      a.companions.map((c) => c.name).join("; ") || null,
      localDay(a.created_at),
    ]),
  ];
}

export function exportFileName(handle: string, now = new Date()): string {
  return `stubstash-${handle || "export"}-${localDay(now.toISOString())}.csv`;
}

/** Saves the text as a file download. */
export function downloadCsv(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
