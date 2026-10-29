// Generated gig poster art. Pure and seeded: the same show always gets the
// same poster. GigPoster.vue draws the shapes as SVG and adds the type.
import { hash, PALETTE } from "./color";

export type PosterStyle = "sunburst" | "rings" | "halftone" | "waves" | "blocks" | "stripes";
export const POSTER_STYLES: PosterStyle[] = ["sunburst", "rings", "halftone", "waves", "blocks", "stripes"];

/** paper = background and type area, ink = type colour, a/b = the two print colours. */
export interface PosterPalette { paper: string; ink: string; a: string; b: string }

export const POSTER_PALETTES: PosterPalette[] = [
  { paper: PALETTE.cream, ink: PALETTE.ink, a: PALETTE.coral, b: PALETTE.teal },
  { paper: "#16161a", ink: PALETTE.cream, a: PALETTE.yellow, b: PALETTE.coral },
  { paper: PALETTE.teal, ink: PALETTE.ink, a: PALETTE.cream, b: PALETTE.orange },
  { paper: PALETTE.yellow, ink: PALETTE.ink, a: PALETTE.coral, b: PALETTE.cream },
  { paper: PALETTE.lavender, ink: PALETTE.ink, a: PALETTE.butter, b: PALETTE.violet },
  { paper: PALETTE.olive, ink: "#fff7e0", a: PALETTE.ink, b: PALETTE.orange },
  { paper: PALETTE.ink, ink: PALETTE.ice, a: PALETTE.teal, b: PALETTE.butter },
  { paper: PALETTE.ice, ink: PALETTE.ink, a: PALETTE.teal, b: PALETTE.coral },
  { paper: PALETTE.butter, ink: PALETTE.ink, a: PALETTE.orange, b: PALETTE.teal },
  { paper: PALETTE.coral, ink: "#fff4e0", a: PALETTE.butter, b: PALETTE.ink },
];

export type Shape =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: string; transform?: string }
  | { t: "circle"; cx: number; cy: number; r: number; fill: string }
  | { t: "path"; d: string; fill: string };

export interface PosterArt {
  style: PosterStyle;
  palette: PosterPalette;
  shapes: Shape[];
}

