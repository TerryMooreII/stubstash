<script setup lang="ts">
// The dark panel used for every section: #141516 fill, 1px border, 18px radius.
// Optional title row with a right-side slot ("Peak: 2025 · 14 shows", "All 87 →").
withDefaults(
  defineProps<{
    title?: string;
    tone?: "default" | "sunken" | "accent" | "teal" | "dashed";
    pad?: "sm" | "md" | "lg";
    as?: string;
  }>(),
  { tone: "default", pad: "md", as: "section" },
);
</script>

<template>
  <component :is="as" class="ss-card" :class="[`ss-card--${tone}`, `ss-card--pad-${pad}`]">
    <header v-if="title || $slots.aside" class="ss-card__head">
      <h2 v-if="title" class="ss-card__title">{{ title }}</h2>
      <div v-if="$slots.aside" class="ss-card__aside"><slot name="aside" /></div>
    </header>
    <slot />
  </component>
</template>

<style scoped>
.ss-card {
  border-radius: var(--ss-radius-lg);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  min-width: 0;
}
.ss-card--pad-sm { padding: 14px; }
.ss-card--pad-md { padding: 20px; }
.ss-card--pad-lg { padding: 28px; border-radius: 24px; }
.ss-card--sunken { background: var(--ss-surface-0); }
.ss-card--accent { background: var(--ss-accent); border-color: var(--ss-accent); color: var(--ss-on-accent); }
.ss-card--teal { background: var(--ss-teal); border-color: var(--ss-teal); color: var(--ss-on-accent); }
.ss-card--dashed { border: 1px dashed var(--ss-line-strong); text-align: center; }

.ss-card__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.ss-card__title {
  font-weight: 900;
  font-size: var(--ss-fs-xl);
  line-height: 1.1;
}
.ss-card__aside {
  font-size: var(--ss-fs-sm);
  color: var(--ss-text-muted);
}
.ss-card--accent .ss-card__aside,
.ss-card--teal .ss-card__aside {
  color: inherit;
}
</style>
