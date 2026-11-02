<script setup lang="ts" generic="K extends string">
// Pill tabs: "Badges 12 | Friends 4". v-model is the active tab's key.
defineProps<{ tabs: readonly { key: K; label: string; count?: number | null }[]; label: string }>();
const active = defineModel<K>({ required: true });
</script>

<template>
  <div class="ss-tabs" role="tablist" :aria-label="label">
    <button
      v-for="t in tabs"
      :key="t.key"
      type="button"
      role="tab"
      class="ss-tabs__tab"
      :class="{ 'is-on': active === t.key }"
      :aria-selected="active === t.key"
      @click="active = t.key"
    >
      {{ t.label }}<span v-if="t.count" class="ss-tabs__n">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.ss-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  align-self: flex-start;
  max-width: 100%;
  overflow-x: auto;
}
.ss-tabs__tab {
  height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--ss-radius-pill);
  background: transparent;
  color: var(--ss-text-3);
  font-weight: 700;
  font-size: 15px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.ss-tabs__tab:hover { color: var(--ss-text); }
.ss-tabs__tab.is-on { background: var(--ss-accent); color: var(--ss-on-accent); }
.ss-tabs__n {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-surface-3);
  color: var(--ss-text);
  font-size: 12px;
  font-weight: 900;
  display: inline-grid;
  place-items: center;
}
.ss-tabs__tab.is-on .ss-tabs__n { background: var(--ss-bg); color: var(--ss-accent); }
</style>
