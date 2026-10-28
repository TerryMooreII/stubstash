// Header image for a show: your photo -> artist image -> venue image -> a
// generic concert photo. Never the plain gradient block.
import { hash } from "./color";

/** Number of bundled photos in public/concert (01.jpg ... 16.jpg). */
export const GENERIC_PHOTO_COUNT = 16;

/** Stable generic concert photo for a key (e.g. the show id). */
export function genericConcertPhoto(seed: string): string {
  const n = (hash(seed) % GENERIC_PHOTO_COUNT) + 1;
  return `${import.meta.env.BASE_URL}concert/${String(n).padStart(2, "0")}.jpg`;
}

export interface HeroImage {
  kind: "photo" | "artist" | "venue" | "generic";
  src: string;
  credit: string | null;
  label: string;
}

export function heroCandidates(opts: {
  seed: string;
  photo?: string | null;
  artist?: { image_url: string | null; image_credit: string | null } | null;
  venue?: { image_url: string | null; image_credit: string | null } | null;
}): HeroImage[] {
  const out: HeroImage[] = [];
  if (opts.photo) out.push({ kind: "photo", src: opts.photo, credit: null, label: "YOUR PHOTO" });
  if (opts.artist?.image_url) out.push({ kind: "artist", src: opts.artist.image_url, credit: opts.artist.image_credit, label: "ARTIST IMAGE" });
  if (opts.venue?.image_url) out.push({ kind: "venue", src: opts.venue.image_url, credit: opts.venue.image_credit, label: "VENUE IMAGE" });
  out.push({ kind: "generic", src: genericConcertPhoto(opts.seed), credit: "Wikimedia Commons: CC0", label: "CONCERT PHOTO" });
  return out;
}
