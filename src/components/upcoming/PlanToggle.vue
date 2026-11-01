<script setup lang="ts">
// "Interested" and "Going" buttons for a search result. Tapping the active one clears it.
import type { PlanStatus } from "@/lib/types";

const props = defineProps<{ status: PlanStatus | null; busy?: boolean }>();
const emit = defineEmits<{ set: [status: "going" | "interested" | null] }>();

const toggle = (s: "going" | "interested") => emit("set", props.status === s ? null : s);
</script>

<template>
  <div class="plan-toggle" @click.stop>
    <button
      type="button"
      class="pt pt--interested"
      :class="{ 'is-on': status === 'interested' }"
      :aria-pressed="status === 'interested'"
      :disabled="busy"
      @click="toggle('interested')"
    >
      {{ status === "interested" ? "★" : "☆" }} Interested
    </button>
    <button
      type="button"
      class="pt pt--going"
      :class="{ 'is-on': status === 'going' }"
      :aria-pressed="status === 'going'"
      :disabled="busy"
      @click="toggle('going')"
    >
      {{ status === "going" ? "✓ Going" : "Going" }}
    </button>
  </div>
</template>

<style scoped>
.plan-toggle { display: flex; gap: 6px; flex-shrink: 0; }
.pt {
  height: 38px;
  padding: 0 14px;
  border-radius: var(--ss-radius-pill);
  border: 1px solid var(--ss-line);
  background: transparent;
  color: var(--ss-text-2);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.pt:disabled { opacity: 0.6; cursor: progress; }
.pt--interested.is-on { border-color: var(--ss-teal); background: rgba(118, 169, 185, 0.18); color: var(--ss-teal-light); }
.pt--going { border-color: var(--ss-accent); color: var(--ss-accent); font-weight: 900; }
.pt--going.is-on { background: var(--ss-accent); color: var(--ss-on-accent); }
</style>
