<script setup lang="ts">
import { PROFILE_BANNER } from "@/lib/heroImage";
import { SITE_HOST } from "@/lib/url";
// Big "YEAR IN REVIEW" card over a concert venue photo with year chips, six stat cells and a share button.
import { computed, ref, watch } from "vue";
import { SsSkeleton } from "@/design-system";
import ShareCardSheet from "@/components/share/ShareCardSheet.vue";
import type { ShareCard } from "@/components/share/shareCard";
import { yearInReview } from "@/lib/api";
import { compact, num, plural } from "@/lib/format";
import type { YearInReview } from "@/lib/types";

const props = defineProps<{ years: number[]; userId?: string; handle: string; canShare?: boolean }>();

const year = ref<number>(pickDefault());
const data = ref<YearInReview | null>(null);
const loading = ref(false);
const shareOpen = ref(false);

function pickDefault() {
  const now = new Date().getFullYear();
  return props.years.includes(now) ? now : props.years[0] ?? now;
}
watch(() => props.years.join(","), () => {
  if (!props.years.includes(year.value)) year.value = pickDefault();
});

watch(
  [year, () => props.userId],
  async () => {
    loading.value = true;
    try {
      data.value = await yearInReview(year.value, props.userId);
    } catch {
      data.value = null;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const headline = computed(() => {
  const d = data.value;
  if (!d || !d.shows) return "No shows logged this year yet.";
  const parts = [plural(d.shows, "show"), plural(d.songs, "song")];
  if (d.new_artists) parts.push(`${plural(d.new_artists, "new artist")}`);
  return parts.map((p) => p + ".").join(" ");
});

const cells = computed(() => {
  const d = data.value;
  if (!d) return [];
  return [
    { v: num(d.shows), k: "shows" },
    { v: num(d.artists), k: "artists" },
    { v: num(d.venues), k: "venues" },
    { v: num(d.miles), k: "miles" },
    { v: num(d.first_hears), k: "first-time hears" },
    { v: d.top_artist ?? "—", k: d.top_artist ? `top artist · ${d.top_artist_n}×` : "top artist" },
  ];
});

const card = computed<ShareCard>(() => {
  const d = data.value;
  const bits: string[] = [];
  if (d?.top_artist) bits.push(`${d.top_artist} ×${d.top_artist_n}`);
  if (d?.venues) bits.push(plural(d.venues, "venue"));
  if (d?.miles) bits.push(`${compact(d.miles)} miles`);
  return {
    kicker: `${year.value} WRAPPED`,
    pre: "My year in live music",
    big: `${d?.shows ?? 0} SHOW${d?.shows === 1 ? "" : "S"}`,
    sub: bits.length ? bits.join(", ") + "." : "Just getting started.",
    stats: [
      { v: num(d?.songs ?? 0), k: "songs" },
      { v: num(d?.venues ?? 0), k: "venues" },
      { v: compact(d?.miles ?? 0), k: "miles" },
    ],
    footer: `${SITE_HOST}/u/${props.handle}`,
  };
});
</script>

<template>
  <section class="yir" aria-label="Year in review" :style="{ '--yir-photo': `url(${PROFILE_BANNER})` }">
    <div class="yir__main">
      <div class="yir__kicker">YEAR IN REVIEW</div>
      <div class="yir__year ss-num">{{ year }}</div>
      <div v-if="years.length > 1" class="yir__chips" role="group" aria-label="Pick a year">
        <button
          v-for="y in years"
          :key="y"
          type="button"
          class="yir__chip"
          :class="{ 'is-on': y === year }"
          :aria-pressed="y === year"
          @click="year = y"
        >
          {{ y }}
        </button>
      </div>
      <div class="yir__headline">{{ headline }}</div>
      <button v-if="canShare && data?.shows" type="button" class="yir__share" @click="shareOpen = true">Share my year</button>
    </div>
    <div class="yir__cells">
      <template v-if="loading && !data">
        <SsSkeleton v-for="i in 6" :key="i" height="62px" radius="14px" />
      </template>
      <div v-for="c in cells" v-else :key="c.k" class="yir__cell">
        <div class="yir__cell-v ss-truncate">{{ c.v }}</div>
        <div class="yir__cell-k">{{ c.k }}</div>
      </div>
    </div>
    <ShareCardSheet v-if="canShare" v-model="shareOpen" :card="card" />
  </section>
</template>

<style scoped>
/* Concert venue photo, darkened (more toward the bottom) so the stats read. */
.yir {
  border-radius: 24px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(10, 9, 12, 0.15) 0%, rgba(10, 9, 12, 0.7) 100%),
    var(--yir-photo) center 65% / cover no-repeat,
    var(--ss-surface-2);
  color: #fff;
  padding: 28px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
  gap: 24px;
  align-items: end;
}
@media (max-width: 480px) {
  .yir {
    padding: 20px;
  }
}
.yir__main {
  min-width: 0;
}
.yir__kicker {
  font-family: var(--ss-font-mono);
  font-size: 11px;
  letter-spacing: var(--ss-tracking-mono);
  font-weight: 700;
  color: var(--ss-accent);
}
.yir__year {
  font-weight: 900;
  font-size: clamp(72px, 16vw, 96px);
  line-height: 0.82;
  letter-spacing: -0.05em;
  margin-top: 8px;
  color: var(--ss-accent);
}
.yir__chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.yir__chip {
  padding: 4px 10px;
  border-radius: var(--ss-radius-pill);
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(10, 9, 12, 0.3);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
}
.yir__chip.is-on {
  background: var(--ss-accent);
  border-color: var(--ss-accent);
  color: var(--ss-on-accent);
}
.yir__headline {
  font-weight: 900;
  font-size: 28px;
  line-height: 1;
  margin-top: 12px;
  text-wrap: balance;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
}
.yir__share {
  margin-top: 18px;
  height: 46px;
  padding: 0 20px;
  border-radius: var(--ss-radius-pill);
  border: 0;
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  font-weight: 900;
  font-size: 15px;
}
.yir__share:hover {
  background: var(--ss-accent-hover);
}
.yir__cells {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  min-width: 0;
}
.yir__cell {
  padding: 12px;
  border-radius: 14px;
  background: rgba(10, 9, 12, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.16);
  min-width: 0;
}
.yir__cell-v {
  font-weight: 900;
  font-size: 28px;
  line-height: 1;
}
.yir__cell-k {
  font-weight: 700;
  font-size: 13px;
  color: var(--ss-text-2);
}
</style>
