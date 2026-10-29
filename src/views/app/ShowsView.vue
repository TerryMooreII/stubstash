<script setup lang="ts">
// My shows: one ticket per show (a venue on a date, headliner + openers).
// "Select" lets you tick several shows and mark them as a festival at once;
// a suggestion card spots likely festivals that aren't marked yet.
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsButton, SsChip, SsEmpty, SsIcon, SsInput, SsPageHeader, SsSkeleton, SsTicketRow } from "@/design-system";
import FestivalSheet from "@/components/forms/FestivalSheet.vue";
import { setFestival } from "@/lib/api";
import { mediumDate, place, plural } from "@/lib/format";
import { festivalCount, suggestFestivals, type FestivalSuggestion, type ShowGroup } from "@/lib/shows";
import { errorMessage } from "@/lib/supabase";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const log = useLog();
const ui = useUi();
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
  return log.shows.filter((g) => {
    if (filter.value === "festivals" && !g.is_festival) return false;
    if (filter.value === "manual" && !g.acts.some((a) => a.source === "manual")) return false;
    if (/^\d{4}$/.test(filter.value) && !g.event_date.startsWith(filter.value)) return false;
    if (term) {
      const hay = [
        ...g.acts.map((a) => `${a.artist_name} ${a.tour_name ?? ""}`),
        g.venue_name, g.city ?? "", g.festival_name ?? "",
      ].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
});
const fests = computed(() => festivalCount(list.value.flatMap((g) => g.acts)));
const olderPick = computed({
  get: () => (olderYears.value.includes(filter.value) ? filter.value : ""),
  set: (v: string) => v && pick(v),
});

const placeOf = (g: Pick<ShowGroup, "city" | "state_code" | "country_code">) => place(g.city, g.state_code, g.country_code);
const openersOf = (g: ShowGroup) => g.acts.slice(1).map((a) => ({ name: a.artist_name, to: `/app/shows/${a.attendance_id}` }));

// ---------------------------------------------------------------- select + bulk festival
const selecting = ref(false);
const picked = ref(new Set<string>()); // show keys
function toggleSelect() {
  selecting.value = !selecting.value;
  picked.value = new Set();
}
function togglePick(key: string) {
  const s = new Set(picked.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  picked.value = s;
}
const pickedShows = computed(() => log.shows.filter((g) => picked.value.has(g.key)));
const pickedIds = computed(() => pickedShows.value.flatMap((g) => g.acts.map((a) => a.attendance_id)));

const sheetOpen = ref(false);
const sheet = ref<{ ids: string[]; shows: number; name: string | null; context?: string; dismissKey?: string }>({ ids: [], shows: 0, name: null });
function markPicked() {
  if (!pickedIds.value.length) return;
  sheet.value = {
    ids: pickedIds.value,
    shows: pickedShows.value.length,
    name: pickedShows.value.find((g) => g.festival_name)?.festival_name ?? null,
  };
  sheetOpen.value = true;
}
const unmarking = ref(false);
async function unmarkPicked() {
  if (!pickedIds.value.length) return;
  unmarking.value = true;
  try {
    await setFestival(pickedIds.value, false);
    await log.refresh();
    ui.flash(`${plural(pickedShows.value.length, "show")} no longer marked as a festival`);
    toggleSelect();
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    unmarking.value = false;
  }
}
function onMarked() {
  if (sheet.value.dismissKey) dismiss(sheet.value.dismissKey);
  if (selecting.value) toggleSelect();
}

// ---------------------------------------------------------------- festival suggestions
const DISMISS_KEY = "ss.festivalHintsDismissed";
function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]"); } catch { return []; }
}
const dismissed = ref<string[]>(readDismissed());
function dismiss(key: string) {
  dismissed.value = [...dismissed.value, key];
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed.value)); } catch { /* private mode */ }
}
const suggestion = computed(() => suggestFestivals(log.entries).find((s) => !dismissed.value.includes(s.key)) ?? null);
function rangeText(s: FestivalSuggestion) {
  return s.from === s.to ? mediumDate(s.from) : `${mediumDate(s.from)} – ${mediumDate(s.to)}`;
}
function acceptSuggestion(s: FestivalSuggestion) {
  sheet.value = {
    ids: s.attendanceIds,
    shows: s.days,
    name: null,
    context: `${s.venue_name} · ${rangeText(s)}`,
    dismissKey: s.key,
  };
  sheetOpen.value = true;
}
</script>

