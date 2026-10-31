<script setup lang="ts">
// Venue page: photo, your visits, shows here, and a small map where you can
// fix the pin (the fix is yours only; the shared venue stays as is).
import { computed, ref } from "vue";
import { SsArt, SsBackLink, SsButton, SsCard, SsEmpty, SsSkeleton, SsStars, SsStatCard } from "@/design-system";
import VenueMap from "@/components/map/VenueMap.vue";
import { getVenue, setVenuePin, venueStats } from "@/lib/api";
import ShowListRow from "@/components/shows/ShowListRow.vue";
import { useAction } from "@/composables/useAction";
import { useAsyncData } from "@/composables/useAsyncData";
import { mediumDate, num, parseDate, placeOf } from "@/lib/format";
import type { MapVenue, VenueStats } from "@/lib/types";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const props = defineProps<{ id: string }>();
const log = useLog();
const ui = useUi();

type Venue = NonNullable<Awaited<ReturnType<typeof getVenue>>>;
const { data, loading, error } = useAsyncData(
  async () => {
    const [v, s] = await Promise.all([getVenue(props.id), venueStats(props.id), log.load()]);
    return { venue: v as Venue | null, stats: s as VenueStats | null };
  },
  { watch: () => props.id },
);
const venue = computed(() => data.value?.venue ?? null);
const stats = computed(() => data.value?.stats ?? null);

const shows = computed(() => log.entries.filter((e) => e.venue_id === props.id));
/** Nights here: headliner + openers (or a festival day) are one show. */
const nights = computed(() => log.shows.filter((g) => g.acts.some((a) => a.venue_id === props.id)));
const placeText = computed(() => placeOf(venue.value));
const kicker = computed(() => {
  const parts = [placeText.value];
  if (venue.value?.capacity) parts.push(`Cap ${num(venue.value.capacity)}`);
  return parts.filter(Boolean).join(" · ");
});

// ----- map + pin fixing
const editing = ref(false);
const pending = ref<{ lat: number; lng: number } | null>(null);

const coords = computed(() => {
  if (pending.value) return pending.value;
  const fromLog = shows.value.find((s) => s.lat != null && s.lng != null);
  if (fromLog) return { lat: fromLog.lat!, lng: fromLog.lng! }; // includes your own pin fix
  const v = venue.value;
  if (!v) return null;
  const lat = v.lat ?? v.city_lat, lng = v.lng ?? v.city_lng;
  return lat != null && lng != null ? { lat, lng } : null;
});

const mapVenues = computed<MapVenue[]>(() => {
  const v = venue.value;
  if (!v || !coords.value) return [];
  const years = shows.value.map((s) => parseDate(s.event_date).getFullYear());
  return [{
    venue_id: v.id, name: v.name, city: v.city, state_code: v.state_code, country_code: v.country_code,
    lat: coords.value.lat, lng: coords.value.lng, visits: Math.max(1, nights.value.length),
    first_year: years.length ? Math.min(...years) : new Date().getFullYear(),
    last_year: years.length ? Math.max(...years) : new Date().getFullYear(),
    recent_artists: [...new Set(shows.value.map((s) => s.artist_name))].slice(0, 3),
    miles_from_home: stats.value?.miles_from_home ?? null,
    geo_source: v.geo_source,
  }];
});

/** True when the pin is just the city center (no exact location yet). */
const approx = computed(() => {
  const v = venue.value, c = coords.value;
  return !!v && !!c && !pending.value && v.lat == null && c.lat === v.city_lat && c.lng === v.city_lng;
});

function startFix() {
  editing.value = true;
  pending.value = null;
}
function cancelFix() {
  editing.value = false;
  pending.value = null;
}
const { run: savePin, busy: savingPin } = useAction(
  async () => {
    if (!pending.value) return;
    await setVenuePin(props.id, pending.value.lat, pending.value.lng);
    await Promise.all([log.refresh(), venueStats(props.id).then((s) => data.value && (data.value = { ...data.value, stats: s }))]);
    editing.value = false;
    pending.value = null;
  },
  { success: "Pin moved. Only your map changes." },
);
</script>

