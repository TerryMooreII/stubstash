<script setup lang="ts">
// Artist page: your history with one artist (personal stats only).
import { computed, ref, watch } from "vue";
import { SsArt, SsBackLink, SsCard, SsChip, SsEmpty, SsIcon, SsSkeleton, SsStars } from "@/design-system";
import { artistStats, getArtist } from "@/lib/api";
import { genericConcertPhoto } from "@/lib/heroImage";
import { errorMessage } from "@/lib/supabase";
import { dateParts, monthYear, num, parseDate, place, plural } from "@/lib/format";
import type { ArtistStats } from "@/lib/types";
import { useLog } from "@/stores/log";

const props = defineProps<{ id: string }>();
const log = useLog();

type Artist = NonNullable<Awaited<ReturnType<typeof getArtist>>>;
const artist = ref<Artist | null>(null);
const stats = ref<ArtistStats | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [a, s] = await Promise.all([getArtist(props.id), artistStats(props.id), log.load()]);
    artist.value = a as Artist | null;
    stats.value = s;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
watch(() => props.id, load, { immediate: true });

// Banner: the artist photo blurred behind a sharp portrait. With no artist
// photo (or one that fails to load), a tinted generic concert shot instead.
const imgFailed = ref(false);
watch(() => props.id, () => (imgFailed.value = false));
const hasPhoto = computed(() => !!artist.value?.image_url && !imgFailed.value);
const bannerSrc = computed(() =>
  hasPhoto.value ? artist.value!.image_url! : genericConcertPhoto(props.id),
);

const shows = computed(() => log.entries.filter((e) => e.artist_id === props.id));
const kicker = computed(() => {
  const parts: string[] = [];
  if (artist.value?.genre) parts.push(artist.value.genre);
  if (stats.value?.first) parts.push(`First seen ${parseDate(stats.value.first).getFullYear()}`);
  return parts.join(" · ");
});
</script>

