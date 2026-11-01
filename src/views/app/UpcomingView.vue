<script setup lang="ts">
// Upcoming shows: invites waiting on you, then two tabs: a SeatGeek search
// (near your home by default, or anywhere with the advanced search) and your plans.
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsButton, SsChip, SsEmpty, SsIcon, SsInput, SsPageHeader, SsSkeleton } from "@/design-system";
import EventRow from "@/components/upcoming/EventRow.vue";
import InviteCard from "@/components/upcoming/InviteCard.vue";
import PlanCard from "@/components/upcoming/PlanCard.vue";
import UpcomingFiltersForm from "@/components/upcoming/UpcomingFiltersForm.vue";
import { upcoming } from "@/lib/api";
import { errorMessage } from "@/lib/supabase";
import { QUICK_FILTERS, RANGES, filtersActive } from "@/lib/upcoming";
import type { PlanItem } from "@/lib/types";
import { useKeyedAction } from "@/composables/useAction";
import { useUpcomingSearch } from "@/composables/useUpcomingSearch";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

const auth = useAuth();
const ui = useUi();
const route = useRoute();
const router = useRouter();

// ---- your plans and invites
const plans = shallowRef<PlanItem[]>([]);
const plansLoading = ref(true);
const invites = computed(() => plans.value.filter((p) => p.status === "invited"));
const mine = computed(() => plans.value.filter((p) => p.status === "going" || p.status === "interested"));
const planSummary = computed(() => {
  const going = mine.value.filter((p) => p.status === "going").length;
  return `${going} going · ${mine.value.length - going} interested`;
});

// ---- tabs (?tab=find|plans), Find shows first
type Tab = "find" | "plans";
const tab = computed<Tab>(() => (route.query.tab === "plans" ? "plans" : "find"));
function go(t: Tab) {
  const { tab: _old, ...rest } = route.query;
  router.replace({ query: t === "find" ? rest : { ...rest, tab: t } });
}

async function loadPlans() {
  try {
    plans.value = await upcoming.myPlans();
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    plansLoading.value = false;
  }
}

// ---- find shows
const s = useUpcomingSearch(auth.userId);
const showAdvanced = ref(filtersActive(s.filters.value));
const homeCity = computed(() => auth.profile?.home_city ?? null);
const rangeLabel = computed(() => RANGES.find((r) => r.value === s.filters.value.range)?.label ?? "");
const whereLabel = computed(() => {
  if (s.quick.value === "friends") return "FROM YOUR FRIENDS";
  if (s.filters.value.range === "any") return "ANYWHERE · SEATGEEK";
  const city = s.near.value ?? s.filters.value.place?.label ?? homeCity.value;
  return city ? `WITHIN ${rangeLabel.value.toUpperCase()} OF ${city.toUpperCase()} · SEATGEEK` : "SEATGEEK";
});
const noLocation = computed(() =>
  s.ran.value && s.quick.value !== "friends" && s.filters.value.range !== "any" && !s.filters.value.place && !s.near.value);

function submitAdvanced() {
  if (s.quick.value === "friends") s.quick.value = "all"; // the watcher searches
  else s.search();
}

onMounted(() => {
  loadPlans();
  if (!s.ran.value) s.search();
});

// ---- plan changes
const { run: setPlan, busy } = useKeyedAction(async (_key: string, item: PlanItem, status: "going" | "interested" | "cant" | null) => {
  const next = await upcoming.setPlan(item.event.seatgeek_id, status);
  s.update(next);
  if (status === "going") ui.flash("You’re going! It’s in Your plans");
  else if (status === "interested") ui.flash("Saved to Your plans");
  else if (status === "cant") ui.flash("Got it. We’ll let them know", "info");
  await loadPlans();
});
const plan = (item: PlanItem, status: "going" | "interested" | "cant" | null) => setPlan(String(item.event.seatgeek_id), item, status);
</script>

