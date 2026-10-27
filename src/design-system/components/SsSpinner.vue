<script setup lang="ts">
withDefaults(defineProps<{ size?: number; label?: string }>(), { size: 18, label: "Loading" });
</script>

<template>
  <span class="ss-spinner" role="status" :style="{ width: size + 'px', height: size + 'px' }">
    <span class="ss-visually-hidden">{{ label }}</span>
  </span>
</template>

<style scoped>
.ss-spinner {
  display: inline-block;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: ss-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes ss-spin {
  to { transform: rotate(360deg); }
}
</style>
