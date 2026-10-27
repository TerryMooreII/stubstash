// Formatting helpers. Pure functions, unit tested in format.test.ts.

/** Parses "YYYY-MM-DD" as a local calendar date (no timezone shifting). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12);
}

/** Parts used by the ticket-stub date block: { mon: "SEP", day: "27", yr: "2026" } */
export function dateParts(iso: string) {
  const d = parseDate(iso);
  return {
    mon: d.toLocaleString("en-US", { month: "short" }).toUpperCase(),
    day: String(d.getDate()).padStart(2, "0"),
    yr: String(d.getFullYear()),
  };
}

/** "Sat, Sep 27, 2026" */
export function longDate(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** "Sep 27, 2026" */
export function mediumDate(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Aug 2026" */
export function monthYear(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** "Dec 2017" style "since" text, or "" */
export function sinceText(iso: string | null | undefined): string {
  return iso ? monthYear(iso) : "";
}

/** 1 -> "1st", 22 -> "22nd", 13 -> "13th" */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** 1204 -> "1,204" */
export function num(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US");
}

/** 18420 -> "18.4k", 950 -> "950" */
export function compact(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v < 10_000) return v.toLocaleString("en-US");
  if (v < 1_000_000) return (Math.round(v / 100) / 10).toString().replace(/\.0$/, "") + "k";
  return (Math.round(v / 100_000) / 10).toString().replace(/\.0$/, "") + "M";
}

/** 4.5 -> "★★★★½", null -> "☆☆☆☆☆" */
export function stars(rating: number | null | undefined): string {
  const r = rating ?? 0;
  const full = Math.floor(r);
  const half = r % 1 >= 0.5 ? 1 : 0;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(Math.max(0, 5 - full - half));
}

/** Cents + ISO currency -> "$58.00" */
export function money(cents: number | null | undefined, currency = "USD"): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

/** "$58" / "58.50" / "£55" -> cents (or null when empty/invalid) */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[^0-9.,]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  if (!cleaned) return null;
  const v = Number(cleaned);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
}

/** "Brooklyn, NY" / "London, GB" from parts */
export function place(city: string | null | undefined, state?: string | null, country?: string | null): string {
  if (!city) return country ?? "";
  if (country && country !== "US") return `${city}, ${country}`;
  return state ? `${city}, ${state}` : city;
}

/** "1 show" / "3 shows" */
export function plural(n: number, one: string, many = one + "s"): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

/** Initials for avatars: "Maya Chen" -> "MC", "samgigs" -> "S" */
export function initials(name: string | null | undefined, max = 1): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, max).map((p) => p[0]!.toUpperCase()).join("");
}

/** Today's date as YYYY-MM-DD in local time */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Months as a short label, e.g. 4 -> "4 mo" */
export function monthsLabel(n: number): string {
  return `${n} mo`;
}
