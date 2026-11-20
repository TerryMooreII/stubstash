<script setup lang="ts">
// Friends' activity: the upcoming shows they're going to or interested in,
// then the shows they've been to lately.
import { computed, onMounted, ref } from "vue";
import { SsArt, SsAvatar, SsEmpty, SsSkeleton, SsStars } from "@/design-system";
import DateBlock from "@/components/shows/DateBlock.vue";
import StatusPill from "@/components/upcoming/StatusPill.vue";
import { social, upcoming } from "@/lib/api";
import { rememberEvent } from "@/lib/eventSeed";
import { firstName, mediumDate, placeOf, plural } from "@/lib/format";
import { eventPlace } from "@/lib/upcoming";
import type { CrewMember, FeedItem, PlanItem } from "@/lib/types";

defineProps<{ hasFriends: boolean }>();

const shows = ref<FeedItem[]>([]);
const plans = ref<PlanItem[]>([]);
const loading = ref(true);
const failed = ref(false);

onMounted(async () => {
  const [s, p] = await Promise.allSettled([social.feed(), upcoming.friendsGoing()]);
  if (s.status === "fulfilled") shows.value = s.value;
  if (p.status === "fulfilled") plans.value = p.value;
  failed.value = s.status === "rejected" && p.status === "rejected";
  loading.value = false;
});

/** Friends with a plan for the event (not people who were only invited or can't go). */
const comingUp = computed(() =>
  plans.value
    .map((p) => ({ item: p, crew: p.crew.filter((c) => c.status === "going" || c.status === "interested") }))
    .filter((p) => p.crew.length)
    .slice(0, 6),
);
const who = (f: FeedItem) => firstName(f.display_name, f.handle);
/** "Maya & Dev going · 1 interested" / "Sam interested" */
function planLine(crew: CrewMember[]): string {
  const going = crew.filter((c) => c.status === "going");
  const named = going.length ? going : crew;
  const names = named.slice(0, 2).map((c) => firstName(c.display_name, c.handle));
  const more = named.length - names.length;
  const line = `${names.join(" & ")}${more > 0 ? ` +${more}` : ""} ${going.length ? "going" : "interested"}`;
  const also = going.length ? crew.length - going.length : 0;
  return also ? `${line} · ${also} interested` : line;
}
</script>

<template>
  <div class="feed">
    <div v-if="loading" class="ss-stack"><SsSkeleton v-for="i in 4" :key="i" height="72px" /></div>

    <SsEmpty v-else-if="failed" title="Couldn’t load your friends’ shows" body="Check your connection and try again." />

    <SsEmpty
      v-else-if="!shows.length && !comingUp.length"
      :title="hasFriends ? 'Nothing from your friends yet' : 'Your crew’s shows land here'"
      :body="hasFriends
        ? 'When friends log a show or plan one, you’ll see it here.'
        : 'Add friends to see what they’ve been to and where they’re headed next.'"
    />

    <template v-else>
      <section v-if="comingUp.length" class="feed__sec">
        <h2 class="feed__k">COMING UP</h2>
        <RouterLink
          v-for="p in comingUp"
          :key="p.item.event.seatgeek_id"
          :to="`/app/upcoming/${p.item.event.seatgeek_id}`"
          class="row"
          @click="rememberEvent(p.item)"
        >
          <DateBlock :date="p.item.event.local_date" />
          <div class="row__text">
            <div class="row__who">{{ planLine(p.crew) }}</div>
            <div class="row__title">{{ p.item.event.artist }}</div>
            <div class="row__sub ss-truncate">
              {{ p.item.event.venue_name }}<template v-if="eventPlace(p.item.event)"> · {{ eventPlace(p.item.event) }}</template>
            </div>
          </div>
          <StatusPill v-if="p.item.status" :status="p.item.status" />
          <span v-else class="row__go">You in? →</span>
        </RouterLink>
      </section>

      <section v-if="shows.length" class="feed__sec">
        <h2 class="feed__k">LATELY</h2>
        <RouterLink v-for="f in shows" :key="f.attendance_id" :to="`/u/${f.handle}/shows/${f.attendance_id}`" class="row">
          <div class="row__faces">
            <SsArt class="row__art" shape="circle" :src="f.artist_image" :seed="f.artist_name" />
            <SsAvatar class="row__avatar" :name="f.display_name || f.handle" :path="f.avatar_path" :size="26" ring />
          </div>
          <div class="row__text">
            <div class="row__who">
              <b>{{ who(f) }}</b> saw
            </div>
            <div class="row__title">
              {{ f.artist_name }}<span v-if="f.acts > 1" class="row__more"> +{{ plural(f.acts - 1, "more act") }}</span>
            </div>
            <div class="row__sub ss-truncate">
              {{ mediumDate(f.event_date) }} · {{ f.venue_name }}<template v-if="placeOf(f)"> · {{ placeOf(f) }}</template>
            </div>
          </div>
          <div class="row__end">
            <SsStars v-if="f.rating != null" :value="f.rating" />
            <span v-if="f.was_there" class="row__tag">YOU WERE THERE</span>
          </div>
        </RouterLink>
      </section>
    </template>
  </div>
</template>

<style scoped>
.feed, .feed__sec { display: flex; flex-direction: column; gap: 8px; }
.feed { gap: 22px; }
.feed__k {
  margin: 0;
  font-family: var(--ss-font-mono);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.14em;
  color: var(--ss-text-faint);
}
.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding: 12px 16px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  color: var(--ss-text);
  text-decoration: none;
}
.row:hover { text-decoration: none; color: var(--ss-text); border-color: var(--ss-line-strong); }
.row__faces { position: relative; flex-shrink: 0; }
.row__art { width: 48px; height: 48px; }
.row__avatar { position: absolute; right: -8px; bottom: -6px; }
.row__text { flex: 1 1 200px; min-width: 0; }
.row__who { font-size: 13px; color: var(--ss-text-3); }
.row__who b { color: var(--ss-text-2); }
.row__title { font-weight: 900; font-size: 18px; line-height: 1.15; overflow-wrap: anywhere; }
.row__more { font-weight: 700; font-size: 13px; color: var(--ss-text-muted); }
.row__sub { font-size: 14px; color: var(--ss-text-3); }
.row__end { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.row__tag { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.12em; color: var(--ss-teal); }
.row__go { color: var(--ss-accent); font-weight: 700; white-space: nowrap; }
</style>
