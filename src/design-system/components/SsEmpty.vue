<script setup lang="ts">
// Dashed empty state: "Nothing on setlist.fm for “…”", "No shows yet".
defineProps<{ title: string; body?: string }>();
</script>

<template>
  <div class="ss-empty">
    <div class="ss-empty__title">{{ title }}</div>
    <div v-if="body" class="ss-empty__body">{{ body }}</div>
    <div v-if="$slots.default" class="ss-empty__actions"><slot /></div>
  </div>
</template>

<style scoped>
.ss-empty {
  padding: 28px;
  border-radius: var(--ss-radius-lg);
  background: var(--ss-surface-1);
  border: 1px dashed var(--ss-line-strong);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.ss-empty__title {
  font-weight: 900;
  font-size: 26px;
  line-height: 1.05;
  text-wrap: balance;
}
.ss-empty__body {
  color: var(--ss-text-muted);
  font-size: 15px;
  max-width: 420px;
  text-wrap: pretty;
}
.ss-empty__actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
