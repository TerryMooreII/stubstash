<script setup lang="ts">
// Vertical bar chart ("Shows per year"): value above each bar, mono label below.
// The highlighted bar uses the accent; others use slate.
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ data: { label: string; value: number; highlight?: boolean }[]; height?: number }>(),
  { height: 170 },
);
const max = computed(() => Math.max(1, ...props.data.map((d) => d.value)));
const summary = computed(() => props.data.map((d) => `${d.label}: ${d.value}`).join(", "));
</script>

<template>
  <div class="ss-bars" :style="{ height: height + 'px' }" role="img" :aria-label="summary">
    <div v-for="d in data" :key="d.label" class="ss-bars__col">
      <div class="ss-bars__n ss-num">{{ d.value }}</div>
      <div
        class="ss-bars__bar"
        :class="{ 'is-hi': d.highlight }"
        :style="{ height: (d.value / max) * 100 + '%' }"
      />
      <div class="ss-bars__label">{{ d.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.ss-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.ss-bars__col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: 100%;
}
.ss-bars__n {
  font-weight: 900;
  font-size: 13px;
}
.ss-bars__bar {
  width: 100%;
  min-height: 4px;
  background: var(--ss-slate);
  border-radius: 6px 6px 2px 2px;
  transition: height 600ms var(--ss-ease);
}
.ss-bars__bar.is-hi {
  background: var(--ss-accent);
}
.ss-bars__label {
  font-family: var(--ss-font-mono);
  font-size: 10px;
  color: var(--ss-text-muted);
}
</style>
