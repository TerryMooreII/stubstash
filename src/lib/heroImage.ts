// Header images.
//  - Show page: your photo -> artist image -> venue image -> a generated gig poster.
//  - Profile (year in review): one of the bundled concert photos, picked per user.
import { hash } from "./color";

/** Number of bundled photos in public/concert (01.jpg ... 16.jpg). */
export const GENERIC_PHOTO_COUNT = 16;

/** URL of bundled concert photo n (1-based). */
export function concertPhoto(n: number): string {
  return `${import.meta.env.BASE_URL}concert/${String(n).padStart(2, "0")}.jpg`;
}

/** Stable generic concert photo for a key (e.g. the show id). */
export function genericConcertPhoto(seed: string): string {
  return concertPhoto((hash(seed) % GENERIC_PHOTO_COUNT) + 1);
}

/** Which bundled photo (1..16) a user's profile header shows: their pick, else one chosen from their id. */
export function profilePhotoNumber(seed: string, choice?: number | null): number {
  if (choice && choice >= 1 && choice <= GENERIC_PHOTO_COUNT) return choice;
  return (hash(`profile:${seed}`) % GENERIC_PHOTO_COUNT) + 1;
}

export function profileBanner(seed: string, choice?: number | null): string {
  return concertPhoto(profilePhotoNumber(seed, choice));
}

/** Short names for the header photo picker, in file order (see public/concert/CREDITS.md). */
export const CONCERT_PHOTO_NAMES = [
  "Back of the venue", "Audience", "Guitar", "Crowd", "Smoke", "Enjoying the show", "Front row", "Blue light",
  "Red light", "Spotlight", "White smoke", "Floodlights", "Light beams", "Sold out", "Red stage", "Before the show",
];

export interface HeroImage {
  kind: "photo" | "artist" | "venue" | "poster";
  /** Image URL; empty for "poster", which is drawn instead (see GigPoster.vue). */
  src: string;
  credit: string | null;
  label: string;
}

export function heroCandidates(opts: {
  photo?: string | null;
  artist?: { image_url: string | null; image_credit: string | null } | null;
  venue?: { image_url: string | null; image_credit: string | null } | null;
}): HeroImage[] {
  const out: HeroImage[] = [];
  if (opts.photo) out.push({ kind: "photo", src: opts.photo, credit: null, label: "YOUR PHOTO" });
  if (opts.artist?.image_url) out.push({ kind: "artist", src: opts.artist.image_url, credit: opts.artist.image_credit, label: "ARTIST IMAGE" });
  if (opts.venue?.image_url) out.push({ kind: "venue", src: opts.venue.image_url, credit: opts.venue.image_credit, label: "VENUE IMAGE" });
  out.push({ kind: "poster", src: "", credit: null, label: "GIG POSTER" });
  return out;
}
