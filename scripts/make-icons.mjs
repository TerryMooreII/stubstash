// Generates the PWA icons and favicon with Node built-ins only (no image libraries).
// Mark: yellow ticket stub, blocky "S", dark dashed perforation.
//   node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(join(root, "icons"), { recursive: true });

const YELLOW = [0xf4, 0xb8, 0x11, 255];
const INK = [0x0a, 0x09, 0x0c, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

// ---- geometry in unit space (0..1) ----
const S = { x0: 0.17, x1: 0.55, y0: 0.24, y1: 0.76, t: 0.105 };
const PERF = { x: 0.715, w: 0.04, y0: 0.13, y1: 0.87, dash: 0.075, gap: 0.05 };
const NOTCH_R = 0.075;

function inRoundRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inS(x, y) {
  const { x0, x1, y0, y1, t } = S, mid = (y0 + y1) / 2;
  const box = (a, b, c, d) => x >= a && x <= b && y >= c && y <= d;
  return (
    box(x0, x1, y0, y0 + t) ||                 // top
    box(x0, x0 + t, y0, mid + t / 2) ||        // upper left
    box(x0, x1, mid - t / 2, mid + t / 2) ||   // middle
    box(x1 - t, x1, mid - t / 2, y1) ||        // lower right
    box(x0, x1, y1 - t, y1)                    // bottom
  );
}
function inPerf(x, y) {
  if (Math.abs(x - PERF.x) > PERF.w / 2 || y < PERF.y0 || y > PERF.y1) return false;
  return (y - PERF.y0) % (PERF.dash + PERF.gap) < PERF.dash;
}
function inNotch(x, y) {
  return (x - PERF.x) ** 2 + y ** 2 <= NOTCH_R ** 2 || (x - PERF.x) ** 2 + (y - 1) ** 2 <= NOTCH_R ** 2;
}

/** Color at a unit point for a given style. */
function shade(x, y, style) {
  if (style === "badge") {
    // monochrome white mark on transparent
    return inS(x, y) || inPerf(x, y) ? WHITE : CLEAR;
  }
  if (style === "maskable") {
    // full-bleed yellow; content shrunk into the 80% safe zone
    const u = (x - 0.1) / 0.8, v = (y - 0.1) / 0.8;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && (inS(u, v) || inPerf(u, v))) return INK;
    return YELLOW;
  }
  // "rounded": rounded yellow square with ticket notches
  if (!inRoundRect(x, y, 0.22) || inNotch(x, y)) return CLEAR;
  return inS(x, y) || inPerf(x, y) ? INK : YELLOW;
}

function render(size, style, ss = 4) {
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((pxi + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, style);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const i = (py * size + pxi) * 4;
      px[i] = a ? Math.round(r / a) : 0;
      px[i + 1] = a ? Math.round(g / a) : 0;
      px[i + 2] = a ? Math.round(b / a) : 0;
      px[i + 3] = Math.round(a / (ss * ss));
    }
  }
  return px;
}

// ---- PNG encoding ----
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = [
  ["icons/icon-192.png", 192, "rounded"],
  ["icons/icon-512.png", 512, "rounded"],
  ["icons/icon-maskable-512.png", 512, "maskable"],
  ["icons/apple-touch-icon.png", 180, "maskable"], // iOS rounds corners itself; no transparency
  ["icons/badge-72.png", 72, "badge"],
];
for (const [file, size, style] of out) {
  writeFileSync(join(root, file), png(size, render(size, style)));
  console.log("wrote", file);
}

// ---- favicon.svg (same mark as vectors) ----
const u = (v) => +(v * 64).toFixed(2);
const { x0, x1, y0, y1, t } = S, mid = (y0 + y1) / 2;
const sRects = [
  [x0, y0, x1 - x0, t], [x0, y0, t, mid + t / 2 - y0], [x0, mid - t / 2, x1 - x0, t],
  [x1 - t, mid - t / 2, t, y1 - mid + t / 2], [x0, y1 - t, x1 - x0, t],
].map(([x, y, w, h]) => `<rect x="${u(x)}" y="${u(y)}" width="${u(w)}" height="${u(h)}"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<mask id="m"><rect width="64" height="64" rx="${u(0.22)}" fill="#fff"/><circle cx="${u(PERF.x)}" cy="0" r="${u(NOTCH_R)}" fill="#000"/><circle cx="${u(PERF.x)}" cy="64" r="${u(NOTCH_R)}" fill="#000"/></mask>
<rect width="64" height="64" fill="#f4b811" mask="url(#m)"/>
<g fill="#0a090c">${sRects}</g>
<line x1="${u(PERF.x)}" y1="${u(PERF.y0)}" x2="${u(PERF.x)}" y2="${u(PERF.y1)}" stroke="#0a090c" stroke-width="${u(PERF.w)}" stroke-dasharray="${u(PERF.dash)} ${u(PERF.gap)}"/>
</svg>
`;
writeFileSync(join(root, "favicon.svg"), svg);
console.log("wrote favicon.svg");
