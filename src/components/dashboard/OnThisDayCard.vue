<script setup lang="ts">
// Dashboard "On this day": shows you went to on today's date in earlier years.
// Renders nothing on days without one.
import { computed } from "vue";
import { SsArt, SsStars } from "@/design-system";
import { placeOf } from "@/lib/format";
import { onThisDay, yearsAgoLabel } from "@/lib/onThisDay";
import type { ShowGroup } from "@/lib/shows";

const props = defineProps<{ shows: ShowGroup[] }>();
const items = computed(() => onThisDay(props.shows));
</script>

<template>
  <section v-if="items.length" class="otd" aria-label="On this day">
    <RouterLink v-for="a in items" :key="a.show.key" :to="`/app/shows/${a.show.acts[0]!.attendance_id}`" class="otd__item">
      <SsArt class="otd__art" shape="circle" :src="a.show.acts[0]!.artist_image" :seed="a.show.acts[0]!.artist_name" />
      <div class="otd__text">
        <div class="otd__k">ON THIS DAY · {{ yearsAgoLabel(a.years) }}</div>
        <div class="otd__artist">{{ a.show.acts[0]!.artist_name }}</div>
        <div class="otd__sub">
          {{ a.show.festival_name ?? a.show.venue_name }}<template v-if="placeOf(a.show)"> · {{ placeOf(a.show) }}</template> · {{ a.show.event_date.slice(0, 4) }}
        </div>
      </div>
      <div class="otd__end">
        <SsStars v-if="a.show.rating != null" :value="a.show.rating" />
        <span class="otd__go">Look back →</span>
      </div>
    </RouterLink>
  </section>
</template>

<style scoped>
.otd { display: flex; flex-direction: column; gap: 8px; }
.otd__item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--ss-radius-lg);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  color: var(--ss-text);
  text-decoration: none;
}
.otd__item:hover { text-decoration: none; color: var(--ss-text); border-color: var(--ss-line-strong); }
.otd__art { width: 52px; height: 52px; flex-shrink: 0; }
.otd__text { flex: 1 1 200px; min-width: 0; }
.otd__k { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.14em; color: var(--ss-teal, var(--ss-accent)); }
.otd__artist { font-weight: 900; font-size: 20px; line-height: 1.1; overflow-wrap: anywhere; }
.otd__sub { font-size: 14px; color: var(--ss-text-3); }
.otd__end { display: flex; align-items: center; gap: 12px; }
.otd__go { color: var(--ss-accent); font-weight: 700; white-space: nowrap; }
</style>
