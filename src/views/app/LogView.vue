<script setup lang="ts">
// "Who'd you see?" Search setlist.fm and log a show in one tap.
// Two modes: quick search (one box, for last night's show) and "find an older
// show" (artist + year/date + venue/city/state/country/tour filters).
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsButton, SsChip, SsEmpty, SsIcon, SsInput, SsPageHeader, SsSkeleton } from "@/design-system";
import AdvancedSetlistSearch from "@/components/forms/AdvancedSetlistSearch.vue";
import { describe, fromQuery, hasWhere, toParams, toQuery } from "@/lib/advancedSearch";
import { setlistfm } from "@/lib/api";
import { errorMessage } from "@/lib/supabase";
import { dateParts, num, place } from "@/lib/format";
import { outboxAdd } from "@/lib/offline";
import type { SetlistResult, SetlistSearchParams } from "@/lib/types";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const route = useRoute();
const router = useRouter();
const log = useLog();
const ui = useUi();

const mode = ref<"quick" | "find">(route.query.find === "1" ? "find" : "quick");
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
const filters = ref(fromQuery(route.query));
let lastParams: SetlistSearchParams = {};
const results = ref<SetlistResult[]>([]);
const total = ref(0);
const page = ref(1);
const pages = ref(0);
const matchedBy = ref<string | null>(null);
const searched = ref(""); // the query the current results belong to
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);

// Per-result state from this visit: logged attendance ids, in-flight, queued offline.
const justLogged = reactive<Record<string, string>>({});
const busy = reactive<Record<string, boolean>>({});
const queued = reactive<Record<string, boolean>>({});

const DEFAULT_QUICK = ["Phish", "Billy Strings", "Taylor Swift", "Red Rocks"];
const quick = computed(() => {
  const top = log.stats?.top_artists?.slice(0, 4).map((a) => a.name) ?? [];
  return top.length ? top : DEFAULT_QUICK;
});

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

function clearResults() {
  seq++;
  results.value = [];
  total.value = 0;
  searched.value = "";
  error.value = null;
  loading.value = false;
}

/** Quick mode: one search box. */
function search(reset = true) {
  if (!reset) return run(lastParams, false, searched.value);
  const term = q.value.trim();
  if (term.length < 2) return clearResults();
  return run({ q: term }, true, term);
}

/** Find mode: the filter form. */
function find() {
  if (!hasWhere(filters.value)) return;
  router.replace({ query: toQuery(filters.value) });
  run(toParams(filters.value), true, describe(filters.value));
}

async function run(params: SetlistSearchParams, reset: boolean, label: string) {
  const mine = ++seq;
  lastParams = params;
  if (reset) { loading.value = true; page.value = 1; } else loadingMore.value = true;
  error.value = null;
  try {
    const res = await setlistfm.search({ ...params, page: reset ? 1 : page.value + 1 });
    if (mine !== seq) return;
    results.value = reset ? res.results : [...results.value, ...res.results];
    total.value = res.total;
    page.value = res.page;
    pages.value = res.pages;
    matchedBy.value = res.matched_by;
    searched.value = label;
  } catch (e) {
    if (mine !== seq) return;
    error.value = errorMessage(e);
    if (reset) results.value = [];
  } finally {
    if (mine === seq) { loading.value = false; loadingMore.value = false; }
  }
}

watch(q, (v) => {
  if (mode.value !== "quick") return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    router.replace({ query: v.trim() ? { q: v.trim() } : {} });
    if (ui.online) search(true);
  }, 500);
});

onMounted(() => {
  log.load();
  if (mode.value === "find") {
    if (hasWhere(filters.value)) find();
  } else if (q.value.trim()) search(true);
});

function setMode(m: "quick" | "find") {
  if (mode.value === m) return;
  mode.value = m;
  clearResults();
  if (m === "find") {
    // Carry what they typed over as the artist.
    if (!hasWhere(filters.value) && q.value.trim()) filters.value.artist = q.value.trim();
    router.replace({ query: { find: "1" } });
  } else {
    router.replace({ query: q.value.trim() ? { q: q.value.trim() } : {} });
    if (q.value.trim()) search(true);
  }
}

