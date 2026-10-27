<script setup lang="ts">
// Label + control + optional hint/error. Wrap any input in it.
defineProps<{ label?: string; hint?: string; error?: string | null; required?: boolean; for?: string }>();
</script>

<template>
  <label class="ss-field" :for="$props.for">
    <span v-if="label" class="ss-field__label">{{ label }}<span v-if="required" aria-hidden="true"> *</span></span>
    <slot />
    <span v-if="error" class="ss-field__error" role="alert">{{ error }}</span>
    <span v-else-if="hint" class="ss-field__hint">{{ hint }}</span>
  </label>
</template>

<style scoped>
.ss-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.ss-field__label {
  font-size: var(--ss-fs-sm);
  font-weight: 700;
  color: var(--ss-text-3);
}
.ss-field__hint {
  font-size: var(--ss-fs-xs);
  color: var(--ss-text-faint);
}
.ss-field__error {
  font-size: var(--ss-fs-xs);
  color: var(--ss-danger);
  font-weight: 600;
}
</style>
