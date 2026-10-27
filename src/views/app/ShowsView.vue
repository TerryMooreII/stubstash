<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsButton, SsChip, SsEmpty, SsIcon, SsInput, SsPageHeader, SsSkeleton, SsTicketRow } from "@/design-system";
import { place, plural } from "@/lib/format";
import { useLog } from "@/stores/log";

const log = useLog();
const route = useRoute();
const router = useRouter();
onMounted(() => log.load());

// Filter is kept in the URL (?f=2025&q=phish) so back/forward and refresh keep it.
const filter = ref(typeof route.query.f === "string" ? route.query.f : "all");
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
function syncUrl() {
  router.replace({ query: { ...(filter.value !== "all" ? { f: filter.value } : {}), ...(q.value ? { q: q.value } : {}) } });
}
function pick(f: string) {
  filter.value = filter.value === f && f !== "all" ? "all" : f;
  syncUrl();
}

const years = computed(() => [...new Set(log.entries.map((e) => e.event_date.slice(0, 4)))].sort().reverse());
const visibleYears = computed(() => years.value.slice(0, 6));
const olderYears = computed(() => years.value.slice(6));
const hasFest = computed(() => log.entries.some((e) => e.is_festival));
const hasManual = computed(() => log.entries.some((e) => e.source === "manual"));

const list = computed(() => {
  const term = q.value.trim().toLowerCase();
  return log.entries.filter((e) => {
    if (filter.value === "festivals" && !e.is_festival) return false;
    if (filter.value === "manual" && e.source !== "manual") return false;
    if (/^\d{4}$/.test(filter.value) && !e.event_date.startsWith(filter.value)) return false;
    if (term) {
      const hay = `${e.artist_name} ${e.venue_name} ${e.city ?? ""} ${e.tour_name ?? ""}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
});
const olderPick = computed({
  get: () => (olderYears.value.includes(filter.value) ? filter.value : ""),
  set: (v: string) => v && pick(v),
});
</script>

<template>
  <div class="ss-page">
    <SsPageHeader kicker="THE STUB DRAWER" title="My shows">
      <SsButton to="/app/log" size="sm"><SsIcon name="plus" :size="16" :stroke="2.6" />Log a show</SsButton>
    </SsPageHeader>

    <template v-if="log.entries.length">
      <div class="filters">
        <div class="chips" role="group" aria-label="Filter shows">
          <SsChip :active="filter === 'all'" @click="pick('all')">All</SsChip>
          <SsChip v-for="y in visibleYears" :key="y" :active="filter === y" @click="pick(y)">{{ y }}</SsChip>
          <select v-if="olderYears.length" v-model="olderPick" class="older" :class="{ 'is-active': !!olderPick }" aria-label="Older years">
            <option value="">More</option>
            <option v-for="y in olderYears" :key="y" :value="y">{{ y }}</option>
          </select>
          <SsChip v-if="hasFest" :active="filter === 'festivals'" @click="pick('festivals')">Festivals</SsChip>
          <SsChip v-if="hasManual" :active="filter === 'manual'" @click="pick('manual')">Added by you</SsChip>
        </div>
        <SsInput v-model="q" icon="search" placeholder="Filter by artist, venue or city" clearable class="search" @update:model-value="syncUrl" />
      </div>

      <div class="count ss-muted">{{ plural(list.length, "show") }}</div>

      <div class="list">
        <SsTicketRow
          v-for="e in list"
          :key="e.attendance_id"
          layout="row"
          :to="`/app/shows/${e.attendance_id}`"
          :date="e.event_date"
          :artist="e.artist_name"
          :venue="e.venue_name"
          :place="place(e.city, e.state_code, e.country_code)"
          :number="e.show_number"
          :source="e.source"
          :songs="e.song_count"
          :rating="e.rating"
        />
      </div>
      <SsEmpty v-if="!list.length" title="No shows match that" body="Try a different year or clear the search.">
        <SsButton variant="outline" size="sm" @click="filter = 'all'; q = ''; syncUrl()">Show all</SsButton>
      </SsEmpty>
    </template>

    <div v-else-if="log.loading || !log.loaded" class="list">
      <SsSkeleton v-for="i in 6" :key="i" height="92px" radius="var(--ss-radius-md)" />
    </div>

    <SsEmpty v-else title="No shows yet" body="Search setlist.fm for a night you were there, or add one by hand.">
      <SsButton to="/app/log">Log a show</SsButton>
      <SsButton to="/app/welcome" variant="outline">Import from setlist.fm</SsButton>
    </SsEmpty>
  </div>
</template>

<style scoped>
.filters { display: flex; flex-direction: column; gap: 12px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.older {
  appearance: none;
  padding: 8px 16px;
  border-radius: var(--ss-radius-pill);
  border: 1px solid var(--ss-line-strong);
  background: transparent;
  color: var(--ss-text-2);
  font-weight: 700;
  font-size: 14px;
}
.older.is-active { background: var(--ss-accent); border-color: var(--ss-accent); color: var(--ss-on-accent); }
.older option { color: initial; }
.search { max-width: 420px; }
.count { font-size: 14px; margin-top: -8px; }
.list { display: flex; flex-direction: column; gap: 10px; }
</style>