function attendanceFor(r: SetlistResult): string | null {
  return justLogged[r.setlistfm_id] ?? r.attendance_id ?? log.loggedSetlistIds.get(r.setlistfm_id) ?? null;
}

async function iWasThere(r: SetlistResult) {
  if (busy[r.setlistfm_id] || attendanceFor(r) || queued[r.setlistfm_id]) return;
  const label = `${r.artist} · ${r.venue}`;
  if (!ui.online) {
    await outboxAdd({ kind: "log-setlist", setlistfm_id: r.setlistfm_id, label });
    queued[r.setlistfm_id] = true;
    ui.flash("Saved. We'll log it when you're back online.");
    return;
  }
  busy[r.setlistfm_id] = true;
  try {
    const res = await log.logSetlist(r.setlistfm_id);
    justLogged[r.setlistfm_id] = res.attendance_id;
    ui.flash(res.created ? (res.show_number ? `Logged! That's show #${res.show_number}` : "Logged!") : "Already in your log");
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    busy[r.setlistfm_id] = false;
  }
}

const manualLink = computed(() => {
  if (mode.value === "find") {
    const { find: _f, artist_mbid: _m, year: _y, ...rest } = toQuery(filters.value);
    return { path: "/app/log/manual", query: rest };
  }
  return { path: "/app/log/manual", query: q.value.trim() ? { artist: q.value.trim() } : {} };
});
const matchedNote = computed(() =>
  matchedBy.value === "venue" ? " · matching venue" : matchedBy.value === "city" ? " · matching city" : "",
);
</script>

<template>
  <div class="ss-page">
    <SsPageHeader kicker="Log a show · searching setlist.fm" title="Who'd you see?" />

    <div class="modes" role="tablist" aria-label="Search mode">
      <button type="button" role="tab" class="mode" :class="{ on: mode === 'quick' }" :aria-selected="mode === 'quick'" @click="setMode('quick')">
        Quick search
      </button>
      <button type="button" role="tab" class="mode" :class="{ on: mode === 'find' }" :aria-selected="mode === 'find'" @click="setMode('find')">
        <SsIcon name="calendar" :size="16" />Find an older show
      </button>
    </div>

    <AdvancedSetlistSearch v-if="mode === 'find'" v-model="filters" :loading="loading" @submit="find" />

    <template v-else>
    <SsInput
      v-model="q"
      size="xl"
      icon="search"
      placeholder="Artist, venue or city"
      clearable
      autofocus
      inputmode="search"
      enterkeyhint="search"
      aria-label="Search setlist.fm"
      @enter="search(true)"
    />

    <div class="quick">
      <SsChip v-for="c in quick" :key="c" variant="soft" size="sm" @click="q = c">{{ c }}</SsChip>
    </div>
    </template>

    <SsEmpty
      v-if="!ui.online && !results.length"
      title="You're offline"
      body="Search needs a connection. You can still add a show by hand, or log from earlier results."
    />

    <SsEmpty v-else-if="error" title="setlist.fm search didn't work" :body="error">
      <SsButton size="sm" variant="outline" @click="search(true)">Try again</SsButton>
    </SsEmpty>

    <div v-else-if="loading" class="list" aria-busy="true">
      <SsSkeleton v-for="i in 4" :key="i" height="84px" radius="var(--ss-radius-md)" />
    </div>

    <template v-else-if="results.length">
      <div class="count">
        {{ num(total) }} setlists on setlist.fm{{ matchedNote }} · newest first
        <template v-if="mode === 'find' && searched"> · {{ searched }}</template>
      </div>
      <ul class="list">
        <li v-for="r in results" :key="r.setlistfm_id" class="result">
          <div class="result__date">
            <div class="result__mon">{{ dateParts(r.date).mon }}</div>
            <div class="result__day">{{ dateParts(r.date).day }}</div>
            <div class="result__yr">{{ dateParts(r.date).yr }}</div>
          </div>
          <div class="result__body">
            <div class="result__artist">{{ r.artist }}</div>
            <div class="result__venue">{{ r.venue }}<template v-if="r.city"> · {{ place(r.city, r.state_code, r.country_code) }}</template></div>
            <div class="result__meta">
              <template v-if="r.tour">{{ r.tour }} · </template>{{ r.songs ? `${r.songs} songs` : "No setlist yet" }}
            </div>
          </div>
          <div class="result__action">
            <template v-if="attendanceFor(r)">
              <SsButton
                v-if="justLogged[r.setlistfm_id]"
                size="sm"
                variant="outline"
                :to="`/app/shows/${attendanceFor(r)}`"
              >
                Logged <SsIcon name="check" :size="14" />
              </SsButton>
              <SsButton v-else size="sm" variant="outline" :to="`/app/shows/${attendanceFor(r)}`">In your log</SsButton>
              <RouterLink v-if="justLogged[r.setlistfm_id]" class="result__details" :to="`/app/shows/${attendanceFor(r)}/edit`">
                Add details →
              </RouterLink>
            </template>
            <SsButton v-else-if="queued[r.setlistfm_id]" size="sm" variant="outline" disabled>Queued</SsButton>
            <SsButton v-else size="sm" :loading="busy[r.setlistfm_id]" @click="iWasThere(r)">I was there</SsButton>
          </div>
        </li>
      </ul>
      <SsButton v-if="page < pages" variant="outline" :loading="loadingMore" class="more" @click="search(false)">Load more</SsButton>
    </template>

    <SsEmpty
      v-else-if="searched"
      :title="`Nothing on setlist.fm for “${searched}”`"
