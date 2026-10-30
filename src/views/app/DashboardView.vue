<script setup lang="ts">
import { badgeNumbers } from "@/lib/badgeArt";
import { computed, onMounted, ref } from "vue";
import {
  SsBadgeTile, SsBarChart, SsButton, SsCard, SsIcon, SsProgress, SsSkeleton, SsStatCard, SsTicketRow,
} from "@/design-system";
import RareCatches from "@/components/dashboard/RareCatches.vue";
import StreakCard from "@/components/dashboard/StreakCard.vue";
import TopArtists from "@/components/dashboard/TopArtists.vue";
import TopSongs from "@/components/dashboard/TopSongs.vue";
import { badges as fetchBadges } from "@/lib/api";
import { compact, num, place, plural } from "@/lib/format";
import { nextMilestone } from "@/lib/milestones";
import type { Badge } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const auth = useAuth();
const log = useLog();
const ui = useUi();
const badgeList = ref<Badge[]>([]);

onMounted(() => {
  log.load();
  fetchBadges().then((b) => (badgeList.value = b)).catch(() => {});
});

const s = computed(() => log.stats);
const t = computed(() => s.value?.totals);
const shows = computed(() => t.value?.shows ?? log.total);
const empty = computed(() => log.loaded && shows.value === 0);
const showSkeleton = computed(() => !s.value && (log.loading || !log.loaded));

const milestone = computed(() => nextMilestone(shows.value));
const firstYear = computed(() => t.value?.first_show?.slice(0, 4) ?? "");
const kicker = computed(() => {
  const name = (auth.firstName || "Your").toUpperCase();
  const who = name === "YOUR" ? "YOUR" : `${name}’S`;
  return firstYear.value ? `${who} STAGE PASS · ${firstYear.value}—NOW` : `${who} STAGE PASS`;
});
// Milestones count shows (a venue on a date), the same way the badges do.
const headline = computed(() => `${num(shows.value)} show${shows.value === 1 ? "" : "s"} deep. ${milestone.value.remaining} to the ${milestone.value.name}.`);
const progress = computed(() => Math.round((shows.value / milestone.value.target) * 100));

const homeCity = computed(() => auth.profile?.home_city ?? s.value?.home.city ?? null);
const statCards = computed(() => {
  const x = t.value;
  if (!x) return [];
  return [
    // Shows = a venue on a date (headliner + openers); festivals still count as shows.
    {
      label: "Shows",
      value: num(x.shows),
      caption: [x.festivals ? plural(x.festivals, "festival") : "", x.first_show ? `since ${x.first_show.slice(0, 4)}` : ""]
        .filter(Boolean).join(" · "),
      tone: "accent" as const,
    },
    { label: "Artists", value: num(x.artists), caption: `${num(x.artists_multi)} seen more than once` },
    { label: "Venues", value: num(x.venues), caption: s.value?.top_venues[0] ? `${s.value.top_venues[0].name} is home turf` : "" },
    { label: "Songs heard", value: num(x.songs), caption: `${num(x.unique_songs)} different songs` },
    { label: "Miles traveled", value: compact(x.miles), caption: s.value?.home.past_homes ? `from ${s.value.home.past_homes + 1} homes` : homeCity.value ? `from ${homeCity.value}` : "", noHome: !s.value?.home.has_coords },
    { label: "Cities", value: num(x.cities), caption: `in ${plural(x.countries, "country", "countries")}` },
  ];
});

const thisYear = new Date().getFullYear();
const years = computed(() => {
  const py = s.value?.per_year ?? [];
  if (!py.length) return [];
  const map = new Map(py.map((p) => [p.year, p.n]));
  // Every year from the first show to now (empty years show as 0).
  const start = py[0]!.year;
  const end = Math.max(thisYear, py[py.length - 1]!.year);
  const out = [];
  for (let y = start; y <= end; y++) out.push({ label: "'" + String(y).slice(2), value: map.get(y) ?? 0, highlight: y === thisYear });
  return out;
});
const peak = computed(() => {
  const py = s.value?.per_year ?? [];
  const best = py.reduce<{ year: number; n: number } | null>((a, b) => (!a || b.n > a.n ? b : a), null);
  return best ? `Peak: ${best.year} · ${plural(best.n, "show")}` : "";
});

