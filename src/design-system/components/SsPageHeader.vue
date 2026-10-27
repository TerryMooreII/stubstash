<script setup lang="ts">
// Kicker + big headline (+ optional actions on the right), e.g.
// "THE STUB DRAWER" / "My shows" / [+ Log a show]
withDefaults(defineProps<{ kicker?: string; title: string; kickerTone?: "accent" | "teal" }>(), { kickerTone: "accent" });
</script>

<template>
  <header class="ss-page-header">
    <div class="ss-page-header__text">
      <div v-if="kicker" class="ss-kicker" :class="{ 'is-teal': kickerTone === 'teal' }">{{ kicker }}</div>
      <h1 class="ss-h1 ss-page-header__title">{{ title }}</h1>
    </div>
    <div v-if="$slots.default" class="ss-page-header__actions"><slot /></div>
  </header>
</template>

<style scoped>
.ss-page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.ss-page-header__text {
  min-width: 0;
}
.ss-page-header__title {
  margin-top: 6px;
}
.is-teal {
  color: var(--ss-teal-light);
}
.ss-page-header__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