:body="mode === 'find'
        ? 'Try fewer filters: drop the tour or venue, or search the year without a date. Still nothing? Add it yourself.'
        : 'Tiny venue? House show? Secret set? Add it yourself. It lives in Stubstash only.'"
    />

    <RouterLink :to="manualLink" class="manual">
      <div>
        <div class="manual__title">Can't find it? Add it manually</div>
        <div class="manual__body">Saved to Stubstash only. We never write back to setlist.fm.</div>
      </div>
      <span class="manual__arrow" aria-hidden="true">→</span>
    </RouterLink>
  </div>
</template>

<style scoped>
.quick { display: flex; gap: 8px; flex-wrap: wrap; }
.modes {
  display: inline-flex;
  align-self: flex-start;
  gap: 4px;
  padding: 4px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  max-width: 100%;
}
.mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--ss-radius-pill);
  background: transparent;
  color: var(--ss-text-3);
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
}
.mode:hover { color: var(--ss-text); }
.mode.on { background: var(--ss-accent); color: var(--ss-on-accent); }
.count { font-size: 14px; color: var(--ss-text-muted); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.result {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  flex-wrap: wrap;
}
.result__date { width: 56px; text-align: center; flex-shrink: 0; }
.result__mon { font-family: var(--ss-font-mono); font-size: 11px; color: var(--ss-accent); }
.result__day { font-weight: 900; font-size: 26px; line-height: 1; }
.result__yr { font-size: 12px; color: var(--ss-text-muted); }
.result__body { flex: 1 1 180px; min-width: 0; }
.result__artist { font-weight: 900; font-size: 18px; line-height: 1.15; }
.result__venue { font-size: 14px; color: var(--ss-text-3); }
.result__meta { font-size: 12px; color: var(--ss-text-faint); margin-top: 2px; }
.result__action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}
.result__details { font-size: 13px; font-weight: 700; }
.more { align-self: center; }

.manual {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-radius: 16px;
  background: linear-gradient(90deg, rgba(118, 169, 185, 0.3), rgba(118, 169, 185, 0.08));
  border: 1px solid var(--ss-teal);
  color: var(--ss-text);
  text-decoration: none;
}
.manual:hover { color: var(--ss-text); text-decoration: none; border-color: var(--ss-teal-light); }
.manual__title { font-weight: 900; font-size: 19px; }
.manual__body { font-size: 14px; color: var(--ss-ice); }
.manual__arrow { font-size: 24px; font-weight: 900; }
</style>
