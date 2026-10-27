<script setup lang="ts">
// The show "ticket stub" card: colored date stub on the left with a dashed
// perforation, details on the right. Used for latest shows and the show list.
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
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
  }>(),
  { layout: "card" },
);
const d = computed(() => dateParts(props.date));
const songText = computed(() => (props.songs ? `${props.songs} songs` : "No setlist yet"));
</script>

<template>
  <RouterLink :to="to" class="ss-ticket" :class="`ss-ticket--${layout}`">
    <div class="ss-ticket__stub" :style="{ background: placeholderArt(artist) }">
      <div class="ss-ticket__mon">{{ d.mon }}</div>
      <div class="ss-ticket__day">{{ d.day }}</div>
      <div class="ss-ticket__yr">{{ d.yr }}</div>
    </div>
    <div class="ss-ticket__body">
      <template v-if="layout === 'card'">
        <div class="ss-ticket__meta">
          <span class="ss-ticket__src" :class="{ 'is-manual': source === 'manual' }">{{ source === "manual" ? "ADDED BY YOU" : "SETLIST.FM" }}</span>
          <span v-if="number" class="ss-ticket__num">#{{ number }}</span>
        </div>
        <div class="ss-ticket__artist">{{ artist }}</div>
        <div class="ss-ticket__venue ss-truncate">{{ venue }}<template v-if="place"> · {{ place }}</template></div>
        <div class="ss-ticket__foot">
          <span class="ss-muted">{{ songText }}</span>
          <span class="ss-ticket__stars">{{ stars(rating) }}</span>
        </div>
      </template>
      <template v-else>
        <div class="ss-ticket__main">
          <div class="ss-ticket__artist">{{ artist }}</div>
          <div class="ss-ticket__venue ss-truncate">{{ venue }}<template v-if="place"> · {{ place }}</template></div>
        </div>
        <div class="ss-ticket__side">
          <span class="ss-ticket__src" :class="{ 'is-manual': source === 'manual' }">{{ source === "manual" ? "ADDED BY YOU" : "SETLIST.FM" }}</span>
          <span class="ss-muted">{{ songText }}</span>
          <span class="ss-ticket__stars">{{ stars(rating) }}</span>
        </div>
      </template>
    </div>
  </RouterLink>
</template>

<style scoped>
.ss-ticket {
  display: flex;
  text-align: left;
  border-radius: var(--ss-radius-md);
  overflow: hidden;
  background: var(--ss-surface-1);
  color: var(--ss-text);
  text-decoration: none;
  min-height: 104px;
  transition: transform var(--ss-dur-fast) var(--ss-ease), background var(--ss-dur-fast);
}
.ss-ticket:hover {
  text-decoration: none;
  color: var(--ss-text);
  background: #18191a;
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
.ss-ticket__num { font-family: var(--ss-font-mono); font-size: 10px; color: var(--ss-text-faint); }
.ss-ticket__artist { font-weight: 900; font-size: 20px; line-height: 1.1; }
.ss-ticket__venue { font-size: 14px; color: var(--ss-text-3); }
.ss-ticket__foot { display: flex; justify-content: space-between; font-size: 13px; margin-top: 2px; }
.ss-ticket__stars { color: var(--ss-accent); letter-spacing: 0.08em; }
</style>
