<script setup lang="ts">
// Month + year as two native selects. The value is the first of the month
// (YYYY-MM-01), or null when no year is picked. Month is optional (January).
import { computed } from "vue";
import { SsSelect } from "@/design-system";

const model = defineModel<string | null>({ default: null });
const props = withDefaults(defineProps<{ label: string; minYear?: number; blankYear?: string }>(), {
  minYear: 1950,
  blankYear: "Year",
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthOptions = MONTHS.map((m, i) => ({ value: String(i + 1).padStart(2, "0"), label: m }));
const yearOptions = computed(() => {
  const out: { value: string; label: string }[] = [];
  for (let y = new Date().getFullYear(); y >= props.minYear; y--) out.push({ value: String(y), label: String(y) });
  return out;
});

const year = computed({
  get: () => model.value?.slice(0, 4) ?? "",
  set: (y: string) => (model.value = y ? `${y}-${month.value || "01"}-01` : null),
});
const month = computed({
  get: () => (model.value ? model.value.slice(5, 7) : ""),
  set: (m: string) => {
    if (year.value) model.value = `${year.value}-${m || "01"}-01`;
  },
});
</script>

<template>
  <div class="my" role="group" :aria-label="label">
    <SsSelect v-model="month" :options="monthOptions" placeholder="Month" :disabled="!year" :aria-label="`${label}: month`" />
    <SsSelect v-model="year" :options="yearOptions" :placeholder="blankYear" :aria-label="`${label}: year`" />
  </div>
</template>

<style scoped>
.my {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  min-width: 0;
}
</style>
