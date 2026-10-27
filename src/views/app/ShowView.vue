<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  SsArt, SsAvatar, SsBackLink, SsButton, SsCard, SsEmpty, SsIcon, SsSheet, SsSkeleton, SsStars, SsTag,
} from "@/design-system";
import ShareCardSheet from "@/components/share/ShareCardSheet.vue";
import type { ShareCard } from "@/components/share/shareCard";
import { getAttendance, setlistfm, showSetlist, showStats, updateAttendance } from "@/lib/api";
import { dateParts, longDate, money, ordinal, place } from "@/lib/format";
import { signedUrl, signedUrls } from "@/lib/media";
import { errorMessage } from "@/lib/supabase";
import type { AttendanceDetail, SetlistSong, ShowStats } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const props = defineProps<{ id: string; handle?: string }>();
const auth = useAuth();
const log = useLog();
const ui = useUi();
const route = useRoute();
const router = useRouter();

const att = ref<AttendanceDetail | null>(null);
const songs = ref<SetlistSong[]>([]);
const stats = ref<ShowStats | null>(null);
const loading = ref(true);
const notFound = ref(false);
const photoUrls = ref<Record<string, string>>({});
const stubUrl = ref<string | null>(null);

async function load() {
  loading.value = true;
  notFound.value = false;
  try {
    const [a, s, st] = await Promise.all([getAttendance(props.id), showSetlist(props.id), showStats(props.id)]);
    att.value = a;
    songs.value = s;
    stats.value = st;
    notFound.value = !a;
    if (a) {
      if (a.photos.length) signedUrls("photos", a.photos.map((p) => p.storage_path)).then((u) => (photoUrls.value = u));
      stubUrl.value = a.stub_path ? await signedUrl("stubs", a.stub_path) : null;
      if (route.query.rate === "1" && mine.value && a.rating == null) rateOpen.value = true;
    }
  } catch (e) {
    ui.error(errorMessage(e));
    notFound.value = !att.value;
  } finally {
    loading.value = false;
  }
}
watch(() => props.id, load, { immediate: true });

const mine = computed(() => !!att.value && att.value.user_id === auth.userId);
const show = computed(() => att.value?.show);
const d = computed(() => (show.value ? dateParts(show.value.event_date) : null));
const venuePlace = computed(() => (show.value ? place(show.value.venue.city, show.value.venue.state_code, show.value.venue.country_code) : ""));
const isManual = computed(() => show.value?.source === "manual");

// ---- setlist grouped by set
const sets = computed(() => {
  const groups: { key: number; name: string; encore: boolean; songs: SetlistSong[] }[] = [];
  for (const s of songs.value) {
    let g = groups.find((x) => x.key === s.set_index);
    if (!g) groups.push((g = { key: s.set_index, name: s.set_name, encore: s.is_encore, songs: [] }));
    g.songs.push(s);
  }
  return groups;
});
const songCount = computed(() => songs.value.filter((s) => !s.is_tape).length);
const firsts = computed(() => stats.value?.first_hears ?? songs.value.filter((s) => s.first_hear).length);
const onlyHere = computed(() => songs.value.filter((s) => s.only_here && !s.is_tape).length);
const timeSeeing = computed(() => (stats.value?.artist_ordinal ? ordinal(stats.value.artist_ordinal) : "1st"));

// ---- your night
const companions = computed(() => att.value?.companions ?? []);
const withNames = computed(() => {
  const n = companions.value.map((c) => c.name.split(" ")[0]);
  return n.length <= 2 ? n.join(" & ") : `${n.slice(0, -1).join(", ")} & ${n[n.length - 1]}`;
});
const nightEmpty = computed(
  () => !!att.value && !att.value.rating && !companions.value.length && !att.value.seat && att.value.price_cents == null && !att.value.merch && !att.value.notes,
);

// ---- refresh setlist from setlist.fm
const refreshing = ref(false);
async function checkAgain() {
  if (!show.value) return;
  refreshing.value = true;
  try {
    await setlistfm.refresh(show.value.id);
    await load();
    ui.flash(songs.value.length ? `Got ${songCount.value} songs from setlist.fm` : "Still no setlist. Check back later.", songs.value.length ? "accent" : "info");
    if (songs.value.length) log.refresh();
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    refreshing.value = false;
  }
}

// ---- quick rating
const rateOpen = ref(false);
const rateValue = ref<number | null>(null);
const savingRate = ref(false);
watch(rateOpen, (o) => o && (rateValue.value = att.value?.rating ?? null));
async function saveRating() {
  if (!att.value) return;
  savingRate.value = true;
  try {
    await updateAttendance(att.value.id, { rating: rateValue.value });
    att.value.rating = rateValue.value;
    rateOpen.value = false;
    ui.flash(rateValue.value ? "Rated. Thanks!" : "Rating cleared");
    log.refresh();
    if (route.query.rate) router.replace({ query: {} });
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    savingRate.value = false;
  }
}

