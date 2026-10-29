<script setup lang="ts">
// The show "ticket stub" card: colored date stub on the left, details in the
// middle and an "admit one" tear-off on the right. Both perforations are
// notched (CSS mask) like a real ticket. Used for latest shows and the show list.
// A show with openers passes `openers`: the whole ticket still opens the
// headliner (`to`), and each opener's name links to its own page.
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import { placeholderArt } from "@/lib/color";
import { dateParts, stars } from "@/lib/format";

const props = withDefaults(
  defineProps<{
    to: RouteLocationRaw;
    date: string;
    artist: string;
    venue: string;
    place?: string | null;
    number?: number | null;
    source?: "setlistfm" | "manual";
    songs?: number | null;
    rating?: number | null;
    layout?: "card" | "row";
    image?: string | null;
    /** Other acts on the bill, after the headliner. */
    openers?: { name: string; to: RouteLocationRaw }[];
    /** Festival name (or true for an unnamed festival). */
    festival?: string | boolean | null;
  }>(),
  { layout: "card" },
);
const d = computed(() => dateParts(props.date));
const songText = computed(() => (props.songs ? `${props.songs} songs` : "No setlist yet"));
const multi = computed(() => !!props.openers?.length);
const srcLabel = computed(() =>
  props.festival ? (typeof props.festival === "string" ? props.festival.toUpperCase() : "FESTIVAL")
  : props.source === "manual" ? "ADDED BY YOU" : "SETLIST.FM",
);
</script>

<template>
  <component :is="multi ? 'div' : RouterLink" :to="multi ? undefined : to" class="ss-ticket" :class="[`ss-ticket--${layout}`, { 'ss-ticket--multi': multi }]">
    <div class="ss-ticket__stub" :style="{ background: placeholderArt(artist) }">
      <div class="ss-ticket__mon">{{ d.mon }}</div>
      <div class="ss-ticket__day">{{ d.day }}</div>
      <div class="ss-ticket__yr">{{ d.yr }}</div>
    </div>
    <div class="ss-ticket__body">
      <template v-if="layout === 'card'">
        <div class="ss-ticket__meta">
          <span class="ss-ticket__src" :class="{ 'is-manual': source === 'manual' && !festival, 'is-fest': !!festival }">{{ srcLabel }}</span>
          <span v-if="number" class="ss-ticket__num">#{{ number }}</span>
        </div>
        <div class="ss-ticket__artist">
          <RouterLink v-if="multi" :to="to" class="ss-ticket__head">{{ artist }}</RouterLink>
          <template v-else>{{ artist }}</template>
        </div>
        <div v-if="multi" class="ss-ticket__with">
          with
          <template v-for="(o, i) in openers" :key="i">
            <RouterLink :to="o.to" class="ss-ticket__opener">{{ o.name }}</RouterLink><template v-if="i < openers!.length - 1">, </template>
          </template>
        </div>
        <div class="ss-ticket__venue ss-truncate">{{ venue }}<template v-if="place"> · {{ place }}</template></div>
        <div class="ss-ticket__foot">
          <span class="ss-muted">{{ songText }}</span>
          <span class="ss-ticket__stars">{{ stars(rating) }}</span>
        </div>
      </template>
      <template v-else>
        <div class="ss-ticket__main">
          <div class="ss-ticket__artist">
            <RouterLink v-if="multi" :to="to" class="ss-ticket__head">{{ artist }}</RouterLink>
            <template v-else>{{ artist }}</template>
          </div>
          <div v-if="multi" class="ss-ticket__with">
            with
            <template v-for="(o, i) in openers" :key="i">
              <RouterLink :to="o.to" class="ss-ticket__opener">{{ o.name }}</RouterLink><template v-if="i < openers!.length - 1">, </template>
            </template>
          </div>
          <div class="ss-ticket__venue ss-truncate">{{ venue }}<template v-if="place"> · {{ place }}</template></div>
        </div>
        <div class="ss-ticket__side">
          <span class="ss-ticket__src" :class="{ 'is-manual': source === 'manual' && !festival, 'is-fest': !!festival }">{{ srcLabel }}</span>
          <span class="ss-muted">{{ songText }}</span>
          <span class="ss-ticket__stars">{{ stars(rating) }}</span>
        </div>
      </template>
    </div>
    <div class="ss-ticket__tail" aria-hidden="true">
      <span>ADMIT ONE</span><span v-if="number" class="ss-ticket__serial">№{{ String(number).padStart(3, "0") }}</span>
    </div>
  </component>
</template>

