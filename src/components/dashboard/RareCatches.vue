<script setup lang="ts">
// Personal "rare catches": newest first-time hears and songs heard only once
// from artists you've seen 3+ times.
import { computed } from "vue";
import { SsCard } from "@/design-system";
import { mediumDate, num } from "@/lib/format";
import type { DashboardStats } from "@/lib/types";

const props = defineProps<{ stats: DashboardStats }>();

const cards = computed(() => {
  const once = props.stats.one_timers.map((s) => ({ ...s, kind: "ONLY TIME", tone: "butter", note: "Heard once, ever" }));
  const first = props.stats.first_hears.map((s) => ({ ...s, kind: "FIRST TIME", tone: "teal", note: "Your first time hearing it" }));
  // Mix them so both kinds show when available, newest first, max 3.
  const seen = new Set<string>();
  return [...once.slice(0, 2), ...first]
    .filter((c) => {
      const k = c.attendance_id + c.song;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3);
});
</script>

<template>
  <SsCard title="Rare catches">
    <template #aside>{{ num(stats.first_hear_total) }} songs heard for the first time</template>
    <div v-if="cards.length" class="grid">
      <RouterLink v-for="c in cards" :key="c.kind + c.attendance_id + c.song" :to="`/app/shows/${c.attendance_id}`" class="catch" :class="`catch--${c.tone}`">
        <div class="catch__k">{{ c.kind }} · {{ mediumDate(c.date).toUpperCase() }}</div>
        <div class="catch__song">{{ c.song }}</div>
        <div class="catch__note">{{ c.artist }}. {{ c.note }}</div>
      </RouterLink>
    </div>
    <p v-else class="ss-muted">Log a show with a setlist and your rare catches show up here.</p>
  </SsCard>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.catch {
  text-align: left;
  padding: 16px;
  border-radius: var(--ss-radius-md);
  color: var(--ss-on-accent);
  text-decoration: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform var(--ss-dur-fast) var(--ss-ease);
}
.catch:hover { color: var(--ss-on-accent); text-decoration: none; transform: translateY(-2px); }
.catch--butter { background: var(--ss-butter); }
.catch--teal { background: var(--ss-teal-light); }
.catch__k { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: var(--ss-tracking-mono); font-weight: 700; }
.catch__song { font-weight: 900; font-size: 26px; line-height: 1; overflow-wrap: anywhere; }
.catch__note { font-size: 14px; font-weight: 600; }
</style>
