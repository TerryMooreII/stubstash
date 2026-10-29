<script setup lang="ts">
// A printed "admit one" ticket for a show: cream paper, notched perforation,
// and a tear-off end with the show number and a barcode drawn from the seed.
import { computed } from "vue";
import { accentFor, hash } from "@/lib/color";
import { dateParts, parseDate } from "@/lib/format";
import { rng } from "@/lib/poster";

const props = defineProps<{
  seed: string;
  artist: string;
  venue: string;
  place?: string | null;
  date: string; // YYYY-MM-DD
  number?: number | null;
  seat?: string | null;
  paid?: string | null;
}>();

const d = computed(() => dateParts(props.date));
const weekday = computed(() => parseDate(props.date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase());
const serial = computed(() => (props.number ? String(props.number).padStart(3, "0") : "—"));

// Barcode bars (y, height) for the tear-off end; stable per seed.
const bars = computed(() => {
  const rand = rng(hash(`bars:${props.seed}`));
  const out: { y: number; h: number }[] = [];
  let y = 0;
  while (y < 96) {
    const h = 1 + Math.floor(rand() * 3);
    out.push({ y, h });
    y += h + 1 + Math.floor(rand() * 3);
  }
  return out;
});
</script>

<template>
  <div class="ss-stub" :style="{ '--stub-band': accentFor(artist) }" role="img" :aria-label="`Ticket: ${artist}, ${venue}, ${d.mon} ${d.day} ${d.yr}`">
    <div class="ss-stub__main">
      <div class="ss-stub__top"><span>ADMIT ONE</span><span>STUBSTASH</span></div>
      <div class="ss-stub__artist">{{ artist }}</div>
      <div class="ss-stub__venue">{{ venue }}<template v-if="place"> · {{ place }}</template></div>
      <div class="ss-stub__fields">
        <div><div class="k">DATE</div><div class="v">{{ weekday }} {{ d.mon }} {{ d.day }} {{ d.yr }}</div></div>
        <div><div class="k">SEAT</div><div class="v">{{ seat || "GA" }}</div></div>
        <div v-if="paid && paid !== '—'"><div class="k">PAID</div><div class="v">{{ paid }}</div></div>
      </div>
    </div>
    <div class="ss-stub__tail" aria-hidden="true">
      <div class="k">SHOW</div>
      <div class="ss-stub__num">{{ serial }}</div>
      <svg class="ss-stub__bars" viewBox="0 0 34 96" preserveAspectRatio="none">
        <rect v-for="(b, i) in bars" :key="i" x="0" :y="b.y" width="34" :height="b.h" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.ss-stub {
  --tail: 74px;
  --n: 9px;
  --hole: transparent calc(var(--n) - 0.5px), #000 var(--n);
  position: relative;
  display: flex;
  min-height: 150px;
  border-radius: 10px;
  color: var(--ss-on-accent);
  background:
    var(--ss-grain-dark),
    repeating-radial-gradient(circle at 18% 120%, rgba(10, 9, 12, 0.045) 0 1px, transparent 1px 7px),
    linear-gradient(90deg, var(--stub-band) 0 7px, transparent 7px),
    var(--ss-cream);
  /* Notches top and bottom where the tear-off end is perforated. */
  -webkit-mask:
    radial-gradient(circle at calc(100% - var(--tail)) 0, var(--hole)) top / 100% 51% no-repeat,
    radial-gradient(circle at calc(100% - var(--tail)) 100%, var(--hole)) bottom / 100% 51% no-repeat;
  mask:
    radial-gradient(circle at calc(100% - var(--tail)) 0, var(--hole)) top / 100% 51% no-repeat,
    radial-gradient(circle at calc(100% - var(--tail)) 100%, var(--hole)) bottom / 100% 51% no-repeat;
}
.ss-stub__main {
  flex: 1;
  min-width: 0;
  padding: 14px 16px 14px 22px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ss-stub__top,
.k {
  font-family: var(--ss-font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
}
.ss-stub__top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; opacity: 0.75; }
.ss-stub__artist {
  font-weight: 900;
  font-size: 24px;
  line-height: 1.02;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ss-stub__venue { font-weight: 700; font-size: 14px; overflow-wrap: anywhere; }
.ss-stub__fields {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid rgba(10, 9, 12, 0.25);
}
.k { font-size: 9px; opacity: 0.6; }
.v { font-weight: 900; font-size: 14px; }
.ss-stub__tail {
  width: var(--tail);
  flex-shrink: 0;
  border-left: 2px dashed rgba(10, 9, 12, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 12px 6px;
}
.ss-stub__num { font-weight: 900; font-size: 24px; line-height: 1; }
.ss-stub__bars { width: 34px; height: 60px; margin-top: 8px; fill: var(--ss-on-accent); }
</style>
