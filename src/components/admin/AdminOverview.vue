<script setup lang="ts">
// Admin overview: headline numbers, 12-week activity, catalog health,
// background jobs and recent job failures.
import { computed, onActivated, onMounted, ref } from "vue";
import { SsBarChart, SsButton, SsCard, SsEmpty, SsSkeleton, SsStatCard, SsTag } from "@/design-system";
import { admin, type AdminOverview } from "@/lib/admin";
import { errorMessage } from "@/lib/supabase";
import { bytes, num, timeAgo } from "@/lib/format";
import { useUi } from "@/stores/ui";

const emit = defineEmits<{ go: [tab: "users" | "artists" | "venues"] }>();
const ui = useUi();

const data = ref<AdminOverview | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const pruning = ref(false);
let loadedAt = 0;

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await admin.overview();
    loadedAt = Date.now();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
onActivated(() => {
  if (loadedAt && Date.now() - loadedAt > 60_000) load();
});

/** "3m ago", "2h ago", "4d ago" */
const ago = (iso: string | null | undefined) => timeAgo(iso, { suffix: " ago", never: "never", dateAfterDays: Infinity });

const weekLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
};
const signupBars = computed(() =>
  (data.value?.weekly ?? []).map((w, i, all) => ({ label: weekLabel(w.week), value: w.signups, highlight: i === all.length - 1 })),
);
const loggedBars = computed(() =>
  (data.value?.weekly ?? []).map((w, i, all) => ({ label: weekLabel(w.week), value: w.logged, highlight: i === all.length - 1 })),
);

const unused = computed(() => (data.value ? data.value.catalog.unused_artists + data.value.catalog.unused_venues : 0));

async function prune() {
  if (!data.value || !unused.value) return;
  const c = data.value.catalog;
  if (!confirm(`Remove ${c.unused_artists} artists and ${c.unused_venues} venues that no show uses? This can't be undone.`)) return;
  pruning.value = true;
  try {
    const r = await admin.pruneUnused();
    ui.flash(`Removed ${r.artists} artists and ${r.venues} venues`);
    await load();
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    pruning.value = false;
  }
}
</script>

<template>
  <div class="ov">
    <div class="ov__bar">
      <span v-if="loadedAt && !loading" class="ss-muted small">Updated {{ ago(new Date(loadedAt).toISOString()) }}</span>
      <SsButton size="sm" variant="outline" :loading="loading" @click="load">Refresh</SsButton>
    </div>

    <SsEmpty v-if="error && !data" title="Couldn't load the overview" :body="error">
      <SsButton size="sm" variant="outline" @click="load">Try again</SsButton>
    </SsEmpty>

    <div v-else-if="!data" class="tiles">
      <SsSkeleton v-for="i in 6" :key="i" height="110px" radius="var(--ss-radius-lg)" />
    </div>

    <template v-else>
      <!-- Headline numbers -->
      <div class="tiles">
        <!-- Row 1: people · Row 2: shows and suspensions -->
        <button type="button" class="tile-btn" @click="emit('go', 'users')">
          <SsStatCard
            label="USERS"
            :value="num(data.totals.users)"
            tone="accent"
            :caption="`+${num(data.totals.users_7d)} this week · ${num(data.totals.users_30d)} in 30 days`"
          />
        </button>
        <SsStatCard label="ACTIVE · 7 DAYS" :value="num(data.totals.active_7d)" caption="signed in" />
        <button type="button" class="tile-btn" @click="emit('go', 'users')">
          <SsStatCard label="UNCONFIRMED" :value="num(data.totals.unconfirmed)" caption="email not confirmed" />
        </button>
        <SsStatCard label="SHOWS LOGGED" :value="num(data.totals.attendances)" :caption="`${num(data.totals.shows)} shows in catalog`" />
        <SsStatCard label="LOGGED · 7 DAYS" :value="num(data.totals.attendances_7d)" />
        <button type="button" class="tile-btn" @click="emit('go', 'users')">
          <SsStatCard label="SUSPENDED" :value="num(data.totals.suspended)" />
        </button>
      </div>

      <div class="extras ss-muted small">
        {{ num(data.totals.public) }} public profiles · {{ num(data.totals.manual_shows) }} hand-added shows ·
        {{ num(data.totals.songs) }} setlist songs · {{ num(data.totals.photos) }} photos ·
        {{ num(data.totals.friendships) }} friendships · {{ num(data.totals.push_devices) }} devices with notifications
      </div>

      <!-- Activity -->
      <div class="two">
        <SsCard title="Signups per week">
          <template #aside><span class="ss-muted small">last 12 weeks</span></template>
          <SsBarChart :data="signupBars" :height="150" />
        </SsCard>
        <SsCard title="Shows logged per week">
          <template #aside><span class="ss-muted small">last 12 weeks</span></template>
          <SsBarChart :data="loggedBars" :height="150" />
        </SsCard>
      </div>

      <!-- Catalog health -->
      <SsCard title="Catalog health">
        <div class="health">
          <button type="button" class="h" @click="emit('go', 'artists')">
            <b>{{ num(data.catalog.artists_pending) }}</b><span>artists waiting for image lookup</span>
          </button>
          <button type="button" class="h" @click="emit('go', 'artists')">
            <b>{{ num(data.catalog.artists_no_image) }}</b><span>artists without images</span>
          </button>
          <button type="button" class="h" @click="emit('go', 'venues')">
            <b>{{ num(data.catalog.venues_pending) }}</b><span>venues waiting for pin/image lookup</span>
          </button>
          <button type="button" class="h" @click="emit('go', 'venues')">
            <b>{{ num(data.catalog.venues_city_only) }}</b><span>venues pinned only to their city</span>
          </button>
          <button type="button" class="h" @click="emit('go', 'venues')">
            <b>{{ num(data.catalog.venues_no_image) }}</b><span>venues without images</span>
          </button>
          <div class="h">
            <b>{{ num(data.catalog.api_cache_rows) }}</b><span>cached setlist.fm replies · {{ bytes(data.catalog.api_cache_bytes) }}</span>
          </div>
        </div>
        <div class="prune">
          <span>
            <b>{{ num(data.catalog.unused_artists) }}</b> artists and <b>{{ num(data.catalog.unused_venues) }}</b> venues aren't used by any show.
          </span>
          <SsButton size="sm" variant="outline" :disabled="!unused" :loading="pruning" @click="prune">Remove unused</SsButton>
        </div>
      </SsCard>

      <!-- Jobs -->
      <SsCard title="Background jobs">
        <div class="jobs">
          <div v-for="j in data.jobs" :key="j.name" class="job">
            <div class="job__main">
              <div class="job__name">{{ j.name }}</div>
              <div class="job__sched ss-muted small">{{ j.schedule }}<template v-if="!j.active"> · paused</template></div>
            </div>
            <div class="job__run small">
              <span class="pill" :class="j.last_status === 'succeeded' ? 'pill--ok' : j.last_status ? 'pill--bad' : 'pill--idle'">
                {{ j.last_status ?? "not run" }}
              </span>
              <span class="ss-muted">{{ ago(j.last_start) }}</span>
              <span v-if="j.failures_24h" class="bad">{{ j.failures_24h }} failed in 24h</span>
            </div>
            <div v-if="j.last_message" class="job__msg ss-truncate" :title="j.last_message">{{ j.last_message }}</div>
          </div>
          <p v-if="!data.jobs.length" class="ss-muted">No scheduled jobs found.</p>
        </div>
      </SsCard>

      <!-- Job HTTP failures -->
      <SsCard title="Recent job errors">
        <template #aside>
          <span class="small ss-muted">{{ num(data.http.ok) }} ok · {{ num(data.http.failed) }} failed (recent hours)</span>
        </template>
        <div v-if="data.http.recent_failures.length" class="fails">
          <div v-for="(f, i) in data.http.recent_failures" :key="i" class="fail">
            <SsTag tone="outline">{{ f.status_code ?? "ERR" }}</SsTag>
            <span class="ss-muted small">{{ ago(f.created) }}</span>
            <span class="fail__msg">{{ f.message || "No details" }}</span>
          </div>
        </div>
        <p v-else class="ss-muted">No failures. Everything's running.</p>
      </SsCard>
    </template>
  </div>
