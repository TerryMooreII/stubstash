<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 22 });
</script>

<template>
  <span class="ss-logo" :style="{ fontSize: size + 'px' }" aria-label="Stubstash">STUB<span class="ss-logo__accent">STASH</span></span>
</template>

<style scoped>
.ss-logo {
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--ss-text);
  line-height: 1;
  white-space: nowrap;
}
.ss-logo__accent {
  color: var(--ss-accent);
}
</style>
