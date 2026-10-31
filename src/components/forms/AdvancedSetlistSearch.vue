<script setup lang="ts">
// "Find an older show": setlist.fm search by artist (exact, via suggestions),
// year or exact date, venue, city, state, country and tour.
import { computed } from "vue";
import { SsButton, SsField, SsIcon, SsInput, SsSelect } from "@/design-system";
import AutocompleteInput, { type AutocompleteOption } from "@/components/forms/AutocompleteInput.vue";
import { setlistfm } from "@/lib/api";
import { countryOptions } from "@/lib/countries";
import { emptyFilters, hasWhere as canSearch, type AdvancedFilters } from "@/lib/advancedSearch";

const f = defineModel<AdvancedFilters>({ required: true });
defineProps<{ loading?: boolean }>();
const emit = defineEmits<{ submit: [] }>();

const thisYear = new Date().getFullYear();
const years = Array.from({ length: thisYear - 1949 }, (_, i) => String(thisYear - i)).map((y) => ({ value: y, label: y }));
const countries = countryOptions();
const today = new Date().toISOString().slice(0, 10);

/** setlist.fm needs at least one of these besides a date. */
const hasWhere = computed(() => canSearch(f.value));
const anything = computed(() => hasWhere.value || !!f.value.year || !!f.value.date);

async function findArtists(q: string): Promise<AutocompleteOption[]> {
  const { artists } = await setlistfm.artists(q);
  return artists.map((a) => ({ id: a.mbid, label: a.name, sub: a.disambiguation }));
}

function onArtistInput(v: string) {
  // Typing after a pick means it's no longer that exact artist.
  if (f.value.artist_mbid && v !== f.value.artist) f.value.artist_mbid = "";
  f.value.artist = v;
}

function clearAll() {
  f.value = emptyFilters();
}

function submit() {
  if (hasWhere.value) emit("submit");
}
</script>

<template>
  <form class="adv ss-tile" @submit.prevent="submit">
    <div class="adv__grid">
      <SsField label="Artist" class="span-2" :hint="f.artist_mbid ? 'Exact artist picked from setlist.fm' : 'Pick from the list for an exact match'">
        <div class="artist">
          <AutocompleteInput
            :model-value="f.artist"
            :search="findArtists"
            placeholder="e.g. Phish"
            @update:model-value="onArtistInput"
            @select="(o) => { f.artist = o.label; f.artist_mbid = o.id; }"
          />
          <span v-if="f.artist_mbid" class="artist__exact" title="Exact match"><SsIcon name="check" :size="16" /></span>
        </div>
      </SsField>

      <SsField label="Year">
        <SsSelect v-model="f.year" :options="years" placeholder="Any year" :disabled="!!f.date" />
      </SsField>
      <SsField label="Exact date" hint="Overrides the year">
        <SsInput v-model="f.date" type="date" :max="today" min="1950-01-01" />
      </SsField>

      <SsField label="Venue">
        <SsInput v-model="f.venue" placeholder="e.g. Red Rocks" />
      </SsField>
      <SsField label="City">
        <SsInput v-model="f.city" placeholder="e.g. Denver" />
      </SsField>

      <SsField label="Country">
        <SsSelect v-model="f.country" :options="countries" placeholder="Any country" />
      </SsField>
      <SsField label="State / province" hint="Code, like CO or ON">
        <SsInput
          :model-value="f.state"
          placeholder="e.g. CO"
          :maxlength="3"
          autocomplete="off"
          @update:model-value="(v: string) => (f.state = v.toUpperCase())"
        />
      </SsField>

      <SsField label="Tour" class="span-2">
        <SsInput v-model="f.tour" placeholder="e.g. Summer Tour 1997" />
      </SsField>
    </div>

    <p class="adv__note">
      setlist.fm searches one year at a time. Not sure when? Leave the year blank and narrow it with the venue or city.
    </p>

    <div class="adv__actions">
      <SsButton type="submit" :disabled="!hasWhere" :loading="loading">
        <SsIcon name="search" :size="16" />Search setlist.fm
      </SsButton>
      <SsButton v-if="anything" variant="ghost" @click="clearAll">Clear</SsButton>
      <span v-if="anything && !hasWhere" class="adv__need">Add an artist, venue, city, place or tour too.</span>
    </div>
  </form>
</template>

<style scoped>
.adv {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border-radius: var(--ss-radius-lg, 16px);
}
.adv__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}
.span-2 { grid-column: span 2; }
@media (max-width: 560px) {
  .adv { padding: 16px; }
  .adv__grid { grid-template-columns: minmax(0, 1fr); }
  .span-2 { grid-column: auto; }
}
.artist { position: relative; }
.artist__exact {
  position: absolute;
  right: 12px;
  top: 15px;
  color: var(--ss-accent);
  pointer-events: none;
}
.adv__note { font-size: 13px; color: var(--ss-text-faint); margin: 0; }
.adv__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.adv__need { font-size: 13px; color: var(--ss-text-muted); }
</style>