<template>
  <div class="ss-page" :class="{ 'is-selecting': selecting }">
    <SsPageHeader kicker="THE STUB DRAWER" title="My shows">
      <SsButton v-if="log.entries.length" size="sm" :variant="selecting ? 'primary' : 'outline'" @click="toggleSelect">
        <SsIcon :name="selecting ? 'close' : 'check'" :size="16" />{{ selecting ? "Done" : "Select" }}
      </SsButton>
      <SsButton v-if="!selecting" to="/app/log" size="sm"><SsIcon name="plus" :size="16" :stroke="2.6" />Log a show</SsButton>
    </SsPageHeader>

    <!-- Likely festival -->
    <div v-if="suggestion && !selecting" class="hint" role="status">
      <div class="hint__text">
        <div class="hint__k">LOOKS LIKE A FESTIVAL</div>
        <div class="hint__t">
          {{ plural(suggestion.days, "day") }}, {{ plural(suggestion.artists, "artist") }} at <b>{{ suggestion.venue_name }}</b>
        </div>
        <div class="hint__s">{{ rangeText(suggestion) }}<template v-if="placeOf(suggestion.place)"> · {{ placeOf(suggestion.place) }}</template></div>
      </div>
      <div class="hint__actions">
        <SsButton size="sm" @click="acceptSuggestion(suggestion)">Mark it</SsButton>
        <SsButton size="sm" variant="ghost" @click="dismiss(suggestion.key)">Not a festival</SsButton>
      </div>
    </div>

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
        <SsInput v-model="q" icon="search" placeholder="Filter by artist, venue, city or festival" clearable class="search" @update:model-value="syncUrl" />
      </div>

      <div class="count ss-muted">
        {{ plural(list.length, "show") }}<template v-if="fests"> · {{ plural(fests, "festival") }}</template>
        <template v-if="selecting"> · tap shows to select them</template>
      </div>

      <div class="list">
        <div v-for="g in list" :key="g.key" class="item" :class="{ 'is-picked': picked.has(g.key) }">
          <SsTicketRow
            layout="row"
            :to="`/app/shows/${g.acts[0]!.attendance_id}`"
            :date="g.event_date"
            :artist="g.acts[0]!.artist_name"
            :openers="openersOf(g)"
            :venue="g.venue_name"
            :place="placeOf(g)"
            :number="g.show_number"
            :source="g.source"
            :festival="g.is_festival ? g.festival_name ?? true : null"
            :songs="g.song_count"
            :rating="g.rating"
          />
          <!-- In select mode a button covers the ticket, so taps select instead of opening. -->
          <button
            v-if="selecting"
            type="button"
            class="item__pick"
            :aria-pressed="picked.has(g.key)"
            :aria-label="`Select ${g.acts.map((a) => a.artist_name).join(', ')}, ${mediumDate(g.event_date)}`"
            @click="togglePick(g.key)"
          >
            <span class="item__box"><SsIcon v-if="picked.has(g.key)" name="check" :size="16" :stroke="3" /></span>
          </button>
        </div>
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

    <!-- Bulk actions -->
    <div v-if="selecting" class="bulkbar" :class="{ 'bulkbar--mobile': ui.isMobile }" role="toolbar" aria-label="Selected shows">
      <span class="bulkbar__n">{{ picked.size ? plural(picked.size, "show") + " selected" : "Select shows" }}</span>
      <SsButton size="sm" :disabled="!picked.size" @click="markPicked">Mark as festival…</SsButton>
      <SsButton size="sm" variant="outline" :disabled="!picked.size" :loading="unmarking" @click="unmarkPicked">Not a festival</SsButton>
    </div>

    <FestivalSheet
      v-model="sheetOpen"
      :ids="sheet.ids"
      :show-count="sheet.shows"
      :name="sheet.name"
      :context="sheet.context"
      @done="onMarked"
    />
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
.is-selecting .list { padding-bottom: 120px; }

/* select mode */
.item { position: relative; border-radius: var(--ss-radius-md); }
.item.is-picked { outline: 2px solid var(--ss-accent); outline-offset: 2px; }
.item__pick {
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  border-radius: var(--ss-radius-md);
}
.item__box {
  position: absolute;
  top: 10px;
  right: 40px;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 2px solid var(--ss-line-strong);
  background: var(--ss-surface-2);
  color: var(--ss-on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.is-picked .item__box { background: var(--ss-accent); border-color: var(--ss-accent); }

.bulkbar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  width: max-content;
  max-width: calc(100vw - 32px);
  padding: 10px 12px;
  border-radius: 18px;
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
}
.bulkbar__n { font-weight: 700; font-size: 14px; padding: 0 6px; }
/* Phones: sit above the bottom tab bar, full width. */
.bulkbar--mobile {
  left: 12px;
  right: 12px;
  transform: none;
  width: auto;
  max-width: none;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
}

/* festival suggestion */
.hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding: 16px 18px;
  border-radius: var(--ss-radius-lg, 16px);
  background: radial-gradient(120% 140% at 0% 0%, rgba(244, 184, 17, 0.14), transparent 60%), var(--ss-surface-1);
  border: 1px solid var(--ss-line);
}
.hint__k { font-family: var(--ss-font-mono); font-size: 11px; letter-spacing: 0.14em; color: var(--ss-accent); }
.hint__t { font-size: 17px; margin-top: 2px; }
.hint__s { font-size: 13px; color: var(--ss-text-muted); }
.hint__actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