/** Small seeded random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Poster art for a seed (usually the show id) sized w x h. */
export function posterArt(seed: string, w: number, h: number): PosterArt {
  const rand = rng(hash(seed));
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
  const style = POSTER_STYLES[hash(`style:${seed}`) % POSTER_STYLES.length]!;
  const palette = POSTER_PALETTES[hash(`palette:${seed}`) % POSTER_PALETTES.length]!;
  const { paper, ink, a, b } = palette;
  const shapes: Shape[] = [];
  const short = Math.min(w, h);

  switch (style) {
    case "sunburst": {
      // Rays from a low sun, with the ground in ink.
      const cx = w * between(0.3, 0.7), cy = h * between(0.58, 0.8);
      const n = int(8, 13) * 2;
      const R = Math.hypot(w, h) * 1.2;
      const turn = rand() * Math.PI;
      for (let i = 0; i < n; i += 2) {
        const t1 = turn + (i / n) * Math.PI * 2, t2 = turn + ((i + 1) / n) * Math.PI * 2;
        shapes.push({
          t: "path",
          fill: a,
          d: `M${r1(cx)} ${r1(cy)}L${r1(cx + R * Math.cos(t1))} ${r1(cy + R * Math.sin(t1))}L${r1(cx + R * Math.cos(t2))} ${r1(cy + R * Math.sin(t2))}Z`,
        });
      }
      shapes.push({ t: "circle", cx, cy, r: short * between(0.18, 0.28), fill: b });
      shapes.push({ t: "rect", x: 0, y: cy, w, h: h - cy, fill: ink });
      // Sun reflection lines on the ground.
      for (let i = 1; i <= 3; i++) {
        const y = cy + (h - cy) * (i / 4.2);
        shapes.push({ t: "rect", x: cx - short * 0.25 / i, y, w: (short * 0.5) / i, h: Math.max(2, short * 0.012), fill: b });
      }
      break;
    }
    case "rings": {
      // Concentric rings from an off-centre point.
      const cx = w * between(-0.1, 1.1), cy = h * between(-0.1, 1.1);
      const step = short * between(0.05, 0.09);
      const colors = [a, paper, b, paper];
      let r = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      for (let i = 0; r > step * 0.5; i++, r -= step) shapes.push({ t: "circle", cx, cy, r, fill: colors[i % colors.length]! });
      break;
    }
    case "halftone": {
      // A big disc with a halftone dot field fading from one point.
      shapes.push({ t: "circle", cx: w * between(0.25, 0.75), cy: h * between(0.3, 0.6), r: short * between(0.3, 0.45), fill: b });
      const g = short / int(14, 20);
      const fx = w * between(0, 1), fy = h * between(0, 1);
      const far = Math.hypot(Math.max(fx, w - fx), Math.max(fy, h - fy));
      for (let y = g / 2; y < h; y += g) {
        for (let x = g / 2; x < w; x += g) {
          const k = 1 - Math.hypot(x - fx, y - fy) / far;
          const r = g * 0.5 * Math.pow(k, 1.4);
          if (r > 0.8) shapes.push({ t: "circle", cx: r1(x), cy: r1(y), r: r1(r), fill: a });
        }
      }
      break;
    }
    case "waves": {
      // A sun over stacked waves.
      shapes.push({ t: "circle", cx: w * between(0.2, 0.8), cy: h * between(0.2, 0.4), r: short * between(0.14, 0.22), fill: b });
      const bands = int(5, 8);
      const colors = [a, b, ink];
      const amp = h * between(0.025, 0.06);
      const freq = between(1, 2.6);
      for (let i = 0; i < bands; i++) {
        const base = h * (0.38 + (i / bands) * 0.62);
        const phase = rand() * Math.PI * 2;
        let d = `M0 ${r1(base)}`;
        for (let k = 0; k <= 48; k++) {
          const x = (w * k) / 48; // integer steps so the last point lands exactly on the right edge
          d += `L${r1(x)} ${r1(base + amp * Math.sin((x / w) * Math.PI * 2 * freq + phase))}`;
        }
        d += `L${w} ${h}L0 ${h}Z`;
        shapes.push({ t: "path", d, fill: colors[i % colors.length]! });
      }
      break;
    }
    case "blocks": {
      // Bauhaus tiles: quarter circles, half circles and dots.
      const cols = int(3, 5);
      const t = w / cols;
      const rows = Math.ceil(h / t);
      const colors = [paper, a, b, ink];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * t, y = r * t;
          const bg = colors[int(0, 3)]!;
          let fg = colors[int(0, 3)]!;
          if (fg === bg) fg = colors[(colors.indexOf(bg) + 1) % colors.length]!;
          shapes.push({ t: "rect", x, y, w: t + 0.5, h: t + 0.5, fill: bg });
          const kind = int(0, 3);
          if (kind === 0) {
            // quarter circle from a random corner
            const cx2 = x + (rand() < 0.5 ? 0 : t), cy2 = y + (rand() < 0.5 ? 0 : t);
            const sx = cx2 === x ? 1 : -1, sy = cy2 === y ? 1 : -1;
            shapes.push({ t: "path", fill: fg, d: `M${r1(cx2)} ${r1(cy2)}L${r1(cx2 + sx * t)} ${r1(cy2)}A${r1(t)} ${r1(t)} 0 0 ${sx === sy ? 1 : 0} ${r1(cx2)} ${r1(cy2 + sy * t)}Z` });
          } else if (kind === 1) {
            // half circle on the tile's top or bottom edge
            const top = rand() < 0.5;
            const yy = top ? y : y + t;
            shapes.push({ t: "path", fill: fg, d: `M${r1(x)} ${r1(yy)}A${r1(t / 2)} ${r1(t / 2)} 0 0 ${top ? 0 : 1} ${r1(x + t)} ${r1(yy)}Z` });
          } else if (kind === 2) {
            shapes.push({ t: "circle", cx: x + t / 2, cy: y + t / 2, r: t * 0.36, fill: fg });
          } else {
            shapes.push({ t: "path", fill: fg, d: `M${r1(x)} ${r1(y + t)}L${r1(x + t / 2)} ${r1(y)}L${r1(x + t)} ${r1(y + t)}Z` });
          }
        }
      }
      break;
    }
    case "stripes": {
      // Bold diagonal bands with two overlapping discs.
      const angle = between(-40, 40);
      const band = short * between(0.06, 0.12);
      const big = Math.hypot(w, h);
      const tf = `rotate(${r1(angle)} ${r1(w / 2)} ${r1(h / 2)})`;
      for (let i = 0, y = h / 2 - big; y < h / 2 + big; i++, y += band) {
        if (i % 2 === 0) shapes.push({ t: "rect", x: w / 2 - big, y: r1(y), w: big * 2, h: r1(band * 0.55), fill: a, transform: tf });
      }
      const cx = w * between(0.3, 0.7), cy = h * between(0.3, 0.6);
      const r = short * between(0.25, 0.38);
      shapes.push({ t: "circle", cx, cy, r, fill: b });
      shapes.push({ t: "circle", cx: cx + r * between(-0.7, 0.7), cy: cy + r * between(0.3, 0.8), r: r * between(0.35, 0.55), fill: ink });
      break;
    }
  }
  return { style, palette, shapes };
}

/** Splits a name into at most two poster lines, breaking near the middle. */
export function posterLines(name: string, maxOneLine = 14): string[] {
  const s = name.trim().toUpperCase();
  if (s.length <= maxOneLine || !s.includes(" ")) return [s];
  const words = s.split(/\s+/);
  let best = [s], bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(" "), l2 = words.slice(i).join(" ");
    const diff = Math.abs(l1.length - l2.length);
    if (diff < bestDiff) { bestDiff = diff; best = [l1, l2]; }
  }
  return best;
}

/** Font size that fits the longest line in `width` (Source Sans 3 Black caps ~0.6em per char). */
export function fitFontSize(lines: string[], width: number, max: number, perChar = 0.6): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return Math.max(18, Math.min(max, Math.floor(width / (longest * perChar))));
}
