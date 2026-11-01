<script setup lang="ts">
// Advanced search for upcoming shows: artist, venue, city (or home), distance and dates.
import { SsButton, SsChip, SsField, SsIcon, SsInput } from "@/design-system";
import PlaceSearch from "@/components/forms/PlaceSearch.vue";
import { todayIso } from "@/lib/format";
import { RANGES, emptyUpcomingFilters, filtersActive, type UpcomingFilters } from "@/lib/upcoming";
import type { PlaceResult } from "@/lib/geocode";

const f = defineModel<UpcomingFilters>({ required: true });
defineProps<{ homeCity?: string | null; loading?: boolean }>();
const emit = defineEmits<{ submit: [] }>();

const today = todayIso();

function pickPlace(p: PlaceResult) {
  f.value = { ...f.value, place: { label: p.label, lat: p.lat, lng: p.lng } };
}
</script>

<template>
  <form class="upf ss-tile" @submit.prevent="emit('submit')">
    <div class="upf__grid">
      <SsField label="Artist">
        <SsInput v-model="f.artist" placeholder="e.g. Billy Strings" autocomplete="off" />
      </SsField>
      <SsField label="Venue">
        <SsInput v-model="f.venue" placeholder="e.g. Red Rocks" autocomplete="off" />
      </SsField>

      <SsField label="Near" class="span-2" :hint="f.place ? undefined : homeCity ? `Your home: ${homeCity}` : 'Set a home city in Settings, or pick a city'">
        <div v-if="f.place" class="upf__place">
          <SsIcon name="pin" :size="16" /><span class="ss-truncate">{{ f.place.label }}</span>
          <button type="button" class="upf__clear" @click="f = { ...f, place: null }">
            {{ homeCity ? "Use home" : "Clear" }}
          </button>
        </div>
        <PlaceSearch v-else placeholder="Search for a city" @pick="pickPlace" />
      </SsField>

      <SsField label="Distance" class="span-2">
        <div class="upf__chips">
          <SsChip v-for="r in RANGES" :key="r.value" size="sm" :active="f.range === r.value" type="button" @click="f.range = r.value">
            {{ r.label }}
          </SsChip>
        </div>
      </SsField>

      <SsField label="From">
        <SsInput v-model="f.from" type="date" :min="today" />
      </SsField>
      <SsField label="To" hint="Up to 6 months out when blank">
        <SsInput v-model="f.to" type="date" :min="f.from || today" />
      </SsField>
    </div>

    <div class="upf__actions">
      <SsButton type="submit" :loading="loading"><SsIcon name="search" :size="16" />Search shows</SsButton>
      <SsButton v-if="filtersActive(f)" variant="ghost" @click="f = emptyUpcomingFilters()">Clear</SsButton>
    </div>
  </form>
</template>

<style scoped>
.upf { display: flex; flex-direction: column; gap: 14px; padding: 20px; border-radius: var(--ss-radius-lg); }
.upf__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.span-2 { grid-column: span 2; }
@media (max-width: 560px) {
  .upf { padding: 16px; }
  .upf__grid { grid-template-columns: minmax(0, 1fr); }
  .span-2 { grid-column: auto; }
}
.upf__place {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 14px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line);
  font-weight: 700;
  min-width: 0;
}
.upf__place .ss-truncate { flex: 1; min-width: 0; }
.upf__clear { border: 0; background: transparent; color: var(--ss-accent); font-weight: 700; cursor: pointer; flex-shrink: 0; }
.upf__chips { display: flex; gap: 8px; flex-wrap: wrap; }
.upf__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
