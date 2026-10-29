<script setup lang="ts">
// A generated gig poster for a show, drawn as SVG from the show's seed.
//  variant="poster": the full 4:5 poster with type (download / share)
//  variant="art":    just the artwork, filling its box (show and artist headers)
// Paper grain is a CSS tile, not an SVG noise filter: filters over a whole
// poster are slow to paint on phones.
import { computed, useId } from "vue";
import { fitFontSize, posterArt, posterLines } from "@/lib/poster";
import { dateParts, parseDate } from "@/lib/format";

const props = withDefaults(
  defineProps<{
    seed: string;
    variant?: "poster" | "art";
    artist?: string;
    venue?: string;
    place?: string | null;
    date?: string | null;   // YYYY-MM-DD
    number?: number | null;
    tour?: string | null;
  }>(),
  { variant: "poster" },
);

const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const W = 600, H = 750, M = 32;

const isPoster = computed(() => props.variant === "poster");
const lines = computed(() => posterLines(props.artist ?? ""));
const nameSize = computed(() => fitFontSize(lines.value, W - 2 * M, lines.value.length > 1 ? 84 : 120));
const nameLead = computed(() => Math.round(nameSize.value * 0.9));

// Poster layout, bottom up: footer, date, venue, artist lines, then the art fills the rest.
const layout = computed(() => {
  const footer = H - M;
  const date = footer - 40;
  const venue = date - 40;
  const nameBottom = venue - 34;
  const nameTop = nameBottom - nameLead.value * (lines.value.length - 1) - nameSize.value * 0.74;
  const artTop = M + 30;
  const artH = Math.max(160, nameTop - 22 - artTop);
  return { footer, date, venue, nameBottom, artTop, artH };
});

const box = computed(() => (isPoster.value ? { w: W - 2 * M, h: layout.value.artH } : { w: 1200, h: 600 }));
const art = computed(() => posterArt(props.seed, box.value.w, box.value.h));
const pal = computed(() => art.value.palette);

const d = computed(() => (props.date ? dateParts(props.date) : null));
const weekday = computed(() =>
  props.date ? parseDate(props.date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase() : "",
);
const dateLine = computed(() => (d.value ? `${weekday.value} · ${d.value.mon} ${d.value.day} · ${d.value.yr}` : ""));
const venueLine = computed(() => [props.venue, props.place].filter(Boolean).join(" · "));
/** Clamp a line to the width only when it would overflow (rough per-char estimate). */
function clamp(text: string, size: number, perChar: number) {
  return text.length * size * perChar > W - 2 * M ? W - 2 * M : undefined;
}
// Mono 14px with tracking is ~11px a character; leave room for "ADMIT ONE" on the right.
const footLeft = computed(() => {
  const t = props.tour ? props.tour.toUpperCase() : "ONE NIGHT ONLY";
  return t.length > 34 ? `${t.slice(0, 33).trimEnd()}…` : t;
});
</script>

<template>
  <div v-if="isPoster" class="poster-wrap">
    <svg
      class="poster"
      :viewBox="`0 0 ${W} ${H}`"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      :aria-label="`Gig poster: ${artist}, ${venueLine}, ${dateLine}`"
    >
      <defs>
        <clipPath :id="`clip-${uid}`"><rect :x="M" :y="layout.artTop" :width="box.w" :height="box.h" /></clipPath>
      </defs>
      <rect width="100%" height="100%" :fill="pal.paper" />

      <!-- top line -->
      <text :x="M" :y="M + 12" class="mono" :fill="pal.ink">STUBSTASH PRESENTS</text>
      <text v-if="number" :x="W - M" :y="M + 12" class="mono" text-anchor="end" :fill="pal.ink">SHOW №{{ String(number).padStart(3, "0") }}</text>

      <!-- art -->
      <g :clip-path="`url(#clip-${uid})`">
        <g :transform="`translate(${M} ${layout.artTop})`">
          <rect :width="box.w" :height="box.h" :fill="pal.paper" />
          <template v-for="(s, i) in art.shapes" :key="i">
            <rect v-if="s.t === 'rect'" :x="s.x" :y="s.y" :width="s.w" :height="s.h" :fill="s.fill" :transform="s.transform" />
            <circle v-else-if="s.t === 'circle'" :cx="s.cx" :cy="s.cy" :r="s.r" :fill="s.fill" />
            <path v-else :d="s.d" :fill="s.fill" />
          </template>
        </g>
        <rect :x="M" :y="layout.artTop" :width="box.w" :height="box.h" fill="none" :stroke="pal.ink" stroke-width="3" />
      </g>

      <!-- type -->
      <text
        v-for="(l, i) in lines"
        :key="i"
        :x="W / 2"
        :y="layout.nameBottom - nameLead * (lines.length - 1 - i)"
        text-anchor="middle"
        class="name"
        :font-size="nameSize"
        :fill="pal.ink"
        :textLength="clamp(l, nameSize, 0.6)"
        lengthAdjust="spacingAndGlyphs"
      >{{ l }}</text>
      <text :x="W / 2" :y="layout.venue" text-anchor="middle" class="venue" :fill="pal.ink" :textLength="clamp(venueLine, 24, 0.5)" lengthAdjust="spacingAndGlyphs">{{ venueLine }}</text>
      <text :x="W / 2" :y="layout.date" text-anchor="middle" class="date" :fill="pal.ink">{{ dateLine }}</text>
      <line :x1="M" :x2="W - M" :y1="layout.footer - 22" :y2="layout.footer - 22" :stroke="pal.ink" stroke-width="2" />
      <text :x="M" :y="layout.footer" class="mono" :fill="pal.ink">{{ footLeft }}</text>
      <text :x="W - M" :y="layout.footer" class="mono" text-anchor="end" :fill="pal.ink">ADMIT ONE</text>
    </svg>
  </div>

  <div v-else class="poster-art">
    <svg
      class="poster-art__svg"
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="1200" height="600" :fill="pal.paper" />
      <template v-for="(s, i) in art.shapes" :key="i">
        <rect v-if="s.t === 'rect'" :x="s.x" :y="s.y" :width="s.w" :height="s.h" :fill="s.fill" :transform="s.transform" />
        <circle v-else-if="s.t === 'circle'" :cx="s.cx" :cy="s.cy" :r="s.r" :fill="s.fill" />
        <path v-else :d="s.d" :fill="s.fill" />
      </template>
    </svg>
  </div>
</template>

<style scoped>
/* Paper grain is a small tiled noise image (cheap) laid over the art. */
.poster-wrap, .poster-art { position: relative; }
.poster-wrap::after, .poster-art::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--ss-grain-dark);
  pointer-events: none;
}
.poster { display: block; width: 100%; height: auto; }
.poster-art { position: absolute; inset: 0; overflow: hidden; }
.poster-art__svg { width: 100%; height: 100%; display: block; }
.mono { font-family: Monaco, Consolas, "SFMono-Regular", Menlo, monospace; font-size: 14px; letter-spacing: 0.16em; }
.name { font-family: "Source Sans 3", "Source Sans Pro", system-ui, sans-serif; font-weight: 900; letter-spacing: -0.01em; }
.venue { font-family: "Source Sans 3", "Source Sans Pro", system-ui, sans-serif; font-weight: 700; font-size: 24px; }
.date { font-family: "Source Sans 3", "Source Sans Pro", system-ui, sans-serif; font-weight: 900; font-size: 28px; letter-spacing: 0.08em; }
</style>
