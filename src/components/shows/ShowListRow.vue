<script setup lang="ts">
// A linked show row in a card list: optional lead (date or photo), title,
// sub line, and something on the right (stars, a date).
import type { RouteLocationRaw } from "vue-router";

defineProps<{ to: RouteLocationRaw; truncate?: boolean }>();
</script>

<template>
  <RouterLink :to="to" class="show-row">
    <slot name="lead" />
    <div class="show-row__body">
      <div class="show-row__title"><slot /></div>
      <slot name="meta" />
      <div v-if="$slots.sub" class="show-row__sub" :class="{ 'ss-truncate': truncate }"><slot name="sub" /></div>
    </div>
    <slot name="end" />
  </RouterLink>
</template>

<style scoped>
.show-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--ss-line-soft);
  color: var(--ss-text);
  text-decoration: none;
}
.show-row:hover { text-decoration: none; color: var(--ss-text); }
.show-row:hover .show-row__title { color: var(--ss-accent); }
.show-row__body { flex: 1; min-width: 0; }
.show-row__title { font-weight: 700; }
.show-row__sub { font-size: 13px; color: var(--ss-text-muted); }
</style>
