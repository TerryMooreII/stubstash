<script setup lang="ts">
withDefaults(defineProps<{ height?: string; width?: string; radius?: string }>(), {
  height: "16px",
  width: "100%",
  radius: "var(--ss-radius-sm)",
});
</script>

<template>
  <div class="ss-skeleton" :style="{ height, width, borderRadius: radius }" aria-hidden="true" />
</template>

<style scoped>
.ss-skeleton {
  background: linear-gradient(90deg, var(--ss-surface-1) 0%, var(--ss-surface-2) 50%, var(--ss-surface-1) 100%);
  background-size: 200% 100%;
  animation: ss-shimmer 1.4s ease-in-out infinite;
}
@keyframes ss-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