</template>

<style scoped>
.ov { display: flex; flex-direction: column; gap: 16px; }
.ov__bar { display: flex; justify-content: flex-end; align-items: center; gap: 10px; }
.small { font-size: 13px; }
.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 420px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tile-btn { display: block; padding: 0; border: 0; background: none; text-align: left; color: inherit; border-radius: var(--ss-radius-lg); }
.tile-btn > * { height: 100%; }
.tile-btn:hover :deep(.ss-stat) { border-color: var(--ss-line-strong); }
.extras { line-height: 1.5; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 16px; }

.health { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.h {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line);
  text-align: left;
  color: var(--ss-text);
}
button.h:hover { border-color: var(--ss-line-strong); }
.h b { font-size: 24px; font-weight: 900; line-height: 1; }
.h span { font-size: 13px; color: var(--ss-text-muted); }
.prune {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--ss-line-soft);
  font-size: 14px;
}

.jobs { display: flex; flex-direction: column; }
.job {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 12px;
  padding: 10px 0;
  border-top: 1px solid var(--ss-line-soft);
}
.job:first-child { border-top: 0; }
.job__name { font-weight: 800; }
.job__sched { font-family: var(--ss-font-mono); }
.job__run { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.job__msg { grid-column: 1 / -1; font-family: var(--ss-font-mono); font-size: 12px; color: var(--ss-text-faint); }
.pill { padding: 2px 8px; border-radius: var(--ss-radius-pill); font-weight: 700; font-size: 12px; }
.pill--ok { background: var(--ss-success-soft); color: var(--ss-success); }
.pill--bad { background: var(--ss-danger-soft); color: var(--ss-danger); }
.pill--idle { background: var(--ss-surface-2); color: var(--ss-text-muted); }
.bad { color: var(--ss-danger); font-weight: 700; }

.fails { display: flex; flex-direction: column; gap: 8px; }
.fail { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.fail__msg { font-family: var(--ss-font-mono); font-size: 12px; color: var(--ss-text-3); overflow-wrap: anywhere; flex: 1 1 200px; }
@media (max-width: 480px) {
  .job { grid-template-columns: minmax(0, 1fr); }
  .job__run { justify-content: flex-start; }
}
</style>
