<script setup lang="ts">
// Where and When for Find shows, in a sheet. Edits a copy and applies it on
// "Show shows", so the search runs once.
import { ref, watch } from "vue";
import { SsButton, SsChip, SsField, SsIcon, SsInput, SsSheet } from "@/design-system";
import PlaceSearch from "@/components/forms/PlaceSearch.vue";
import { todayIso } from "@/lib/format";
import { RANGES, WHEN_OPTIONS, type UpcomingFilters } from "@/lib/upcoming";
import type { PlaceResult } from "@/lib/geocode";

const open = defineModel<boolean>({ default: false });
const props = defineProps<{ mode: "where" | "when"; filters: UpcomingFilters; homeCity?: string | null }>();
const emit = defineEmits<{ apply: [patch: Partial<UpcomingFilters>] }>();

const today = todayIso();
const draft = ref<UpcomingFilters>({ ...props.filters });
watch(open, (o) => {
  if (o) draft.value = { ...props.filters };
});

function pickPlace(p: PlaceResult) {
  draft.value = { ...draft.value, place: { label: p.label, lat: p.lat, lng: p.lng } };
  if (draft.value.range === "any") draft.value.range = "50";
}

function apply() {
  const d = draft.value;
  emit("apply", props.mode === "where"
    ? { place: d.place, range: d.range }
    : { when: d.when, from: d.when === "custom" ? d.from : "", to: d.when === "custom" ? d.to : "" });
  open.value = false;
}
</script>

<template>
  <SsSheet v-model="open" :label="mode === 'where' ? 'Where' : 'When'" :width="460">
    <template v-if="mode === 'where'">
      <div class="ss-h2">Where?</div>

      <SsField label="Near">
        <div class="ufs__places">
          <button
            v-if="homeCity"
            type="button"
            class="ufs__place"
            :aria-pressed="!draft.place"
            @click="draft = { ...draft, place: null }"
          >
            <SsIcon name="home" :size="16" />
            <span class="ss-truncate">Home · {{ homeCity }}</span>
            <SsIcon v-if="!draft.place" name="check" :size="16" class="ufs__check" />
          </button>
          <div v-if="draft.place" class="ufs__place" aria-pressed="true">
            <SsIcon name="pin" :size="16" />
            <span class="ss-truncate">{{ draft.place.label }}</span>
            <SsIcon name="check" :size="16" class="ufs__check" />
          </div>
        </div>
        <PlaceSearch :placeholder="draft.place || homeCity ? 'Search another city' : 'Search for a city'" @pick="pickPlace" />
        <p v-if="!homeCity && !draft.place" class="ufs__hint">
          No home city yet. <RouterLink to="/app/settings">Set one in Settings</RouterLink> to see shows near you by default.
        </p>
      </SsField>

      <SsField label="Distance">
        <div class="ufs__chips">
          <SsChip v-for="r in RANGES" :key="r.value" size="sm" :active="draft.range === r.value" @click="draft.range = r.value">
            {{ r.label }}
          </SsChip>
        </div>
      </SsField>
    </template>

    <template v-else>
      <div class="ss-h2">When?</div>
      <div class="ufs__chips">
        <SsChip v-for="w in WHEN_OPTIONS" :key="w.value" :active="draft.when === w.value" @click="draft.when = w.value">
          {{ w.label }}
        </SsChip>
      </div>
      <div v-if="draft.when === 'custom'" class="ufs__dates">
        <SsField label="From">
          <SsInput v-model="draft.from" type="date" :min="today" />
        </SsField>
        <SsField label="To" hint="Up to 6 months out when blank">
          <SsInput v-model="draft.to" type="date" :min="draft.from || today" />
        </SsField>
      </div>
    </template>

    <div class="ufs__actions">
      <SsButton variant="outline" @click="open = false">Cancel</SsButton>
      <SsButton class="ufs__go" @click="apply"><SsIcon name="search" :size="16" />Show shows</SsButton>
    </div>
  </SsSheet>
</template>

<style scoped>
.ufs__places { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.ufs__place {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 14px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  color: var(--ss-text);
  font-weight: 700;
  font-size: 15px;
  text-align: left;
  min-width: 0;
  cursor: pointer;
}
.ufs__place[aria-pressed="true"] { border-color: var(--ss-accent); }
.ufs__place .ss-truncate { flex: 1; min-width: 0; }
.ufs__check { color: var(--ss-accent); flex-shrink: 0; }
.ufs__hint { margin: 8px 0 0; font-size: 13px; color: var(--ss-text-muted); }
.ufs__chips { display: flex; gap: 8px; flex-wrap: wrap; }
.ufs__dates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 420px) { .ufs__dates { grid-template-columns: minmax(0, 1fr); } }
.ufs__actions { display: flex; gap: 8px; }
.ufs__go { flex: 1; }
</style>
