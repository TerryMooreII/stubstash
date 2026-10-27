<script setup lang="ts">
// First-run setup, from the design's onboarding: intro → setlist.fm import →
// home base → "You're in" with real totals.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsButton, SsChip, SsInput, SsLogo, SsProgress, SsSpinner } from "@/design-system";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";
import { setlistfm } from "@/lib/api";
import { searchPlaces, type PlaceResult } from "@/lib/geocode";
import { compact, mediumDate, num } from "@/lib/format";
import { errorMessage } from "@/lib/supabase";

const auth = useAuth();
const log = useLog();
const ui = useUi();
const route = useRoute();
const router = useRouter();

const step = ref(0);
const dots = computed(() => [0, 1, 2, 3].map((i) => ({ w: i === step.value ? 22 : 6, on: i <= step.value })));

// ---------------------------------------------------------------- step 1: import
type ImportState = "idle" | "looking" | "found" | "none" | "importing" | "done";
const username = ref(auth.profile?.setlistfm_username ?? "");
const importState = ref<ImportState>("idle");
const preview = ref<{ total: number; pages: number; earliest: { artist: string; venue: string; date: string } | null } | null>(null);
const importPage = ref(0);
const imported = ref(0);
const importError = ref<string | null>(null);

watch(username, () => {
  if (importState.value === "found" || importState.value === "none") importState.value = "idle";
  importError.value = null;
});

const importLabel = computed(() => {
  switch (importState.value) {
    case "looking": return "Digging through setlist.fm…";
    case "found": return `Import ${num(preview.value?.total ?? 0)} show${preview.value?.total === 1 ? "" : "s"}`;
    case "importing": return "Importing…";
    case "none": return "Try again";
    default: return "Find my shows";
  }
});

