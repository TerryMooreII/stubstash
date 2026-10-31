<script setup lang="ts">
// Stacked MON / DAY / YEAR date, as on a ticket stub.
import { computed } from "vue";
import { dateParts } from "@/lib/format";

const props = withDefaults(defineProps<{ date: string; size?: "sm" | "md" }>(), { size: "sm" });
const d = computed(() => dateParts(props.date));
</script>

<template>
  <div class="date-block" :class="`date-block--${size}`">
    <div class="date-block__mon">{{ d.mon }}</div>
    <div class="date-block__day">{{ d.day }}</div>
    <div class="date-block__yr">{{ d.yr }}</div>
  </div>
</template>

<style scoped>
.date-block { text-align: center; flex-shrink: 0; }
.date-block__mon { font-family: var(--ss-font-mono); color: var(--ss-accent); }
.date-block__day { font-weight: 900; line-height: 1; }
.date-block__yr { color: var(--ss-text-muted); }
.date-block--sm { width: 52px; }
.date-block--sm .date-block__mon { font-size: 10px; }
.date-block--sm .date-block__day { font-size: 22px; }
.date-block--sm .date-block__yr { font-size: 11px; }
.date-block--md { width: 56px; }
.date-block--md .date-block__mon { font-size: 11px; }
.date-block--md .date-block__day { font-size: 26px; }
.date-block--md .date-block__yr { font-size: 12px; }
</style>
