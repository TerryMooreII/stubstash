<script setup lang="ts">
// Native <select> styled like SsInput (md size). Native keeps it accessible
// and gives phones their own picker.
const model = defineModel<string>({ default: "" });
defineProps<{
  options: { value: string; label: string }[];
  /** Label for the empty value, e.g. "Any year". Omit to have no empty option. */
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}>();
</script>

<template>
  <div class="ss-select" :class="{ 'is-empty': !model, 'is-disabled': disabled }">
    <select :id="id" v-model="model" :disabled="disabled">
      <option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <svg class="ss-select__chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </div>
</template>

<style scoped>
.ss-select {
  position: relative;
  display: flex;
  align-items: center;
  height: 46px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  transition: border-color var(--ss-dur-fast);
  min-width: 0;
}
.ss-select:focus-within { border-color: var(--ss-accent); }
.ss-select.is-disabled { opacity: 0.5; }
select {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 100%;
  padding: 0 40px 0 14px;
  background: transparent;
  border: 0;
  outline: none;
  color: var(--ss-text);
  font: inherit;
  font-size: 16px;
  color-scheme: dark;
  cursor: pointer;
}
.is-empty select { color: var(--ss-text-faint); }
option { color: var(--ss-text); background: var(--ss-surface-2); }
.ss-select__chev {
  position: absolute;
  right: 14px;
  pointer-events: none;
  color: var(--ss-text-muted);
}
</style>
