<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ value: number; max?: number; color?: string; height?: number; label?: string }>(),
  { max: 100, height: 10 },
);
const pct = computed(() => Math.max(0, Math.min(100, (props.value / (props.max || 1)) * 100)));
</script>

<template>
  <div
    class="ss-progress"
    role="progressbar"
    :aria-valuenow="value"
    aria-valuemin="0"
    :aria-valuemax="max"
    :aria-label="label"
    :style="{ height: height + 'px' }"
  >
    <div class="ss-progress__bar" :style="{ width: pct + '%', background: color ?? 'var(--ss-accent)' }" />
  </div>
</template>

<style scoped>
.ss-progress {
  border-radius: 10px;
  background: var(--ss-surface-2);
  overflow: hidden;
  width: 100%;
}
.ss-progress__bar {
  height: 100%;
  border-radius: 10px;
  transition: width 600ms var(--ss-ease);
}
</style>