<template>
  <div class="ss-page">
    <SsBackLink />

    <template v-if="loading">
      <div class="hero">
        <SsSkeleton width="200px" height="200px" radius="50%" />
        <div class="ss-stack" style="flex: 1"><SsSkeleton height="20px" width="40%" /><SsSkeleton height="64px" /></div>
      </div>
    </template>

    <SsEmpty v-else-if="error || !artist" title="Artist not found" :body="error ?? 'This artist may have been removed.'" />

    <template v-else>
      <header class="hero" :class="{ 'hero--generic': !hasPhoto }">
        <div class="hero__bg" aria-hidden="true">
          <img :src="bannerSrc" alt="" referrerpolicy="no-referrer" decoding="async" />
          <div v-if="!hasPhoto" class="hero__tint" />
        </div>
        <SsArt
          v-if="hasPhoto"
          class="hero__img"
          shape="circle"
          :src="artist.image_url"
          :seed="artist.name"
          :alt="artist.name"
          eager
          @error="imgFailed = true"
        />
        <div class="hero__text">
          <div v-if="kicker" class="ss-kicker">{{ kicker }}</div>
          <h1 class="ss-hero hero__name">{{ artist.name }}</h1>
          <p v-if="stats && stats.seen" class="hero__line">
            Seen <b class="accent">{{ plural(stats.seen, "time") }}</b>
            <template v-if="stats.last"> · last {{ monthYear(stats.last) }}</template>
            <template v-if="stats.unique_songs"> · {{ num(stats.unique_songs) }} different songs heard</template>
          </p>
          <p v-else class="hero__line">Not in your log yet.</p>
          <a v-if="artist.setlistfm_url" :href="artist.setlistfm_url" target="_blank" rel="noopener" class="hero__ext">
            setlist.fm page <SsIcon name="external" :size="14" />
          </a>
        </div>
      </header>

      <div class="ss-grid">
        <SsCard title="Heard most">
          <template v-if="stats?.heard_most.length">
            <div v-for="s in stats.heard_most" :key="s.name" class="row">
              <span class="row__t">{{ s.name }}</span><b class="ss-num">{{ s.n }}×</b>
            </div>
          </template>
          <p v-else class="ss-muted">No setlists for your shows yet.</p>

          <h2 class="ss-h2 once-title">Heard only once</h2>
          <p class="ss-muted once-sub">Songs you've caught a single time. Rare for you.</p>
          <div v-if="stats?.heard_once.length" class="chips">
            <SsChip v-for="s in stats.heard_once" :key="s.name + s.date" variant="dashed">{{ s.name }}</SsChip>
          </div>
          <p v-else class="ss-muted">Nothing yet. See them a few more times.</p>
        </SsCard>

        <SsCard :title="`Your ${artist.name} shows`">
          <RouterLink v-for="s in shows" :key="s.attendance_id" :to="`/app/shows/${s.attendance_id}`" class="show">
            <div class="show__date">
              <div class="show__mon">{{ dateParts(s.event_date).mon }}</div>
              <div class="show__day">{{ dateParts(s.event_date).day }}</div>
              <div class="show__yr">{{ dateParts(s.event_date).yr }}</div>
            </div>
            <div class="show__body">
              <div class="show__venue">{{ s.venue_name }}</div>
              <div class="show__sub">
                {{ place(s.city, s.state_code, s.country_code) }}<template v-if="s.song_count"> · {{ s.song_count }} songs</template>
              </div>
            </div>
            <SsStars :value="s.rating" />
          </RouterLink>
          <p v-if="!shows.length" class="ss-muted">No shows logged with them.</p>
        </SsCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  gap: 24px;
  align-items: flex-end;
  flex-wrap: wrap;
  min-height: 280px;
  padding: 24px;
  border-radius: var(--ss-radius-xl);
  background: var(--ss-surface-2);
}
.hero__bg { position: absolute; inset: 0; z-index: -1; }
.hero__bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
  /* Blurred copy of the portrait: colour and mood without competing with it. */
  filter: blur(28px) brightness(0.5) saturate(1.3);
  transform: scale(1.25);
}
.hero__bg::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 30%, rgba(10, 9, 12, 0.85));
}
/* Generic stock photo: sharp but mono and tinted, same treatment as the show page. */
.hero--generic .hero__bg img { filter: grayscale(1) contrast(1.15) brightness(0.55); transform: none; }
.hero__tint { position: absolute; inset: 0; background: var(--ss-accent); mix-blend-mode: multiply; opacity: 0.85; }
.hero__img { width: 200px; height: 200px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5); }
@media (max-width: 520px) { .hero__img { width: 140px; height: 140px; } }
.hero__text { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.hero__name { overflow-wrap: anywhere; }
.hero__line { font-size: 18px; color: var(--ss-text-2); }
.accent { color: var(--ss-accent); }
.hero__ext { font-size: 14px; font-weight: 700; display: inline-flex; gap: 4px; align-items: center; }
.row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--ss-line-soft); }
.row__t { font-weight: 700; min-width: 0; overflow-wrap: anywhere; }
.once-title { margin-top: 22px; }
.once-sub { font-size: 14px; margin: 2px 0 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.show {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--ss-line-soft);
  color: var(--ss-text);
  text-decoration: none;
}
.show:hover { text-decoration: none; color: var(--ss-text); }
.show:hover .show__venue { color: var(--ss-accent); }
.show__date { width: 52px; text-align: center; flex-shrink: 0; }
.show__mon { font-family: var(--ss-font-mono); font-size: 10px; color: var(--ss-accent); }
.show__day { font-weight: 900; font-size: 22px; line-height: 1; }
.show__yr { font-size: 11px; color: var(--ss-text-muted); }
.show__body { flex: 1; min-width: 0; }
.show__venue { font-weight: 700; }
.show__sub { font-size: 13px; color: var(--ss-text-muted); }
</style>
