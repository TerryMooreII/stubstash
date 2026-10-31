<script setup lang="ts">
// Button row under the poster / share card: your buttons, then a round close.
// Give a button class "actions__dark" for the dark outline style.
import { SsIcon } from "@/design-system";

defineEmits<{ close: [] }>();
</script>

<template>
  <div class="actions">
    <slot />
    <button type="button" class="close" aria-label="Close" @click="$emit('close')"><SsIcon name="close" :size="18" /></button>
  </div>
</template>

<style scoped>
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; }
.actions :slotted(.actions__dark) { background: var(--ss-surface-2); }
.close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--ss-line-strong);
  background: var(--ss-surface-2);
  color: var(--ss-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
