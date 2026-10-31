<script setup lang="ts">
// Full-height venue map for you (/app/map) or another user (/u/:handle/map).
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { SsButton, SsChip, SsEmpty, SsSpinner } from "@/design-system";
import VenueMap from "@/components/map/VenueMap.vue";
import { mapHomes, mapTrips, mapVenues, publicProfile } from "@/lib/api";
import { useAsyncData } from "@/composables/useAsyncData";
import { num } from "@/lib/format";
import type { MapHome, MapTrip, MapVenue } from "@/lib/types";
import { useAuth } from "@/stores/auth";

const props = defineProps<{ handle?: string }>();
const router = useRouter();
const auth = useAuth();

interface MapData {
  blocked: "private" | "missing" | null;
  ownerName: string | null;
  venues: MapVenue[];
  homes: MapHome[];
  trips: MapTrip[];
}
const empty = { venues: [], homes: [], trips: [] };

const { data, loading, error, reload } = useAsyncData<MapData>(
  async () => {
    let uid: string | undefined;
    let ownerName: string | null = null;
    if (props.handle) {
      const p = await publicProfile(props.handle);
      if (!p) return { blocked: "missing", ownerName, ...empty };
      ownerName = p.display_name || p.handle;
      if (!p.can_view) return { blocked: "private", ownerName, ...empty };
      if (!p.is_self) uid = p.id;
    }
    const [v, h, t] = await Promise.all([mapVenues(uid), mapHomes(uid), mapTrips(uid)]);
    return { blocked: null, ownerName, venues: v, homes: h.filter((x) => x.lat != null && x.lng != null), trips: t };
  },
  { watch: () => props.handle },
);
const venues = computed(() => data.value?.venues ?? []);
const homes = computed(() => data.value?.homes ?? []);
const trips = computed(() => data.value?.trips ?? []);
const blocked = computed(() => data.value?.blocked ?? null);
const ownerName = computed(() => data.value?.ownerName ?? null);
const mode = ref<"pins" | "glow" | "arcs">("pins");

const modes = [
  { key: "pins", label: "Pins" },
  { key: "glow", label: "Glow" },
  { key: "arcs", label: "Through time" },
] as const;

const cities = computed(() => new Set(venues.value.map((v) => `${(v.city ?? "").toLowerCase()}|${v.country_code}`)).size);
const unplaced = computed(() => venues.value.filter((v) => v.lat == null || v.lng == null).length);
const isOwn = computed(() => !props.handle);

function openVenue(id: string) {
  if (auth.signedIn) router.push(`/app/venues/${id}`);
}
</script>

<template>
  <div class="map-view">
    <div v-if="loading" class="map-view__center"><SsSpinner :size="28" /></div>

    <div v-else-if="blocked || error" class="map-view__center">
      <SsEmpty
        v-if="blocked === 'private'"
        :title="`${ownerName}'s map is private`"
        body="Add them as a friend to see where they've been."
      >
        <SsButton v-if="auth.signedIn" to="/app/friends" size="sm">Find friends</SsButton>
      </SsEmpty>
      <SsEmpty v-else-if="blocked === 'missing'" title="No one by that name" body="Check the link and try again." />
      <SsEmpty v-else title="The map didn't load" :body="error ?? undefined">
        <SsButton size="sm" variant="outline" @click="reload">Try again</SsButton>
      </SsEmpty>
    </div>

    <template v-else>
      <div class="map-view__canvas">
        <VenueMap
          :venues="venues"
          :homes="homes"
          :trips="trips"
          :mode="mode"
          regions
          panel
          scroll-zoom
          @open-venue="openVenue"
        />
      </div>

      <div class="map-view__overlay">
        <div class="map-view__stats">
          <template v-if="!isOwn && ownerName">{{ ownerName }} · </template>{{ num(venues.length) }} venues · {{ num(cities) }} cities
        </div>
        <div class="map-view__modes" role="group" aria-label="Map style">
          <SsChip v-for="m in modes" :key="m.key" size="sm" :active="mode === m.key" @click="mode = m.key">{{ m.label }}</SsChip>
        </div>
        <div v-if="unplaced" class="map-view__note">{{ unplaced }} still being located</div>
      </div>

      <div v-if="!venues.length" class="map-view__empty">
        <SsEmpty
          :title="isOwn ? 'No pins yet' : 'No pins yet'"
          :body="isOwn ? 'Log a show and its venue drops onto your map.' : 'They haven\'t logged any shows yet.'"
        >
          <SsButton v-if="isOwn" to="/app/log" size="sm">Log a show</SsButton>
        </SsEmpty>
      </div>
    </template>
  </div>
</template>

<style scoped>
.map-view {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 420px;
  height: 100%;
}
.map-view__canvas {
  position: absolute;
  inset: 0;
}
.map-view__center,
.map-view__empty {
  position: absolute;
  inset: 0;
  z-index: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.map-view__empty {
  pointer-events: none;
}
.map-view__empty > * {
  pointer-events: auto;
  background: rgba(20, 21, 22, 0.94);
}
.map-view__overlay {
  position: absolute;
  z-index: 550;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: calc(100% - 32px);
}
.map-view__stats {
  padding: 8px 14px;
  border-radius: var(--ss-radius-pill);
  background: rgba(20, 21, 22, 0.94);
  border: 1px solid var(--ss-line);
  font-weight: 900;
  font-size: 14px;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.map-view__modes {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: var(--ss-radius-pill);
  background: rgba(20, 21, 22, 0.94);
  border: 1px solid var(--ss-line);
}
.map-view__modes :deep(.ss-chip--filter:not(.is-active)) {
  border-color: transparent;
}
.map-view__note {
  font-size: 12px;
  color: var(--ss-text-muted);
  padding: 4px 10px;
  border-radius: var(--ss-radius-pill);
  background: rgba(10, 9, 12, 0.8);
}

/* On desktop the region chips sit top-left; keep this stack top-right.
   On phones, drop it below the region chip row so they don't collide. */
@media (max-width: 819px) {
  .map-view {
    min-height: calc(100dvh - var(--ss-topbar-h) - var(--ss-tabbar-h) - var(--ss-safe-top) - var(--ss-safe-bottom) - 8px);
  }
  .map-view__overlay {
    top: 62px;
    right: 16px;
  }
}
</style>