// ---- lightbox + share
const lightbox = ref<string | null>(null);
const lightboxOpen = computed({ get: () => !!lightbox.value, set: (v) => !v && (lightbox.value = null) });
const shareOpen = ref(false);
const shareCard = computed<ShareCard>(() => {
  const s = show.value!;
  const dp = d.value!;
  return {
    kicker: `${dp.mon} ${dp.day} ${dp.yr}`,
    pre: "I was there:",
    big: s.artist.name.toUpperCase(),
    sub: [s.venue.name, venuePlace.value].filter(Boolean).join(" · "),
    stats: [
      { v: String(songCount.value || "—"), k: "songs" },
      { v: String(firsts.value), k: "first hears" },
      { v: timeSeeing.value, k: "time" },
    ],
  };
});
</script>

<template>
  <div class="ss-page">
    <SsBackLink :fallback="handle ? `/u/${handle}` : '/app/shows'" :label="handle ? 'Back' : 'My shows'" />

    <template v-if="loading && !att">
      <SsSkeleton height="300px" radius="var(--ss-radius-xl)" />
      <div class="ss-grid" style="--ss-grid-min: 120px"><SsSkeleton v-for="i in 4" :key="i" height="84px" radius="var(--ss-radius-md)" /></div>
      <SsSkeleton height="320px" radius="var(--ss-radius-lg)" />
    </template>

    <SsEmpty v-else-if="notFound || !att || !show" title="We can’t find that show" body="It may have been removed, or it belongs to a private profile.">
      <SsButton to="/app/shows" variant="outline">Back to my shows</SsButton>
    </SsEmpty>

    <template v-else>
      <!-- Hero -->
      <SsArt
        :src="show.artist.image_url"
        :seed="show.artist.name"
        :alt="show.artist.name"
        :credit="show.artist.image_credit"
        credit-label="ARTIST IMAGE"
        class="hero"
        eager
      >
        <div class="hero__body">
          <div class="hero__pills">
            <span v-if="stats?.show_number" class="pill pill--accent">Show {{ stats.show_number }}</span>
            <SsTag :tone="'dark'" :class="isManual ? 'src-manual' : 'src-sfm'">{{ isManual ? "ADDED BY YOU" : "VIA SETLIST.FM" }}</SsTag>
            <SsTag v-if="att.is_festival ?? show.is_festival" tone="dark">FESTIVAL</SsTag>
          </div>
          <RouterLink :to="`/app/artists/${show.artist.id}`" class="hero__artist ss-hero">{{ show.artist.name }}</RouterLink>
          <div class="hero__line">
            {{ longDate(show.event_date) }} ·
            <RouterLink :to="`/app/venues/${show.venue.id}`" class="hero__venue">{{ show.venue.name }}</RouterLink>
            <template v-if="venuePlace"> · {{ venuePlace }}</template>
          </div>
          <div v-if="show.tour_name" class="hero__tour">{{ show.tour_name }}</div>
        </div>
      </SsArt>

      <!-- Numbers -->
      <div class="tiles">
        <div class="tile"><div class="tile__n">{{ songCount || "—" }}</div><div class="tile__k">songs played</div></div>
        <div class="tile"><div class="tile__n tile__n--teal">{{ firsts }}</div><div class="tile__k">first-time hears</div></div>
        <div class="tile"><div class="tile__n tile__n--accent">{{ onlyHere }}</div><div class="tile__k">only time you’ve heard</div></div>
        <div class="tile"><div class="tile__n">{{ timeSeeing }}</div><div class="tile__k">time seeing them</div></div>
      </div>

      <div class="two">
        <!-- Setlist -->
        <SsCard title="Setlist">
          <template #aside><span class="ss-mono src">{{ isManual ? "ENTERED BY YOU" : "SOURCE: SETLIST.FM" }}</span></template>
          <div v-for="set in sets" :key="set.key" class="set">
            <div class="set__name">{{ set.name.toUpperCase() }}</div>
            <ol class="set__songs">
              <li v-for="s in set.songs" :key="s.position" class="song" :class="{ 'song--tape': s.is_tape }">
                <span class="song__n">{{ String(s.position).padStart(2, "0") }}</span>
                <span class="song__t">
                  {{ s.name }}
                  <span v-if="s.is_cover && s.cover_artist" class="song__info">{{ s.cover_artist }} cover</span>
                  <span v-else-if="s.info" class="song__info">{{ s.info }}</span>
                </span>
                <span class="song__tags">
                  <SsTag v-if="s.first_hear" tone="teal">FIRST TIME</SsTag>
                  <SsTag v-if="s.only_here && !s.is_tape" tone="butter">ONLY TIME</SsTag>
                  <SsTag v-if="s.is_cover" tone="outline">COVER</SsTag>
                  <SsTag v-if="s.is_tape" tone="outline">TAPE</SsTag>
                </span>
              </li>
            </ol>
          </div>
          <div v-if="!sets.length" class="nosongs">
            <template v-if="isManual">
              No setlist yet.<template v-if="mine"> Tap Edit to add songs.</template>
            </template>
            <template v-else>
              No setlist on setlist.fm yet.
              <SsButton variant="outline" size="sm" :loading="refreshing" @click="checkAgain"><SsIcon name="refresh" :size="16" />Check again</SsButton>
            </template>
          </div>
          <a v-if="show.setlistfm_url" :href="show.setlistfm_url" target="_blank" rel="noopener" class="sfm-link">
            View on setlist.fm <SsIcon name="external" :size="14" />
          </a>
        </SsCard>

        <div class="side">
          <!-- Your night -->
          <SsCard :title="mine ? 'Your night' : 'Their night'">
            <template #aside>
              <button v-if="mine" type="button" class="rate-btn" @click="rateOpen = true" aria-label="Rate this show">
                <SsStars :value="att.rating" />
              </button>
              <SsStars v-else :value="att.rating" />
            </template>
            <div class="night">
              <div v-if="companions.length" class="with">
                <div class="with__faces">
                  <SsAvatar v-for="c in companions.slice(0, 5)" :key="c.id" :name="c.name" :size="34" ring class="with__face" />
                </div>
                <div class="with__text">with <b>{{ withNames }}</b></div>
              </div>
              <div class="facts">
                <div><div class="fact__k">SEAT</div><div class="fact__v">{{ att.seat || "—" }}</div></div>
                <div><div class="fact__k">PAID</div><div class="fact__v">{{ money(att.price_cents, att.currency) }}</div></div>
                <div><div class="fact__k">MERCH</div><div class="fact__v">{{ att.merch || "—" }}</div></div>
              </div>
              <blockquote v-if="att.notes" class="notes">“{{ att.notes }}”</blockquote>
              <p v-if="nightEmpty && mine" class="ss-muted hint">Add a rating, who you went with and a note. <RouterLink :to="`/app/shows/${att.id}/edit`">Edit</RouterLink></p>
            </div>
          </SsCard>

          <!-- Photos & stub -->
          <SsCard title="Photos & stub">
            <template #aside>{{ att.photos.length }} photo{{ att.photos.length === 1 ? "" : "s" }}</template>
            <div class="photos">
              <button v-if="stubUrl" type="button" class="stub-img" @click="lightbox = stubUrl">
                <img :src="stubUrl" alt="Ticket stub" loading="lazy" />
              </button>
              <div v-else class="stub">
                <div class="ss-truncate">
                  <div class="stub__k">TICKET STUB</div>
                  <div class="stub__a ss-truncate">{{ show.artist.name }}</div>
                </div>
                <div class="stub__d">{{ d?.mon }} {{ d?.day }}<br />{{ att.seat || d?.yr }}</div>
              </div>
              <button
                v-for="p in att.photos"
                :key="p.id"
                type="button"
                class="photo"
                :style="photoUrls[p.storage_path] ? undefined : { background: 'var(--ss-surface-2)' }"
                @click="photoUrls[p.storage_path] && (lightbox = photoUrls[p.storage_path]!)"
              >
                <img v-if="photoUrls[p.storage_path]" :src="photoUrls[p.storage_path]" alt="Photo from the show" loading="lazy" />
              </button>
            </div>
            <p v-if="mine && !att.photos.length && !att.stub_path" class="ss-muted hint">Add your stub and photos from Edit.</p>
          </SsCard>

          <div class="actions">
            <SsButton class="actions__share" @click="shareOpen = true"><SsIcon name="share" :size="18" />Make a share card</SsButton>
            <SsButton v-if="mine" :to="`/app/shows/${att.id}/edit`" variant="outline"><SsIcon name="edit" :size="16" />Edit</SsButton>
          </div>
        </div>
      </div>

      <ShareCardSheet v-model="shareOpen" :card="shareCard" />

      <SsSheet v-model="rateOpen" label="Rate this show">
        <div class="ss-kicker">THE MORNING AFTER</div>
        <div class="ss-h2">How was {{ show.artist.name }}?</div>
        <p class="ss-muted">{{ show.venue.name }} · {{ longDate(show.event_date) }}</p>
        <SsStars v-model="rateValue" editable :size="40" />
        <div class="rate-actions">
          <SsButton variant="outline" @click="rateOpen = false">Later</SsButton>
          <SsButton :loading="savingRate" @click="saveRating">Save</SsButton>
        </div>
      </SsSheet>

      <SsSheet v-model="lightboxOpen" label="Photo" bare :width="1000">
        <img v-if="lightbox" :src="lightbox" alt="" class="lightbox" @click="lightbox = null" />
      </SsSheet>
    </template>
  </div>
