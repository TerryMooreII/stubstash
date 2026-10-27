<script setup lang="ts">
// Pill chip. "filter" chips toggle on/off (year filters, quick searches);
// "dashed" chips are the "still chasing"-style outlined accent chips.
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";

const props = withDefaults(
  defineProps<{ active?: boolean; variant?: "filter" | "soft" | "dashed" | "static"; size?: "sm" | "md"; to?: RouteLocationRaw }>(),
  { variant: "filter", size: "md" },
);
const tag = computed(() => (props.to ? RouterLink : props.variant === "static" || props.variant === "dashed" ? "span" : "button"));
</script>

<template>
  <component
    :is="tag"
    :to="to"
    :type="tag === 'button' ? 'button' : undefined"
    class="ss-chip"
    :class="[`ss-chip--${variant}`, `ss-chip--${size}`, { 'is-active': active }]"
    :aria-pressed="tag === 'button' && variant === 'filter' ? !!active : undefined"
  >
    <slot />
  </component>
</template>

<style scoped>
.ss-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--ss-radius-pill);
  font-weight: 700;
  white-space: nowrap;
  text-decoration: none;
  line-height: 1.1;
  transition: background var(--ss-dur-fast), color var(--ss-dur-fast), border-color var(--ss-dur-fast);
}
.ss-chip:hover { text-decoration: none; }
.ss-chip--md { padding: 8px 16px; font-size: 14px; }
.ss-chip--sm { padding: 6px 12px; font-size: 13px; }

.ss-chip--filter {
  background: transparent;
  border: 1px solid var(--ss-line-strong);
  color: var(--ss-text-2);
}
.ss-chip--filter:hover { border-color: var(--ss-text-faint); color: var(--ss-text); }
.ss-chip--filter.is-active { background: var(--ss-accent); border-color: var(--ss-accent); color: var(--ss-on-accent); }

.ss-chip--soft,
.ss-chip--static {
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  color: var(--ss-text-2);
  font-weight: 600;
}
.ss-chip--soft:hover { color: var(--ss-text); border-color: var(--ss-line-strong); }
.ss-chip--soft.is-active { background: var(--ss-accent-soft); border-color: var(--ss-accent); color: var(--ss-text); }

.ss-chip--dashed {
  background: transparent;
  border: 1px dashed var(--ss-accent);
  color: var(--ss-accent);
}
</style>