const recent = computed(() => log.shows.slice(0, 3));
const earned = computed(() => badgeList.value.filter((b) => b.earned).length);
const badgeNo = computed(() => badgeNumbers(badgeList.value));
</script>

<template>
  <div class="ss-page">
    <!-- Install banner (phones) -->
    <div v-if="ui.isMobile && ui.showInstallNudge" class="banner">
      <div class="banner__icon" aria-hidden="true">S</div>
      <div class="banner__text"><b>Add to Home Screen</b><br /><span class="ss-muted">Log the show before you leave the lot.</span></div>
      <SsButton size="sm" @click="ui.installSheetOpen = true">Install</SsButton>
      <button class="banner__x" aria-label="Dismiss" @click="ui.dismissInstall()"><SsIcon name="close" :size="16" /></button>
    </div>

    <!-- Loading -->
    <template v-if="showSkeleton">
      <SsSkeleton height="14px" width="220px" />
      <SsSkeleton height="56px" width="80%" />
      <div class="ss-grid" style="--ss-grid-min: 150px">
        <SsSkeleton v-for="i in 6" :key="i" height="132px" radius="var(--ss-radius-lg)" />
      </div>
      <SsSkeleton height="240px" radius="var(--ss-radius-lg)" />
    </template>

    <!-- First run -->
    <template v-else-if="empty">
      <div class="hero-empty">
        <div class="ss-kicker">{{ kicker }}</div>
        <h1 class="ss-h1">Your stub drawer is empty. Let’s fix that.</h1>
        <p class="hero-empty__body">Search setlist.fm for a show you went to, or pull in everything you’ve marked “I was there” in one go.</p>
        <div class="hero-empty__actions">
          <SsButton to="/app/log" size="lg"><SsIcon name="plus" :stroke="2.6" />Log your first show</SsButton>
          <SsButton to="/app/welcome" variant="outline" size="lg">Import from setlist.fm</SsButton>
        </div>
      </div>
      <div class="ss-grid" style="--ss-grid-min: 220px">
        <SsCard tone="sunken"><div class="tip__n">1</div><div class="ss-h3">Search</div><p class="ss-muted">Artist, venue or city. Pick the night.</p></SsCard>
        <SsCard tone="sunken"><div class="tip__n">2</div><div class="ss-h3">Make it yours</div><p class="ss-muted">Rate it, tag who you went with, add photos.</p></SsCard>
        <SsCard tone="sunken"><div class="tip__n">3</div><div class="ss-h3">Watch it stack up</div><p class="ss-muted">Songs, miles, streaks and badges update as you log.</p></SsCard>
      </div>
    </template>

    <template v-else-if="s && t">
      <div class="intro">
        <div class="intro__text">
          <div class="ss-kicker">{{ kicker }}</div>
          <h1 class="ss-h1 intro__h1">{{ headline }}</h1>
        </div>
        <div class="intro__road">
          <div class="intro__road-top"><span>Road to {{ milestone.target }}</span><b>{{ progress }}%</b></div>
          <SsProgress :value="shows" :max="milestone.target" :label="`Road to ${milestone.target}`" />
        </div>
      </div>

      <div class="stats">
        <SsStatCard v-for="c in statCards" :key="c.label" :label="c.label" :value="c.value" :tone="c.tone ?? 'default'">
          <RouterLink v-if="c.noHome" to="/app/settings" class="set-home">Set your home base</RouterLink>
          <template v-else>{{ c.caption }}</template>
        </SsStatCard>
      </div>

      <div class="ss-grid ss-grid--stretch">
        <SsCard title="Shows per year" class="wide">
          <template #aside>{{ peak }}</template>
          <SsBarChart :data="years" :min-column="26" />
        </SsCard>
        <StreakCard :streak="s.streak" />
      </div>

      <div class="ss-grid">
        <TopArtists :artists="s.top_artists" />
        <TopSongs :songs="s.top_songs" />
      </div>

      <RareCatches :stats="s" />

      <div class="ss-between">
        <h2 class="ss-h2">Latest shows</h2>
        <RouterLink to="/app/shows" class="more">All {{ num(shows) }} →</RouterLink>
      </div>
      <div class="ss-grid" style="--ss-grid-min: 300px">
        <SsTicketRow
          v-for="g in recent"
          :key="g.key"
          :to="`/app/shows/${g.acts[0]!.attendance_id}`"
          :date="g.event_date"
          :artist="g.acts[0]!.artist_name"
          :openers="g.acts.slice(1).map((a) => ({ name: a.artist_name, to: `/app/shows/${a.attendance_id}` }))"
          :venue="g.venue_name"
          :place="place(g.city, g.state_code, g.country_code)"
          :number="g.show_number"
          :source="g.source"
          :festival="g.is_festival ? g.festival_name ?? true : null"
          :songs="g.song_count"
          :rating="g.rating"
        />
      </div>

      <SsCard v-if="badgeList.length" title="Badges">
        <template #aside><RouterLink to="/app/me" class="more">{{ earned }} of {{ badgeList.length }} →</RouterLink></template>
        <div class="badges">
          <SsBadgeTile
            v-for="b in badgeList"
            :key="b.key"
            :badge-key="b.key"
            :index="badgeNo.get(b.key) ?? 0"
            :name="b.name"
            :color="b.color"
            :earned="b.earned"
            :target="b.target"
          />
        </div>
      </SsCard>
    </template>

    <SsCard v-else-if="log.error" tone="dashed">
      <p>Couldn’t load your stats. {{ log.error }}</p>
      <SsButton variant="outline" size="sm" style="margin-top: 12px" @click="log.refresh()">Try again</SsButton>
    </SsCard>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line);
}
.banner__icon {
  width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px;
  background: var(--ss-accent); color: var(--ss-on-accent); font-weight: 900; font-size: 18px;
  display: flex; align-items: center; justify-content: center;
}
.banner__text { flex: 1; min-width: 0; font-size: 14px; line-height: 1.3; }
.banner__x { width: 28px; height: 28px; border: 0; background: transparent; color: var(--ss-text-faint); display: flex; align-items: center; justify-content: center; }

.intro { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.intro__text { min-width: 0; flex: 1 1 420px; }
.intro__h1 { margin-top: 6px; }
.intro__road { min-width: 220px; flex: 0 1 300px; }
.intro__road-top { display: flex; justify-content: space-between; font-size: 13px; color: var(--ss-text-muted); margin-bottom: 6px; }
.intro__road-top b { color: var(--ss-text); }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
@media (max-width: 400px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .stats :deep(.ss-stat__value) { font-size: 38px; }
}
.set-home { color: inherit; text-decoration: underline; }

@media (min-width: 820px) {
  .wide { grid-column: span 2; }
}

.more { font-weight: 700; font-size: 15px; }
.badges { position: relative; display: flex; gap: 12px; overflow-x: auto; padding: 4px 2px 6px; }

.hero-empty {
  padding: 32px 24px;
  border-radius: 24px;
  background: radial-gradient(120% 90% at 50% 0%, rgba(244, 184, 17, 0.16), transparent 60%), var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hero-empty__body { font-size: 18px; color: var(--ss-text-3); max-width: 560px; line-height: 1.45; }
.hero-empty__actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
.tip__n { font-weight: 900; font-size: 44px; line-height: 0.9; color: var(--ss-accent); margin-bottom: 8px; }
</style>
