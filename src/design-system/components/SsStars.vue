<script setup lang="ts">
// Star rating. Read-only by default; pass `editable` (with v-model) for input.
// Editable supports half stars: tap the left half of a star for .5.
import { computed } from "vue";
import { stars } from "@/lib/format";

const model = defineModel<number | null>({ default: null });
const props = withDefaults(defineProps<{ editable?: boolean; size?: number; value?: number | null }>(), { size: 30 });

const current = computed(() => (props.editable ? model.value : props.value ?? model.value) ?? 0);

function pick(n: number, e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  const half = e.offsetX < el.clientWidth / 2;
  const v = half ? n - 0.5 : n;
  model.value = model.value === v ? null : v; // tap again to clear
}
function onKey(e: KeyboardEvent) {
  const v = model.value ?? 0;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") { model.value = Math.min(5, v + 0.5); e.preventDefault(); }
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") { model.value = v <= 0.5 ? null : v - 0.5; e.preventDefault(); }
}
</script>

<template>
  <span v-if="!editable" class="ss-stars" :aria-label="current ? `${current} out of 5 stars` : 'Not rated'">{{ stars(current) }}</span>
  <div
    v-else
    class="ss-stars-input"
    role="slider"
    tabindex="0"
    aria-label="Rating"
    aria-valuemin="0"
    aria-valuemax="5"
    :aria-valuenow="current"
    :aria-valuetext="current ? `${current} stars` : 'Not rated'"
    @keydown="onKey"
  >
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      tabindex="-1"
      class="ss-stars-input__star"
      :style="{ fontSize: size + 'px' }"
      :aria-label="`${n} stars`"
      @click="pick(n, $event)"
    >
      <span class="ss-stars-input__bg">★</span>
      <span class="ss-stars-input__fg" :style="{ width: current >= n ? '100%' : current >= n - 0.5 ? '50%' : '0%' }">★</span>
    </button>
  </div>
</template>

<style scoped>
.ss-stars {
  color: var(--ss-accent);
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.ss-stars-input {
  display: inline-flex;
  gap: 2px;
  border-radius: var(--ss-radius-sm);
}
.ss-stars-input__star {
  position: relative;
  border: 0;
  background: transparent;
  padding: 2px;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
}
.ss-stars-input__bg {
  color: var(--ss-line-strong);
}
.ss-stars-input__fg {
  position: absolute;
  left: 2px;
  top: 2px;
  overflow: hidden;
  color: var(--ss-accent);
  white-space: nowrap;
  transition: width var(--ss-dur-fast);
}
</style>
