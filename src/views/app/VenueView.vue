<script setup lang="ts">
// Venue page: photo, your visits, shows here, and a small map where you can
// fix the pin (the fix is yours only; the shared venue stays as is).
import { computed, ref, watch } from "vue";
import { SsArt, SsBackLink, SsButton, SsCard, SsEmpty, SsSkeleton, SsStars, SsStatCard } from "@/design-system";
import VenueMap from "@/components/map/VenueMap.vue";
import { getVenue, setVenuePin, venueStats } from "@/lib/api";
import { errorMessage } from "@/lib/supabase";
import { dateParts, num, parseDate, place } from "@/lib/format";
import type { MapVenue, VenueStats } from "@/lib/types";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const props = defineProps<{ id: string }>();
const log = useLog();
const ui = useUi();

type Venue = NonNullable<Awaited<ReturnType<typeof getVenue>>>;
const venue = ref<Venue | null>(null);
const stats = ref<VenueStats | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [v, s] = await Promise.all([getVenue(props.id), venueStats(props.id), log.load()]);
    venue.value = v as Venue | null;
    stats.value = s;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
watch(() => props.id, load, { immediate: true });

const shows = computed(() => log.entries.filter((e) => e.venue_id === props.id));
const placeText = computed(() => (venue.value ? place(venue.value.city, venue.value.state_code, venue.value.country_code) : ""));
const kicker = computed(() => {
  const parts = [placeText.value];
  if (venue.value?.capacity) parts.push(`Cap ${num(venue.value.capacity)}`);
  return parts.filter(Boolean).join(" · ");
});

// ----- map + pin fixing
const editing = ref(false);
const pending = ref<{ lat: number; lng: number } | null>(null);
const savingPin = ref(false);

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
    lat: coords.value.lat, lng: coords.value.lng, visits: Math.max(1, shows.value.length),
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
async function savePin() {
  if (!pending.value) return;
  savingPin.value = true;
  try {
    await setVenuePin(props.id, pending.value.lat, pending.value.lng);
    await Promise.all([log.refresh(), venueStats(props.id).then((s) => (stats.value = s))]);
    editing.value = false;
    pending.value = null;
    ui.flash("Pin moved. Only your map changes.");
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    savingPin.value = false;
  }
}
</script>

<template>
  <div class="ss-page">
    <SsBackLink />

    <SsSkeleton v-if="loading" height="280px" radius="var(--ss-radius-xl)" />

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
      </div>

      <div class="ss-grid">
        <SsCard title="Shows here">
          <template #aside><RouterLink to="/app/map">See on map →</RouterLink></template>
          <RouterLink v-for="s in shows" :key="s.attendance_id" :to="`/app/shows/${s.attendance_id}`" class="show">
            <SsArt class="show__art" shape="circle" :src="s.artist_image" :seed="s.artist_name" />
            <div class="show__body">
              <div class="show__artist">{{ s.artist_name }}</div>
              <div class="show__sub">
                {{ dateParts(s.event_date).mon }} {{ dateParts(s.event_date).day }}, {{ dateParts(s.event_date).yr }}<template v-if="s.song_count"> · {{ s.song_count }} songs</template>
              </div>
            </div>
            <SsStars :value="s.rating" />
          </RouterLink>
          <p v-if="!shows.length" class="ss-muted">You haven't logged a show here yet.</p>
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
.show {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--ss-line-soft);
  color: var(--ss-text);
  text-decoration: none;
}
.show:hover { text-decoration: none; color: var(--ss-text); }
.show:hover .show__artist { color: var(--ss-accent); }
.show__art { width: 44px; height: 44px; }
.show__body { flex: 1; min-width: 0; }
.show__artist { font-weight: 700; }
.show__sub { font-size: 13px; color: var(--ss-text-muted); }
.map { border-radius: var(--ss-radius-md); overflow: hidden; border: 1px solid var(--ss-line); }
.linkish { border: 0; background: transparent; color: var(--ss-accent); font-weight: 700; padding: 0; }
.hint { font-size: 13px; color: var(--ss-text-faint); margin-top: 8px; }
.fix { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.fix__actions { display: flex; gap: 8px; }
</style>
