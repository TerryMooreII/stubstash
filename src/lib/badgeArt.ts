// What's printed on each badge's ticket stub (design "1b"): a short code on
// the tear-off, a big stat and a small unit. Keyed by badge_definitions.key.
import { compact } from "./format";

export interface BadgeArt { code: string; stat: string; unit: string }

const ART: Record<string, BadgeArt> = {
  first_show: { code: "OA", stat: "01", unit: "FIRST SHOW" },
  venue_regular: { code: "VR", stat: "5×", unit: "SAME VENUE" },
  superfan: { code: "S", stat: "10×", unit: "ONE ARTIST" },
  passport: { code: "PS", stat: "INTL", unit: "ABROAD" },
  coast_to_coast: { code: "CT", stat: "E–W", unit: "ONE YEAR" },
  thousand_club: { code: "TC", stat: "1K", unit: "SONGS LIVE" },
  double_header: { code: "DH", stat: "2", unit: "IN ONE DAY" },
  century_club: { code: "CC", stat: "100", unit: "SHOWS" },
  festival_rat: { code: "FR", stat: "10", unit: "FESTIVALS" },
  road_warrior: { code: "RW", stat: "10K", unit: "MILES" },
  first_timer: { code: "FE", stat: "500", unit: "NEW SONGS" },
  // milestones
  quarter_century: { code: "QC", stat: "25", unit: "SHOWS" },
  half_century: { code: "HC", stat: "50", unit: "SHOWS" },
  lifer: { code: "LF", stat: "10", unit: "YEARS" },
  old_school: { code: "OS", stat: "'9X", unit: "THROWBACK" },
  // travel and places
  state_hopper: { code: "SH", stat: "5", unit: "STATES" },
  fifty_nifty: { code: "50", stat: "50", unit: "STATES" },
  hometown_hero: { code: "HH", stat: "25", unit: "HOME" },
  venue_hopper: { code: "VH", stat: "25", unit: "VENUES" },
  road_trip: { code: "RT", stat: "500", unit: "MI AWAY" },
  // habits and timing
  hat_trick: { code: "HT", stat: "3", unit: "NIGHTS" },
  full_run: { code: "RN", stat: "4×", unit: "ONE RUN" },
  nye: { code: "NY", stat: "12/31", unit: "NYE" },
  every_month: { code: "EM", stat: "12", unit: "MONTHS" },
  weeknight_warrior: { code: "WW", stat: "10", unit: "SCHOOL NIGHT" },
  // variety
  explorer: { code: "EX", stat: "50", unit: "ARTISTS" },
  loyalist: { code: "LY", stat: "5", unit: "YEARS" },
  discovery: { code: "DS", stat: "10", unit: "ONE-OFFS" },
  // social and logging
  plus_one: { code: "+1", stat: "10", unit: "TAGGED" },
  same_crowd: { code: "SC", stat: "2", unit: "TOGETHER" },
  critic: { code: "CR", stat: "25", unit: "RATED" },
  stub_keeper: { code: "SK", stat: "10", unit: "STUBS" },
};

/** Badge groups, in display order. */
export const BADGE_GROUPS = [
  { key: "milestones", label: "Milestones" },
  { key: "songs", label: "Songs" },
  { key: "travel", label: "Travel & places" },
  { key: "habits", label: "Habits & timing" },
  { key: "variety", label: "Variety" },
  { key: "social", label: "Social & logging" },
  { key: "other", label: "More" },
] as const;
export type BadgeGroup = (typeof BADGE_GROUPS)[number]["key"];

const GROUP_OF: Record<string, BadgeGroup> = {
  first_show: "milestones", quarter_century: "milestones", half_century: "milestones", century_club: "milestones",
  lifer: "milestones", old_school: "milestones",
  thousand_club: "songs", first_timer: "songs",
  venue_regular: "travel", passport: "travel", coast_to_coast: "travel", road_warrior: "travel", state_hopper: "travel",
  fifty_nifty: "travel", hometown_hero: "travel", venue_hopper: "travel", road_trip: "travel",
  double_header: "habits", festival_rat: "habits", hat_trick: "habits", full_run: "habits", nye: "habits",
  every_month: "habits", weeknight_warrior: "habits",
  superfan: "variety", explorer: "variety", loyalist: "variety", discovery: "variety",
  plus_one: "social", same_crowd: "social", critic: "social", stub_keeper: "social",
};

/** Splits badges into their groups (display order), keeping each group's incoming order. Empty groups are left out. */
export function groupBadges<T extends { key: string }>(badges: T[]): { key: BadgeGroup; label: string; badges: T[] }[] {
  return BADGE_GROUPS.map((g) => ({ ...g, badges: badges.filter((b) => (GROUP_OF[b.key] ?? "other") === g.key) }))
    .filter((g) => g.badges.length);
}

/** Fixed "№" per badge (its place in the catalogue's sort order, 0-based), so it doesn't shift as badges are earned. */
export function badgeNumbers(badges: { key: string; sort_order: number }[]): Map<string, number> {
  return new Map([...badges].sort((a, b) => a.sort_order - b.sort_order).map((b, i) => [b.key, i]));
}

/** Art for a badge; unknown (newly added) badges fall back to initials and their target. */
export function badgeArt(key: string, name: string, target: number): BadgeArt {
  return (
    ART[key] ?? {
      code: name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
      stat: target > 1 ? compact(target) : "1",
      unit: "",
    }
  );
}

/** Slight alternating tilt per position, so a row of stubs looks hand-placed. */
const TILTS = [-3, 2, -1.5, 3, -2, 1.5, -2.5, 2, -1, 2.5, -2];
export function badgeTilt(index: number): number {
  return TILTS[index % TILTS.length]!;
}

/** Dark or light ink for text on a badge colour (relative luminance). */
export function inkOn(hex: string): "dark" | "light" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "dark";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.3 ? "dark" : "light";
}
