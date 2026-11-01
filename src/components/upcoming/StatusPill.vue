<script setup lang="ts">
// Small mono pill for a plan status: GOING / INTERESTED / CAN'T GO / INVITED.
import { STATUS_LABEL } from "@/lib/upcoming";
import type { PlanStatus } from "@/lib/types";

defineProps<{ status: PlanStatus | null }>();
</script>

<template>
  <span class="status-pill" :class="`status-pill--${status ?? 'none'}`">{{ status ? STATUS_LABEL[status] : "NOT SET" }}</span>
</template>

<style scoped>
.status-pill {
  padding: 4px 10px;
  border-radius: var(--ss-radius-pill);
  border: 1px solid var(--ss-line);
  background: var(--ss-bg);
  color: var(--ss-text-3);
  font-family: var(--ss-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  white-space: nowrap;
}
.status-pill--going { background: var(--ss-accent); color: var(--ss-on-accent); border-color: var(--ss-bg); }
.status-pill--interested { color: var(--ss-teal-light); border-color: var(--ss-teal); }
.status-pill--invited { color: var(--ss-accent); border-color: var(--ss-accent); }
.status-pill--cant { color: var(--ss-text-muted); }
</style>