async function onImport() {
  importError.value = null;
  const u = username.value.trim().replace(/^.*setlist\.fm\/user\//i, "").replace(/\/.*$/, "");
  if (!u) return void (importError.value = "Enter your setlist.fm username.");
  username.value = u;

  if (importState.value === "idle" || importState.value === "none") {
    importState.value = "looking";
    try {
      const p = await setlistfm.previewUser(u);
      preview.value = p;
      importState.value = p.total ? "found" : "none";
      if (!p.total) importError.value = `No "I was there" shows found for ${u}. Check the username, or add shows yourself.`;
    } catch (e) {
      importState.value = "idle";
      importError.value = errorMessage(e);
    }
    return;
  }

  if (importState.value === "found" && preview.value) {
    importState.value = "importing";
    imported.value = 0;
    try {
      for (let p = 1; p <= preview.value.pages; p++) {
        importPage.value = p;
        const res = await setlistfm.importPage(u, p);
        imported.value += res.imported;
      }
      importState.value = "done";
      await auth.loadProfile().catch(() => {});
      step.value = 2;
    } catch (e) {
      importState.value = "found";
      importError.value = `${errorMessage(e)} Your progress is saved; tap Import to pick up where it stopped.`;
    }
  }
}

const importPct = computed(() => (preview.value?.pages ? ((importPage.value - (importState.value === "importing" ? 0.5 : 0)) / preview.value.pages) * 100 : 0));

// ---------------------------------------------------------------- step 2: home base
const cityQuery = ref(auth.profile?.home_city ?? "");
const cityResults = ref<PlaceResult[]>([]);
const citySearching = ref(false);
const picked = ref<PlaceResult | null>(
  auth.profile?.home_lat != null && auth.profile.home_lng != null && auth.profile.home_city
    ? { label: auth.profile.home_city, city: auth.profile.home_city, country_code: auth.profile.home_country_code, lat: auth.profile.home_lat, lng: auth.profile.home_lng }
    : null,
);
const defaults = ["Brooklyn, NY", "Chicago, IL", "Denver, CO", "London, GB"];
let debounce: ReturnType<typeof setTimeout> | undefined;

watch(cityQuery, (q) => {
  if (picked.value && q === picked.value.label) return;
  picked.value = null;
  clearTimeout(debounce);
  if (q.trim().length < 2) { cityResults.value = []; return; }
  debounce = setTimeout(async () => {
    citySearching.value = true;
    try { cityResults.value = await searchPlaces(q); } catch { cityResults.value = []; }
    finally { citySearching.value = false; }
  }, 450);
});
onBeforeUnmount(() => clearTimeout(debounce));

function pickPlace(p: PlaceResult) {
  picked.value = p;
  cityQuery.value = p.label;
  cityResults.value = [];
}
async function pickDefault(label: string) {
  citySearching.value = true;
  try {
    const [first] = await searchPlaces(label);
    if (first) pickPlace(first);
  } finally {
    citySearching.value = false;
  }
}

const savingHome = ref(false);
async function saveHome() {
  if (!picked.value) {
    if (cityResults.value[0]) pickPlace(cityResults.value[0]);
    else return void ui.error("Pick your city from the list so we can map it.");
  }
  savingHome.value = true;
  try {
    await auth.saveProfile({
      home_city: picked.value!.label,
      home_lat: picked.value!.lat,
      home_lng: picked.value!.lng,
      home_country_code: picked.value!.country_code,
    });
    step.value = 3;
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    savingHome.value = false;
  }
}

// ---------------------------------------------------------------- step 3: you're in
watch(step, (s) => { if (s === 3) log.refresh(); });
const t = computed(() => log.stats?.totals);
const finishing = ref(false);
const outro = computed(() => {
  const n = t.value?.shows ?? 0;
  if (n === 0) return "A blank ticket stub. Let's fill it up.";
  if (n < 10) return "A solid start. Let's go.";
  return "That's a lot of encores. Let's go.";
});

async function finish() {
  finishing.value = true;
  try {
    await auth.saveProfile({ onboarded_at: new Date().toISOString() });
    const n = route.query.next;
    router.replace(typeof n === "string" && n.startsWith("/app") ? n : "/app");
  } catch (e) {
    ui.error(errorMessage(e));
    finishing.value = false;
  }
}
</script>

<template>
  <div class="ob">
    <header class="ob__top">
      <SsLogo :size="22" />
      <div class="ob__dots" aria-hidden="true">
        <span v-for="(d, i) in dots" :key="i" class="ob__dot" :class="{ 'is-on': d.on }" :style="{ width: d.w + 'px' }" />
      </div>
    </header>

    <main class="ob__body">
      <div class="ob__col">
        <!-- 0: intro -->
        <template v-if="step === 0">
          <div class="ss-kicker">WELCOME TO THE PIT</div>
          <h1 class="ob__big">Every show you've ever been to. Counted.</h1>
          <p class="ob__lede">Two quick steps: pull in your setlist.fm history and tell us where home is. Then the stats, maps and bragging rights stack up.</p>
          <div class="ob__stack">
            <SsButton size="lg" block @click="step = 1">Let's set you up</SsButton>
            <SsButton variant="ghost" @click="step = 2">Skip the import</SsButton>
          </div>
        </template>

        <!-- 1: import -->
        <template v-else-if="step === 1">
          <div class="ss-kicker">STEP 1 · IMPORT</div>
          <h1 class="ob__h">Got a setlist.fm account?</h1>
          <p class="ob__lede ob__lede--sm">We'll pull every show you've marked "I was there." Read-only. We never write back.</p>
          <SsInput
            v-model="username"
            prefix="setlist.fm/user/"
            size="lg"
            autocomplete="off"
            enterkeyhint="search"
            placeholder="username"
            :maxlength="60"
            @enter="onImport"
          />
          <div v-if="preview && (importState === 'found' || importState === 'importing')" class="ob__found">
            <div class="ob__found-n ss-num">{{ num(preview.total) }}</div>
            <div class="ob__found-text">
              <b>{{ preview.total === 1 ? "show" : "shows" }} found</b>
              <template v-if="preview.earliest">
                . Earliest: {{ preview.earliest.artist }}, {{ preview.earliest.venue }}, {{ mediumDate(preview.earliest.date) }}.
              </template>
            </div>
          </div>
          <div v-if="importState === 'importing'" class="ob__progress">
            <SsProgress :value="importPct" label="Import progress" />
            <div class="ob__progress-text">Page {{ importPage }} of {{ preview?.pages }} · {{ num(imported) }} added so far</div>
          </div>
          <p v-if="importError" class="ob__error" role="alert">{{ importError }}</p>
          <SsButton size="lg" block :loading="importState === 'looking' || importState === 'importing'" @click="onImport">{{ importLabel }}</SsButton>
          <SsButton variant="ghost" :disabled="importState === 'importing'" @click="step = 2">I'll add shows myself</SsButton>
        </template>

        <!-- 2: home base -->
        <template v-else-if="step === 2">
          <div class="ss-kicker">STEP 2 · HOME BASE</div>
          <h1 class="ob__h">Where do you call home?</h1>
          <p class="ob__lede ob__lede--sm">We use it to count miles traveled and draw your road-trip lines on the map. City only, never your address.</p>
          <SsInput v-model="cityQuery" size="lg" icon="pin" placeholder="Your city" autocomplete="address-level2" enterkeyhint="done" @enter="saveHome">
            <template #end><SsSpinner v-if="citySearching" :size="16" /></template>
          </SsInput>
          <div class="ob__chips">
            <template v-if="cityResults.length">
              <SsChip v-for="p in cityResults" :key="p.label + p.lat" variant="soft" @click="pickPlace(p)">{{ p.label }}</SsChip>
            </template>
            <template v-else-if="!picked">
              <SsChip v-for="c in defaults" :key="c" variant="soft" @click="pickDefault(c)">{{ c }}</SsChip>
            </template>
            <span v-else class="ob__picked">✓ {{ picked.label }}</span>
          </div>
          <SsButton size="lg" block :loading="savingHome" :disabled="!cityQuery.trim()" @click="saveHome">Looks right</SsButton>
          <SsButton variant="ghost" @click="step = 3">Skip for now</SsButton>
        </template>

        <!-- 3: you're in -->
        <template v-else>
          <div class="ss-kicker">YOU'RE IN</div>
          <div class="ob__grid">
            <div class="ob__tile ob__tile--accent">
              <div class="ob__tile-n ss-num">{{ t ? num(t.shows) : "…" }}</div><div class="ob__tile-k">shows</div>
            </div>
            <div class="ob__tile ob__tile--butter">
              <div class="ob__tile-n ss-num">{{ t ? num(t.artists) : "…" }}</div><div class="ob__tile-k">artists</div>
            </div>
            <div class="ob__tile ob__tile--teal">
              <div class="ob__tile-n ss-num">{{ t ? compact(t.songs) : "…" }}</div><div class="ob__tile-k">songs heard</div>
            </div>
            <div class="ob__tile">
              <div class="ob__tile-n ss-num">{{ t ? compact(t.miles) : "…" }}</div><div class="ob__tile-k">miles</div>
            </div>
          </div>
          <h1 class="ob__h">{{ outro }}</h1>
          <SsButton size="lg" block :loading="finishing" @click="finish">Open my dashboard</SsButton>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped>
.ob {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: radial-gradient(120% 70% at 50% 0%, rgba(244, 184, 17, 0.16), transparent 60%), var(--ss-bg);
}
.ob__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(20px + var(--ss-safe-top)) 24px 20px;
}
.ob__dots { display: flex; gap: 6px; }
.ob__dot {
  height: 6px;
  border-radius: 6px;
  background: var(--ss-line-strong);
  transition: all var(--ss-dur) var(--ss-ease);
}
.ob__dot.is-on { background: var(--ss-accent); }
.ob__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px calc(40px + var(--ss-safe-bottom));
}
.ob__col {
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ob__big {
  font-weight: 900;
  font-size: clamp(40px, 11vw, 52px);
  line-height: 0.92;
  letter-spacing: var(--ss-tracking-tight);
  text-wrap: balance;
}
.ob__h {
  font-weight: 900;
  font-size: clamp(34px, 9vw, 42px);
  line-height: 0.95;
  letter-spacing: var(--ss-tracking-tight);
  text-wrap: balance;
}
.ob__lede { font-size: 18px; color: var(--ss-text-3); line-height: 1.45; text-wrap: pretty; }
.ob__lede--sm { font-size: 17px; }
.ob__stack { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.ob__found {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 16px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-success-soft);
  border: 1px solid rgba(157, 177, 97, 0.5);
}
.ob__found-n { font-weight: 900; font-size: 40px; color: var(--ss-cream); line-height: 1; }
.ob__found-text { font-size: 15px; line-height: 1.35; }
.ob__progress { display: flex; flex-direction: column; gap: 8px; }
.ob__progress-text { font-size: 13px; color: var(--ss-text-muted); }
.ob__error { color: var(--ss-danger); font-weight: 600; font-size: 14px; line-height: 1.4; }
.ob__chips { display: flex; gap: 8px; flex-wrap: wrap; min-height: 36px; align-items: center; }
.ob__picked { color: var(--ss-success); font-weight: 700; }
.ob__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ob__tile {
  padding: 18px;
  border-radius: 16px;
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  min-width: 0;
}
.ob__tile--accent { background: var(--ss-accent); border-color: var(--ss-accent); color: var(--ss-on-accent); }
.ob__tile--butter { background: var(--ss-butter); border-color: var(--ss-butter); color: var(--ss-on-accent); }
.ob__tile--teal { background: var(--ss-teal); border-color: var(--ss-teal); color: var(--ss-on-accent); }
.ob__tile-n { font-weight: 900; font-size: clamp(38px, 11vw, 54px); line-height: 0.9; overflow-wrap: anywhere; }
.ob__tile-k { font-weight: 700; }
</style>