<template>
  <div class="ss-page">
    <SsBackLink />

    <SsSkeleton v-if="loading" height="280px" radius="var(--ss-radius-xl)" />

    <SsEmpty v-else-if="(error || !venue) && !ui.online" title="Not saved on this device" body="Open it once with signal, or save everything in Settings › App." />
    <SsEmpty v-else-if="error || !venue" title="Venue not found" :body="error ?? 'This venue may have been removed.'" />

    <template v-else>
      <SsArt
        class="hero"
        :src="venue.image_url"
        :seed="venue.name"
        :alt="venue.name"
        :credit="venue.image_credit"
        credit-label="Venue photo"
        eager
      >
        <div class="hero__text">
          <div v-if="kicker" class="ss-kicker">{{ kicker }}</div>
          <h1 class="ss-hero hero__name">{{ venue.name }}</h1>
        </div>
      </SsArt>

      <div class="tiles">
        <SsStatCard size="sm" tone="accent" label="Visits" :value="`${stats?.visits ?? 0}×`" />
        <SsStatCard size="sm" label="First visit" :value="stats?.first ? parseDate(stats.first).getFullYear() : '—'" />
        <SsStatCard size="sm" label="Your most-visited" :value="stats?.rank ? `#${stats.rank}` : '—'" />
        <SsStatCard
          size="sm"
          label="Miles from home"
          :value="stats?.miles_from_home != null ? num(stats.miles_from_home) : '—'"
        />
        <SsStatCard
          v-if="stats?.miles_traveled"
          size="sm"
          label="Miles traveled here"
          :value="num(stats.miles_traveled)"
        />
      </div>

      <div class="ss-grid">
        <SsCard title="Shows here">
          <template #aside><RouterLink to="/app/map">See on map →</RouterLink></template>
          <ShowListRow v-for="g in nights" :key="g.key" :to="`/app/shows/${g.acts[0]!.attendance_id}`">
            <template #lead><SsArt class="show__art" shape="circle" :src="g.acts[0]!.artist_image" :seed="g.acts[0]!.artist_name" /></template>
            {{ g.acts[0]!.artist_name }}
            <template v-if="g.acts.length > 1" #meta>
              <div class="show__with">with {{ g.acts.slice(1).map((a) => a.artist_name).join(", ") }}</div>
            </template>
            <template #sub>
              {{ mediumDate(g.event_date) }}<template v-if="g.festival_name"> · {{ g.festival_name }}</template><template v-else-if="g.song_count"> · {{ g.song_count }} songs</template>
            </template>
            <template #end><SsStars :value="g.rating" /></template>
          </ShowListRow>
          <p v-if="!nights.length" class="ss-muted">You haven't logged a show here yet.</p>
        </SsCard>

        <SsCard title="Where it is">
          <template #aside>
            <button v-if="!editing && coords" type="button" class="linkish" @click="startFix">Wrong spot? Fix the pin</button>
          </template>
          <div v-if="coords" class="map">
            <VenueMap
              :venues="mapVenues"
              :scroll-zoom="false"
              height="260px"
              :edit-pin="editing"
              @pick-location="(lat, lng) => (pending = { lat, lng })"
            />
          </div>
          <p v-else class="ss-muted">We're still looking up where this venue is. Check back in a few minutes.</p>
          <p v-if="approx && !editing" class="hint">This pin is at the city center for now.</p>
          <div v-if="editing" class="fix">
            <span class="ss-muted">{{ pending ? "Looks good?" : "Tap the map to move the pin." }}</span>
            <div class="fix__actions">
              <SsButton variant="outline" size="sm" @click="cancelFix">Cancel</SsButton>
              <SsButton size="sm" :disabled="!pending" :loading="savingPin" @click="savePin">Save location</SsButton>
            </div>
          </div>
        </SsCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hero {
  border-radius: var(--ss-radius-xl);
  min-height: 280px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.hero__text {
  position: relative;
  z-index: 1;
  padding: 24px;
  background: linear-gradient(180deg, transparent, rgba(10, 9, 12, 0.92));
}
.hero__name { overflow-wrap: anywhere; margin-top: 6px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.show__art { width: 44px; height: 44px; }
.show__with { font-size: 13px; color: var(--ss-text-2); overflow-wrap: anywhere; }
.map { border-radius: var(--ss-radius-md); overflow: hidden; border: 1px solid var(--ss-line); }
.linkish { border: 0; background: transparent; color: var(--ss-accent); font-weight: 700; padding: 0; }
.hint { font-size: 13px; color: var(--ss-text-faint); margin-top: 8px; }
.fix { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.fix__actions { display: flex; gap: 8px; }
</style>
