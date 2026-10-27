<script setup lang="ts">
const model = defineModel<string>({ default: "" });
withDefaults(defineProps<{ placeholder?: string; rows?: number; maxlength?: number; id?: string }>(), { rows: 3 });
</script>

<template>
  <textarea :id="id" v-model="model" class="ss-textarea" :placeholder="placeholder" :rows="rows" :maxlength="maxlength" />
</template>

<style scoped>
.ss-textarea {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  color: var(--ss-text);
  font-size: 15px;
  line-height: 1.45;
  outline: none;
  resize: vertical;
}
.ss-textarea:focus {
  border-color: var(--ss-accent);
}
</style>
