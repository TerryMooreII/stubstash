<script setup lang="ts">
// Vertical bar chart ("Shows per year"): value above each bar, mono label below.
// The highlighted bar uses the accent; others use slate.
// With `minColumn`, bars never get thinner than that: the chart scrolls sideways
// instead and starts scrolled to the right (most recent).
import { computed, nextTick, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{ data: { label: string; value: number; highlight?: boolean }[]; height?: number; minColumn?: number }>(),
  { height: 170, minColumn: 0 },
);
const GAP = 8;
const scroller = ref<HTMLElement>();
const minWidth = computed(() => (props.minColumn ? props.data.length * (props.minColumn + GAP) - GAP : 0));
function toEnd() {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollLeft = scroller.value.scrollWidth;
  });
}
onMounted(toEnd);
watch(() => props.data.length, toEnd);
const max = computed(() => Math.max(1, ...props.data.map((d) => d.value)));
const summary = computed(() => props.data.map((d) => `${d.label}: ${d.value}`).join(", "));
</script>

<template>
  <div ref="scroller" class="ss-bars-scroll" :class="{ 'can-scroll': minColumn > 0 }">
  <div class="ss-bars" :style="{ height: height + 'px', minWidth: minWidth ? minWidth + 'px' : undefined }" role="img" :aria-label="summary">
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
  </div>
</template>

<style scoped>
.ss-bars-scroll.can-scroll {
  position: relative;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  padding-bottom: 4px;
}
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
