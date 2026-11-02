<script setup lang="ts">
// Upcoming shows: invites waiting on you, then two tabs: a SeatGeek search
// (one box for artist, venue or city; then where, when and which shows) and your plans.
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsButton, SsChip, SsEmpty, SsIcon, SsPageHeader, SsSkeleton, SsTabs } from "@/design-system";
import EventRow from "@/components/upcoming/EventRow.vue";
import InviteCard from "@/components/upcoming/InviteCard.vue";
import PlanCard from "@/components/upcoming/PlanCard.vue";
import UpcomingFilterSheet from "@/components/upcoming/UpcomingFilterSheet.vue";
import UpcomingSearchBox from "@/components/upcoming/UpcomingSearchBox.vue";
import { upcoming } from "@/lib/api";
import { errorMessage } from "@/lib/supabase";
import { plural } from "@/lib/format";
import type { PlaceResult } from "@/lib/geocode";
import { SHOW_FILTERS, whenLabel, whereLabel, whereShort, type SearchPick, type ShowFilter } from "@/lib/upcoming";
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
const tabModel = computed({ get: () => tab.value, set: go });

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
const f = computed(() => s.filters.value);
const homeCity = computed(() => auth.profile?.home_city ?? null);
const sheetOpen = ref(false);
const sheetMode = ref<"where" | "when">("where");
function openSheet(mode: "where" | "when") {
  sheetMode.value = mode;
  sheetOpen.value = true;
}

/** "34 SHOWS · WITHIN 50 MI OF COLUMBUS, OH · NEXT 6 MONTHS" */
const summary = computed(() => {
  if (s.show.value === "friends") return "FROM YOUR FRIENDS ON STUBSTASH";
  const parts = [whereLabel(f.value, homeCity.value), whenLabel(f.value)];
  if (s.ran.value && !s.loading.value && !s.error.value) parts.unshift(plural(s.total.value, "show"));
  if (s.show.value === "seen") parts.push("artists you’ve seen");
  return parts.join(" · ").toUpperCase();
});
const noHome = computed(() => !homeCity.value && !f.value.place && f.value.range !== "any" && f.value.pick?.kind !== "venue");

function onPick(pick: SearchPick) {
  if (s.show.value === "seen") s.show.value = "all";
  s.set({ pick });
}
function onCity(place: PlaceResult) {
  if (s.show.value === "seen") s.show.value = "all";
  const pick = f.value.pick?.kind === "venue" ? null : f.value.pick;
  s.set({ place: { label: place.label, lat: place.lat, lng: place.lng }, range: f.value.range === "any" ? "50" : f.value.range, pick });
}
function onSubmit() {
  if (s.show.value === "seen") s.show.value = "all";
  s.search();
}
function onClear() {
  if (f.value.pick) s.set({ pick: null });
  else s.search();
}
function setShow(v: ShowFilter) {
  if (v === "seen") {
    // Your top artists replace whatever was in the box.
    s.q.value = "";
    s.filters.value = { ...f.value, pick: null };
  }
  s.setShow(v);
}

const emptyTitle = computed(() => {
  if (s.show.value === "friends") return "No friends’ plans yet";
  const pick = f.value.pick;
  if (pick?.kind === "artist") return s.elsewhere.value ? `No ${pick.name} shows nearby` : `No ${pick.name} shows in these dates`;
  if (pick?.kind === "venue") return `Nothing at ${pick.name} in these dates`;
  return "No upcoming shows match";
});
const emptyBody = computed(() => {
  if (s.show.value === "friends") return "When friends mark shows as going or interested, they’ll show up here.";
  if (s.show.value === "seen") return "None of your most-seen artists are playing nearby in these dates. Try a wider distance.";
  const pick = f.value.pick;
  if (pick?.kind === "artist" && s.elsewhere.value) {
    return `They have ${plural(s.elsewhere.value, "show")} farther away in these dates.`;
  }
  if (pick) return "Try different dates.";
  return "Try another search, a wider distance, or different dates.";
});

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

    <SsTabs
      v-model="tabModel"
      label="Upcoming"
      :tabs="[
        { key: 'find', label: 'Find shows' },
        { key: 'plans', label: 'Your plans', count: mine.length },
      ]"
    />

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
      <UpcomingSearchBox
        v-model="s.q.value"
        :pick="f.pick"
        :filters="f"
        @pick="onPick"
        @city="onCity"
        @submit="onSubmit"
        @clear="onClear"
      />

      <div class="controls">
        <button v-if="f.pick?.kind !== 'venue'" type="button" class="ctl" @click="openSheet('where')">
          <SsIcon name="pin" :size="16" /><span class="ss-truncate">{{ whereShort(f, homeCity) }}</span>
          <SsIcon name="chevron" :size="14" class="ctl__chev" />
        </button>
        <button type="button" class="ctl" @click="openSheet('when')">
          <SsIcon name="calendar" :size="16" /><span class="ss-truncate">{{ whenLabel(f) }}</span>
          <SsIcon name="chevron" :size="14" class="ctl__chev" />
        </button>
      </div>

      <div class="chips">
        <SsChip v-for="c in SHOW_FILTERS" :key="c.value" :active="s.show.value === c.value" @click="setShow(c.value)">
          {{ c.label }}
        </SsChip>
      </div>

      <div class="where" aria-live="polite">{{ summary }}</div>

      <UpcomingFilterSheet
        v-model="sheetOpen"
        :mode="sheetMode"
        :filters="f"
        :home-city="homeCity"
        @apply="s.set"
      />

      <div v-if="s.loading.value && !s.results.value.length" class="ss-stack">
        <SsSkeleton v-for="i in 4" :key="i" height="84px" />
      </div>
      <SsEmpty v-else-if="s.error.value" title="Couldn’t load shows" :body="s.error.value">
        <SsButton variant="outline" size="sm" @click="s.search()">Try again</SsButton>
      </SsEmpty>
      <template v-else>
        <p v-if="noHome && s.show.value !== 'friends'" class="hint">
          Showing shows everywhere. <RouterLink to="/app/settings">Set your home city</RouterLink> or search for a city to see what’s near you.
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
        <SsEmpty v-else-if="s.ran.value" :title="emptyTitle" :body="emptyBody">
          <SsButton v-if="f.pick?.kind === 'artist' && s.elsewhere.value && s.show.value === 'all'" size="sm" @click="s.set({ range: 'any' })">
            <SsIcon name="globe" :size="16" />Show all {{ s.elsewhere.value }}
          </SsButton>
        </SsEmpty>
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
.summary { font-size: 14px; }
.plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.where { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.12em; color: var(--ss-text-faint); }
.controls { display: flex; gap: 8px; min-width: 0; }
.ctl {
  flex: 0 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px 0 14px;
  border-radius: 999px;
  border: 1px solid var(--ss-line-strong);
  background: var(--ss-surface-1);
  color: var(--ss-text);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.ctl:hover { border-color: var(--ss-accent); }
.ctl > svg:first-child { color: var(--ss-accent); flex-shrink: 0; }
.ctl__chev { transform: rotate(90deg); color: var(--ss-text-muted); flex-shrink: 0; }
.chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
.chips > * { flex-shrink: 0; }
.results { display: flex; flex-direction: column; gap: 8px; transition: opacity var(--ss-dur-fast); }
.results.is-stale { opacity: 0.6; }
.hint { margin: 0; font-size: 14px; color: var(--ss-text-muted); }
.more { display: flex; justify-content: center; }
</style>
