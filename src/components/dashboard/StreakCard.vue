<script setup lang="ts">
// Teal streak card: consecutive months with at least one show.
import { computed } from "vue";
import type { DashboardStats } from "@/lib/types";

const props = defineProps<{ streak: DashboardStats["streak"] }>();

const cells = computed(() => {
  const months = props.streak.last12 ?? Array(12).fill(false);
  const now = new Date();
  return months.map((on, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months.length - 1 - i), 1);
    return { on, label: d.toLocaleString("en-US", { month: "short", year: "numeric" }) };
  });
});
const footer = computed(() => {
  const s = props.streak;
  if (!s.longest) return "Log a show to start a streak.";
  const longest = `Longest: ${s.longest} month${s.longest === 1 ? "" : "s"}${s.longest_year ? ` (${s.longest_year})` : ""}.`;
  return s.current ? `${longest} Next show keeps it alive.` : `${longest} One show this month starts a new one.`;
});
</script>

<template>
  <section class="streak">
    <div class="streak__k">STREAK</div>
    <div>
      <div class="streak__n ss-num">{{ streak.current }} mo</div>
      <div class="streak__sub">in a row with at least one show</div>
    </div>
    <div class="streak__cells" role="img" :aria-label="`Shows in the last 12 months: ${cells.filter((c) => c.on).length} of 12 months`">
      <div v-for="(c, i) in cells" :key="i" class="streak__cell" :class="{ 'is-on': c.on, 'is-recent': i >= 8 }" :title="c.label" />
    </div>
    <div class="streak__foot">{{ footer }}</div>
  </section>
</template>

<style scoped>
.streak {
  padding: 20px;
  border-radius: var(--ss-radius-lg);
  background: var(--ss-teal);
  color: var(--ss-on-accent);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  height: 100%;
}
.streak__k { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: var(--ss-tracking-mono); }
.streak__n { font-weight: 900; font-size: 72px; line-height: 0.85; letter-spacing: -0.04em; }
.streak__sub { font-weight: 700; font-size: 17px; margin-top: 6px; }
.streak__cells { display: flex; gap: 5px; }
.streak__cell { flex: 1; height: 22px; border-radius: 4px; background: rgba(255, 255, 255, 0.35); }
.streak__cell.is-on { background: rgba(10, 9, 12, 0.45); }
.streak__cell.is-on.is-recent { background: var(--ss-bg); }
.streak__foot { font-size: 13px; }
</style>