<style scoped>
.ss-ticket {
  /* --l / --r: where the two perforations sit; --n: notch radius. */
  --l: 83px;
  --r: 29px;
  --n: 7px;
  --hole: transparent calc(var(--n) - 0.5px), #000 var(--n);
  display: flex;
  text-align: left;
  border-radius: var(--ss-radius-md);
  overflow: hidden;
  background: var(--ss-grain), var(--ss-surface-1);
  /* Four quarters, each punching one notch: left/right perforation, top/bottom edge. */
  -webkit-mask:
    radial-gradient(circle at var(--l) 0, var(--hole)) left top / 51% 51% no-repeat,
    radial-gradient(circle at var(--l) 100%, var(--hole)) left bottom / 51% 51% no-repeat,
    radial-gradient(circle at calc(100% - var(--r)) 0, var(--hole)) right top / 51% 51% no-repeat,
    radial-gradient(circle at calc(100% - var(--r)) 100%, var(--hole)) right bottom / 51% 51% no-repeat;
  mask:
    radial-gradient(circle at var(--l) 0, var(--hole)) left top / 51% 51% no-repeat,
    radial-gradient(circle at var(--l) 100%, var(--hole)) left bottom / 51% 51% no-repeat,
    radial-gradient(circle at calc(100% - var(--r)) 0, var(--hole)) right top / 51% 51% no-repeat,
    radial-gradient(circle at calc(100% - var(--r)) 100%, var(--hole)) right bottom / 51% 51% no-repeat;
  color: var(--ss-text);
  text-decoration: none;
  min-height: 104px;
  transition: transform var(--ss-dur-fast) var(--ss-ease), background var(--ss-dur-fast);
}
.ss-ticket:hover {
  text-decoration: none;
  color: var(--ss-text);
  background: var(--ss-grain), #18191a;
  transform: translateY(-1px);
}
.ss-ticket--row { min-height: 92px; }
.ss-ticket__stub {
  width: 84px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--ss-on-accent);
  border-right: 2px dashed var(--ss-bg);
}
.ss-ticket__mon { font-weight: 700; font-size: 12px; letter-spacing: 0.1em; }
.ss-ticket__day { font-weight: 900; font-size: 32px; line-height: 0.95; }
.ss-ticket--row .ss-ticket__day { font-size: 30px; }
.ss-ticket__yr { font-weight: 700; font-size: 12px; }
.ss-ticket__body {
  flex: 1;
  min-width: 0;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ss-ticket--row .ss-ticket__body {
  padding: 12px 16px;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 20px;
}
.ss-ticket__main { flex: 1 1 240px; min-width: 0; }
.ss-ticket__side { display: flex; gap: 14px; align-items: center; font-size: 13px; flex-wrap: wrap; }
.ss-ticket__meta { display: flex; justify-content: space-between; gap: 8px; }
.ss-ticket__src {
  font-family: var(--ss-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ss-teal-light);
}
.ss-ticket__src.is-manual { color: var(--ss-cream); }
.ss-ticket__src.is-fest { color: var(--ss-accent); }
/* Multi-act shows: the headliner link covers the whole ticket; opener links sit above it. */
.ss-ticket--multi { position: relative; cursor: pointer; }
.ss-ticket__head { color: inherit; text-decoration: none; }
.ss-ticket__head::after { content: ""; position: absolute; inset: 0; z-index: 0; }
.ss-ticket__head:focus-visible { outline: none; }
.ss-ticket--multi:has(.ss-ticket__head:focus-visible) { outline: 2px solid var(--ss-accent); outline-offset: 2px; }
.ss-ticket__with { font-size: 14px; color: var(--ss-text-muted); line-height: 1.3; }
.ss-ticket__opener {
  position: relative;
  z-index: 1;
  color: var(--ss-text-2);
  font-weight: 700;
  text-decoration: none;
}
.ss-ticket__opener:hover { color: var(--ss-accent); text-decoration: underline; }
.ss-ticket__num { font-family: var(--ss-font-mono); font-size: 10px; color: var(--ss-text-faint); }
.ss-ticket__artist { font-weight: 900; font-size: 20px; line-height: 1.1; }
.ss-ticket__venue { font-size: 14px; color: var(--ss-text-3); }
.ss-ticket__foot { display: flex; justify-content: space-between; font-size: 13px; margin-top: 2px; }
.ss-ticket__stars { color: var(--ss-accent); letter-spacing: 0.08em; }
.ss-ticket__tail {
  width: 30px;
  flex-shrink: 0;
  /* Rotated 180deg, so this right border shows on the left. */
  border-right: 2px dashed var(--ss-line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: var(--ss-font-mono);
  font-size: 9px;
  letter-spacing: 0.22em;
  color: var(--ss-text-faint);
  white-space: nowrap;
  overflow: hidden;
}
.ss-ticket__serial { color: var(--ss-text-muted); }
</style>