</template>

<style scoped>
.hero {
  border-radius: var(--ss-radius-xl);
  min-height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.hero__body {
  position: relative;
  z-index: 1;
  padding: 24px;
  background: linear-gradient(180deg, transparent, rgba(10, 9, 12, 0.92));
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hero__pills { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pill { padding: 4px 10px; border-radius: var(--ss-radius-pill); font-weight: 900; font-size: 13px; }
.pill--accent { background: var(--ss-accent); color: var(--ss-on-accent); }
.src-sfm { color: var(--ss-teal-light); }
.src-manual { color: var(--ss-cream); }
.hero__artist { color: #fff; text-decoration: none; align-self: flex-start; overflow-wrap: anywhere; }
.hero__artist:hover { color: var(--ss-accent-hover); text-decoration: none; }
.hero__line { font-size: 18px; font-weight: 600; color: var(--ss-text-2); }
.hero__venue { font-weight: 700; }
.hero__tour { font-size: 14px; color: var(--ss-text-3); }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
@media (max-width: 400px) { .tiles { grid-template-columns: 1fr 1fr; } }
.tile { padding: 14px; border-radius: var(--ss-radius-md); background: var(--ss-surface-1); border: 1px solid var(--ss-line); }
.tile__n { font-weight: 900; font-size: 34px; line-height: 1; }
.tile__n--teal { color: var(--ss-teal-light); }
.tile__n--accent { color: var(--ss-accent); }
.tile__k { font-size: 13px; color: var(--ss-text-muted); }

.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 14px; align-items: start; }
.side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.src { font-size: 10px; letter-spacing: 0.1em; color: var(--ss-text-faint); }
.set__name { font-family: var(--ss-font-mono); font-size: 11px; letter-spacing: var(--ss-tracking-mono); color: var(--ss-accent); margin: 14px 0 4px; }
.set:first-of-type .set__name { margin-top: 0; }
.set__songs { list-style: none; margin: 0; padding: 0; }
.song { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--ss-line-soft); }
.song--tape { opacity: 0.6; }
.song__n { font-family: var(--ss-font-mono); font-size: 11px; color: var(--ss-text-faint); width: 20px; flex-shrink: 0; }
.song__t { flex: 1; min-width: 0; font-weight: 700; font-size: 16px; overflow-wrap: anywhere; }
.song__info { display: block; font-weight: 400; font-size: 12px; color: var(--ss-text-muted); }
.song__tags { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.nosongs {
  padding: 18px;
  border-radius: 12px;
  border: 1px dashed var(--ss-line-strong);
  color: var(--ss-text-muted);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.sfm-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; font-size: 13px; font-weight: 700; }

.rate-btn { border: 0; background: transparent; padding: 0; font-size: 22px; }
.night { display: flex; flex-direction: column; gap: 14px; }
.with { display: flex; align-items: center; gap: 10px; }
.with__faces { display: flex; }
.with__face { margin-right: -8px; }
.with__text { font-size: 14px; padding-left: 8px; }
.facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.fact__k { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.12em; color: var(--ss-text-faint); }
.fact__v { font-weight: 700; margin-top: 2px; overflow-wrap: anywhere; }
.notes {
  margin: 0;
  font-size: 17px;
  line-height: 1.45;
  padding: 14px;
  border-radius: 12px;
  background: var(--ss-surface-2);
  font-style: italic;
  text-wrap: pretty;
}
.hint { font-size: 14px; }

.photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.stub {
  grid-column: span 3;
  height: 88px;
  border-radius: 10px;
  background: repeating-linear-gradient(90deg, var(--ss-cream) 0 1px, transparent 1px 7px), var(--ss-butter);
  color: var(--ss-on-accent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-left: 8px dotted var(--ss-surface-1);
}
.stub__k { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.12em; }
.stub__a { font-weight: 900; font-size: 18px; }
.stub__d { font-weight: 900; font-size: 14px; text-align: right; flex-shrink: 0; }
.stub-img, .photo {
  border: 0;
  padding: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--ss-surface-2);
}
.stub-img { grid-column: span 3; max-height: 220px; }
.photo { aspect-ratio: 1; }
.stub-img img, .photo img { width: 100%; height: 100%; object-fit: cover; }

.actions { display: flex; gap: 10px; }
.actions__share { flex: 1; }
.rate-actions { display: flex; gap: 10px; }
.rate-actions > * { flex: 1; }
.lightbox { max-width: 100%; max-height: 86dvh; border-radius: 12px; object-fit: contain; cursor: zoom-out; }
</style>
