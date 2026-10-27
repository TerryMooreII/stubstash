// Color helpers: stable "art" gradients for artists/venues without photos,
// and the palette used for badges, avatars and share cards.

export const PALETTE = {
  yellow: "#f4b811",
  butter: "#fad672",
  cream: "#fce4a3",
  teal: "#76a9b9",
  tealLight: "#96beca",
  ice: "#b8d3db",
  orange: "#ffb41f",
  olive: "#9db161",
  coral: "#ff5f6c",
  lavender: "#b1a5d3",
  violet: "#9383c2",
  slate: "#404346",
  ink: "#2d2f31",
} as const;

// Pairs from the design's mock data (artist placeholder gradients).
const PAIRS: [string, string][] = [
  [PALETTE.yellow, PALETTE.orange],
  [PALETTE.butter, PALETTE.ink],
  [PALETTE.slate, PALETTE.teal],
  [PALETTE.ice, PALETTE.teal],
  [PALETTE.ink, PALETTE.slate],
  [PALETTE.orange, PALETTE.butter],
  [PALETTE.teal, PALETTE.ice],
  [PALETTE.butter, PALETTE.orange],
  [PALETTE.ice, PALETTE.yellow],
  [PALETTE.ink, PALETTE.butter],
];

/** Small stable string hash (FNV-1a). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pairFor(key: string): [string, string] {
  return PAIRS[hash(key) % PAIRS.length]!;
}

/** Pinstriped gradient background used when there's no photo. Same key -> same art. */
export function placeholderArt(key: string): string {
  const [a, b] = pairFor(key);
  return `repeating-linear-gradient(45deg, rgba(255,255,255,.07) 0 2px, transparent 2px 14px), linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

/** The first color of an artist's pair, for bars and accents. */
export function accentFor(key: string): string {
  return pairFor(key)[0];
}

const AVATAR = [PALETTE.teal, PALETTE.olive, PALETTE.butter, PALETTE.tealLight, PALETTE.cream, PALETTE.yellow, PALETTE.lavender];
export function avatarColor(key: string): string {
  return AVATAR[hash(key) % AVATAR.length]!;
}

/** Badge color tokens from badge_definitions.color */
export const BADGE_COLORS: Record<string, string> = {
  yellow: PALETTE.yellow,
  orange: PALETTE.orange,
  teal: PALETTE.teal,
  slate: PALETTE.slate,
  mint: PALETTE.ice,
  gold: PALETTE.butter,
};

/** Background options for share cards ("Shuffle colors"). */
export const CARD_COLORS = [PALETTE.yellow, PALETTE.teal, PALETTE.cream, PALETTE.tealLight, PALETTE.butter];