<template>
  <div class="ss-page">
    <SsPageHeader kicker="On the horizon · tickets via SeatGeek" title="What’s next?" />

    <!-- Invites waiting on you -->
    <InviteCard
      v-for="i in invites"
      :key="i.event.seatgeek_id"
      :item="i"
      :busy="busy[String(i.event.seatgeek_id)]"
      @respond="(st) => plan(i, st)"
    />

    <div class="tabs" role="tablist" aria-label="Upcoming">
      <button type="button" role="tab" class="tab" :class="{ on: tab === 'find' }" :aria-selected="tab === 'find'" @click="go('find')">
        Find shows
      </button>
      <button type="button" role="tab" class="tab" :class="{ on: tab === 'plans' }" :aria-selected="tab === 'plans'" @click="go('plans')">
        Your plans<span v-if="mine.length" class="tab__n">{{ mine.length }}</span>
      </button>
    </div>

    <!-- Your plans -->
    <section v-if="tab === 'plans'" class="ss-stack" role="tabpanel">
      <div v-if="mine.length" class="summary ss-muted">{{ planSummary }}</div>
      <div v-if="plansLoading && !plans.length" class="plans"><SsSkeleton v-for="i in 2" :key="i" height="230px" /></div>
      <div v-else-if="mine.length" class="plans">
        <PlanCard v-for="p in mine" :key="p.event.seatgeek_id" :item="p" />
      </div>
      <SsEmpty v-else title="No plans yet" body="Find a show and tap Interested or Going. Friends see what you’re going to.">
        <SsButton size="sm" @click="go('find')"><SsIcon name="search" :size="16" />Find shows</SsButton>
      </SsEmpty>
    </section>

    <!-- Find shows -->
    <section v-else class="ss-stack" role="tabpanel">
      <div class="where">{{ whereLabel }}</div>

      <div class="search-row">
        <SsInput
          v-model="s.q.value"
          size="lg"
          icon="search"
          placeholder="Artist, venue or city"
          clearable
          inputmode="search"
          enterkeyhint="search"
          autocomplete="off"
          class="search-row__box"
          @keydown.enter="s.search()"
        />
        <SsButton
          variant="outline"
          :aria-expanded="showAdvanced"
          class="search-row__adv"
          @click="showAdvanced = !showAdvanced"
        >
          <SsIcon name="settings" :size="16" />{{ showAdvanced ? "Hide" : "Advanced" }}
          <span v-if="filtersActive(s.filters.value) && !showAdvanced" class="dot" aria-label="filters on" />
        </SsButton>
      </div>

      <UpcomingFiltersForm
        v-if="showAdvanced"
        v-model="s.filters.value"
        :home-city="homeCity"
        :loading="s.loading.value"
        @submit="submitAdvanced"
      />

      <div class="chips">
        <SsChip v-for="c in QUICK_FILTERS" :key="c.value" :active="s.quick.value === c.value" @click="s.quick.value = c.value">
          {{ c.label }}
        </SsChip>
      </div>

      <div v-if="s.loading.value && !s.results.value.length" class="ss-stack">
        <SsSkeleton v-for="i in 4" :key="i" height="84px" />
      </div>
      <SsEmpty v-else-if="s.error.value" title="Couldn’t load shows" :body="s.error.value">
        <SsButton variant="outline" size="sm" @click="s.search()">Try again</SsButton>
      </SsEmpty>
      <template v-else>
        <p v-if="noLocation" class="hint">
          Showing shows everywhere. <RouterLink to="/app/settings">Set your home city</RouterLink> or pick a city in Advanced to see what’s near you.
        </p>
        <div v-if="s.results.value.length" class="results" :class="{ 'is-stale': s.loading.value }">
          <EventRow
            v-for="r in s.results.value"
            :key="r.event.seatgeek_id"
            :item="r"
            :busy="busy[String(r.event.seatgeek_id)]"
            @plan="(st) => plan(r, st)"
          />
        </div>
        <SsEmpty
          v-else-if="s.ran.value"
          :title="s.quick.value === 'friends' ? 'No friends’ plans yet' : 'No upcoming shows match'"
          :body="s.quick.value === 'friends'
            ? 'When friends mark shows as going or interested, they’ll show up here.'
            : 'Try another artist or city, a wider distance, or different dates.'"
        />
        <div v-if="s.page.value < s.pages.value" class="more">
          <SsButton variant="outline" :loading="s.loadingMore.value" @click="s.more()">
            Show more ({{ s.total.value - s.results.value.length }} left)
          </SsButton>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  align-self: flex-start;
  max-width: 100%;
}
.tab {
  height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--ss-radius-pill);
  background: transparent;
  color: var(--ss-text-3);
  font-weight: 700;
  font-size: 15px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.tab:hover { color: var(--ss-text); }
.tab.on { background: var(--ss-accent); color: var(--ss-on-accent); }
.tab__n {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-surface-3);
  color: var(--ss-text);
  font-size: 12px;
  font-weight: 900;
  display: inline-grid;
  place-items: center;
}
.tab.on .tab__n { background: var(--ss-bg); color: var(--ss-accent); }
.summary { font-size: 14px; }
.plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.where { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.12em; color: var(--ss-text-faint); }
.search-row { display: flex; gap: 8px; align-items: stretch; }
.search-row__box { flex: 1; min-width: 0; }
.search-row__adv { position: relative; flex-shrink: 0; align-self: center; }
.dot { position: absolute; top: 6px; right: 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--ss-accent); }
.chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
.chips > * { flex-shrink: 0; }
.results { display: flex; flex-direction: column; gap: 8px; transition: opacity var(--ss-dur-fast); }
.results.is-stale { opacity: 0.6; }
.hint { margin: 0; font-size: 14px; color: var(--ss-text-muted); }
.more { display: flex; justify-content: center; }
</style>
