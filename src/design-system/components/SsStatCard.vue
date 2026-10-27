<script setup lang="ts">
// Dashboard number tile: mono label, huge number, small caption.
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    caption?: string;
    tone?: "default" | "accent" | "butter" | "teal" | "outline";
    size?: "md" | "lg" | "sm";
  }>(),
  { tone: "default", size: "md" },
);
</script>

<template>
  <div class="ss-stat" :class="[`ss-stat--${tone}`, `ss-stat--${size}`]">
    <div class="ss-stat__label">{{ label }}</div>
    <div class="ss-stat__value ss-num">{{ value }}</div>
    <div v-if="caption || $slots.default" class="ss-stat__caption"><slot>{{ caption }}</slot></div>
  </div>
</template>

<style scoped>
.ss-stat {
  padding: 18px;
  border-radius: var(--ss-radius-lg);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  color: var(--ss-text);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 4px;
  min-height: 132px;
  min-width: 0;
}
.ss-stat--sm { min-height: 0; padding: 14px; border-radius: var(--ss-radius-md); }
.ss-stat--accent { background: var(--ss-accent); border-color: var(--ss-accent); color: var(--ss-on-accent); }
.ss-stat--butter { background: var(--ss-butter); border-color: var(--ss-butter); color: var(--ss-on-accent); }
.ss-stat--teal { background: var(--ss-teal); border-color: var(--ss-teal); color: var(--ss-on-accent); }
.ss-stat--outline { background: var(--ss-surface-2); border-color: var(--ss-line-strong); }

.ss-stat__label {
  font-family: var(--ss-font-mono);
  font-size: 10px;
  letter-spacing: var(--ss-tracking-mono);
  text-transform: uppercase;
  opacity: 0.8;
}
.ss-stat__value {
  font-weight: 900;
  font-size: var(--ss-fs-stat);
  line-height: 0.9;
  letter-spacing: var(--ss-tracking-tight);
  overflow-wrap: anywhere;
}
.ss-stat--sm .ss-stat__value { font-size: 34px; line-height: 1; }
.ss-stat--lg .ss-stat__value { font-size: 54px; }
.ss-stat__caption {
  font-size: var(--ss-fs-sm);
  opacity: 0.8;
}
</style>
