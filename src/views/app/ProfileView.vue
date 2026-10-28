<script setup lang="ts">
import { SITE_HOST } from "@/lib/url";
// Profile: yours at /app/me, anyone's at /u/:handle.
// Shows year in review, badges and friends (or, for someone else, their latest
// shows and the shows you were both at). Private profiles show a friend prompt.
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  SsAvatar, SsBadgeTile, SsButton, SsCard, SsEmpty, SsIcon, SsSkeleton, SsTicketRow, SsToggle,
} from "@/design-system";
import HeadToHead from "@/components/people/HeadToHead.vue";
import YearInReviewCard from "@/components/people/YearInReviewCard.vue";
import NotificationSettings from "@/components/notifications/NotificationSettings.vue";
import { badges as loadBadges, publicProfile, social, userLog } from "@/lib/api";
import { mediumDate, place, plural } from "@/lib/format";
import { errorMessage } from "@/lib/supabase";
import type { Badge, Friend, LogEntry, PublicProfile } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const props = defineProps<{ handle?: string }>();

const auth = useAuth();
const log = useLog();
const ui = useUi();
const router = useRouter();
const route = useRoute();

const isSelf = computed(
  () => !props.handle || (!!auth.profile && props.handle.replace(/^@/, "").toLowerCase() === auth.profile.handle.toLowerCase()),
);

const other = ref<PublicProfile | null>(null);
const otherLog = ref<LogEntry[]>([]);
const shared = ref<{ attendance_id: string; event_date: string; artist_name: string; venue_name: string; city: string | null }[]>([]);
const badgeList = ref<Badge[]>([]);
const friends = ref<Friend[]>([]);
const loading = ref(true);
const notFound = ref(false);
const friendBusy = ref(false);

const entries = computed(() => (isSelf.value ? log.entries : otherLog.value));
const targetId = computed(() => (isSelf.value ? auth.userId ?? undefined : other.value?.id));
const canView = computed(() => isSelf.value || !!other.value?.can_view);

const name = computed(() =>
  isSelf.value ? auth.displayName : other.value?.display_name || other.value?.handle || "",
);
const handle = computed(() => (isSelf.value ? auth.profile?.handle : other.value?.handle) ?? "");
const homeCity = computed(() => (isSelf.value ? auth.profile?.home_city : other.value?.home_city) ?? null);
const avatarPath = computed(() => (isSelf.value ? auth.profile?.avatar_path : other.value?.avatar_path) ?? null);
const showCount = computed(() => (isSelf.value ? log.total : other.value?.show_count ?? otherLog.value.length));

const years = computed(() =>
  [...new Set(entries.value.map((e) => Number(e.event_date.slice(0, 4))))].sort((a, b) => b - a),
);
const earned = computed(() => badgeList.value.filter((b) => b.earned).length);
const maxShows = computed(() => Math.max(1, log.total, ...friends.value.map((f) => f.show_count)));

async function load() {
  loading.value = true;
  notFound.value = false;
  other.value = null;
  otherLog.value = [];
  shared.value = [];
  try {
    if (isSelf.value) {
      if (!auth.signedIn) return;
      await log.load();
      const [b, f] = await Promise.all([loadBadges(), social.friends()]);
      badgeList.value = b;
      friends.value = f;
    } else {
      const p = await publicProfile(props.handle!);
      if (!p) {
        notFound.value = true;
        return;
      }
      other.value = p;
      if (p.can_view) {
        const [l, b, s] = await Promise.all([
          userLog(p.id),
          loadBadges(p.id),
          auth.signedIn ? social.sharedShows(p.id) : Promise.resolve([]),
        ]);
        otherLog.value = l;
        badgeList.value = b;
        shared.value = s;
      }
    }
  } catch (err) {
    ui.error(errorMessage(err));
  } finally {
    loading.value = false;
  }
}
watch(() => [props.handle, auth.userId, auth.profile?.handle], load, { immediate: true });

// "/app/me#notifications": the section renders after loading, so scroll once it's there.
watch(
  () => [route.hash, canView.value] as const,
  async ([hash]) => {
    if (hash !== "#notifications") return;
    await nextTick();
    document.getElementById("notifications")?.scrollIntoView({ behavior: "smooth", block: "start" });
  },
  { immediate: true },
);

// ---- public toggle (self)
const isPublic = computed({
  get: () => !!auth.profile?.is_public,
  set: async (v: boolean) => {
    try {
      await auth.saveProfile({ is_public: v });
      ui.flash(v ? "Public: anyone with your link can see your shows" : "Private: only friends can see your shows", "info", 3600);
    } catch (err) {
      ui.error(errorMessage(err));
    }
  },
});

// ---- friend button (others)
const friendLabel = computed(() => {
  switch (other.value?.friendship) {
    case "friends": return "Friends";
    case "sent": return "Requested";
    case "received": return "Accept request";
    default: return "Add friend";
  }
});
async function friendAction() {
  if (!other.value) return;
  if (!auth.signedIn) {
    router.push({ name: "signup", query: { next: `/add/${other.value.handle}` } });
    return;
  }
  if (other.value.friendship === "friends" || other.value.friendship === "sent") return;
  friendBusy.value = true;
  try {
    const res = await social.request(other.value.handle);
    other.value = { ...other.value, friendship: res };
    ui.flash(res === "friends" ? `You and ${name.value.split(" ")[0]} are now friends` : `Request sent to ${name.value.split(" ")[0]}`);
    if (res === "friends") load();
  } catch (err) {
    ui.error(errorMessage(err));
  } finally {
    friendBusy.value = false;
  }
}

const profileUrl = computed(() => `${SITE_HOST}/u/${handle.value}`);
const latest = computed(() => otherLog.value.slice(0, 6));
</script>

<template>
  <div class="ss-page">
    <!-- Not found -->
    <SsEmpty v-if="notFound" title="No one by that handle" body="Check the spelling, or they may have changed it.">
      <SsButton :to="auth.signedIn ? '/app/friends' : '/'" variant="outline">{{ auth.signedIn ? "Find friends" : "Go home" }}</SsButton>
    </SsEmpty>

    <template v-else>
      <!-- Header -->
      <header class="head">
        <SsAvatar :name="name || handle" :path="avatarPath" :me="isSelf" :size="88" />
        <div class="head__text">
          <template v-if="loading && !name">
            <SsSkeleton height="36px" width="220px" />
            <SsSkeleton height="16px" width="260px" style="margin-top: 8px" />
          </template>
          <template v-else>
            <h1 class="head__name">{{ name || handle }}</h1>
            <div class="head__meta">
              @{{ handle }}<template v-if="homeCity"> · {{ homeCity }}</template>
              <template v-if="isSelf ? auth.profile?.is_public : other?.is_public"> · {{ profileUrl }}</template>
              <template v-if="canView"> · {{ plural(showCount, "show") }}</template>
            </div>
          </template>
        </div>
        <SsToggle v-if="isSelf" v-model="isPublic" on-label="Public profile" off-label="Private" />
        <SsButton
          v-else-if="other"
          :variant="other.friendship === 'friends' || other.friendship === 'sent' ? 'outline' : 'primary'"
          :disabled="other.friendship === 'friends' || other.friendship === 'sent'"
          :loading="friendBusy"
          @click="friendAction"
        >
          <SsIcon v-if="other.friendship === 'friends'" name="check" :size="16" />{{ friendLabel }}
        </SsButton>
      </header>

      <!-- Private profile -->
      <SsEmpty
        v-if="!loading && !canView"
        :title="name ? `${name.split(' ')[0]}'s log is private` : 'This log is private'"
        :body="
          auth.signedIn
            ? 'Add them as a friend. Once they accept, you can see their shows and go head-to-head.'
            : 'Join Stubstash to add them as a friend and compare your shows.'
        "
      >
        <SsButton v-if="!auth.signedIn" :to="{ name: 'signup', query: { next: `/add/${handle}` } }">Start your log, it's free</SsButton>
      </SsEmpty>

      <template v-else-if="canView">
        <YearInReviewCard
          v-if="years.length"
          :years="years"
          :user-id="isSelf ? undefined : targetId"
          :handle="handle"
          :can-share="isSelf"
        />
        <SsEmpty
          v-else-if="!loading"
          :title="isSelf ? 'Your year in review starts with one show' : 'No shows logged yet'"
          :body="isSelf ? 'Log a show and your stats, badges and year in review fill in.' : undefined"
        >
          <SsButton v-if="isSelf" to="/app/log">Log a show</SsButton>
        </SsEmpty>

        <!-- Badges -->
        <SsCard>
          <h2 class="ss-h2 sec-title">
            Badges <span class="sec-sub">{{ earned }} of {{ badgeList.length }} earned</span>
          </h2>
          <div v-if="loading && !badgeList.length" class="badges">
            <SsSkeleton v-for="i in 4" :key="i" height="140px" radius="14px" />
          </div>
          <div v-else class="badges">
            <SsBadgeTile
              v-for="b in badgeList"
              :key="b.key"
              layout="card"
              :name="b.name"
              :description="b.description"
              :color="b.color"
              :earned="b.earned"
              :progress="b.progress"
              :target="b.target"
            />
          </div>
        </SsCard>

        <!-- Self: notifications -->
        <SsCard v-if="isSelf" id="notifications" title="Notifications">
          <template #aside>
            <RouterLink to="/app/notifications" class="link">See all →</RouterLink>
          </template>
          <NotificationSettings />
        </SsCard>

        <!-- Self: friends head-to-head -->
        <SsCard v-if="isSelf" title="Friends & head-to-head">
          <template #aside>
            <RouterLink to="/app/friends" class="link">+ Find friends</RouterLink>
          </template>
          <div v-if="friends.length" class="h2h-list">
            <HeadToHead
              v-for="f in friends"
              :key="f.id"
              :name="f.display_name"
              :handle="f.handle"
              :avatar-path="f.avatar_path"
              :their-shows="f.show_count"
              :my-shows="log.total"
              :shared="f.shared_count"
              :max="maxShows"
            />
          </div>
          <p v-else-if="!loading" class="ss-muted">
            No friends yet. Add the people you go to shows with and see who's been to more.
          </p>
        </SsCard>

        <!-- Others: shows together + latest -->
        <template v-else>
          <SsCard v-if="auth.signedIn" title="Shows you were both at">
            <template #aside>{{ plural(shared.length, "show") }}</template>
            <div v-if="shared.length" class="rows">
              <RouterLink v-for="s in shared" :key="s.attendance_id" :to="`/app/shows/${s.attendance_id}`" class="row">
                <div class="row__main">
                  <div class="row__title">{{ s.artist_name }}</div>
                  <div class="row__sub ss-truncate">{{ s.venue_name }}<template v-if="s.city"> · {{ s.city }}</template></div>
                </div>
                <span class="row__date">{{ mediumDate(s.event_date) }}</span>
              </RouterLink>
            </div>
            <p v-else class="ss-muted">None yet. Next time, go together.</p>
          </SsCard>

          <div class="ss-between">
            <h2 class="ss-h2">Latest shows</h2>
          </div>
          <div v-if="latest.length" class="ss-grid" style="--ss-grid-min: 300px">
            <SsTicketRow
              v-for="e in latest"
              :key="e.attendance_id"
              :to="`/u/${handle}/shows/${e.attendance_id}`"
              :date="e.event_date"
              :artist="e.artist_name"
              :venue="e.venue_name"
              :place="place(e.city, e.state_code, e.country_code)"
              :number="e.show_number"
              :source="e.source"
              :songs="e.song_count"
              :rating="e.rating"
            />
          </div>
          <SsButton v-if="otherLog.length" :to="`/u/${handle}/map`" variant="outline" style="align-self: flex-start">
            <SsIcon name="pin" :size="16" />See their map
          </SsButton>
        </template>
      </template>

      <!-- Self actions -->
      <div v-if="isSelf" class="actions">
        <SsButton v-if="!ui.isStandalone" variant="outline" size="sm" @click="ui.installSheetOpen = true">
          <SsIcon name="download" :size="16" />Install the app
        </SsButton>
        <SsButton variant="outline" size="sm" to="/app/settings"><SsIcon name="settings" :size="16" />Settings</SsButton>
        <SsButton variant="outline" size="sm" to="/app/welcome"><SsIcon name="refresh" :size="16" />Re-import from setlist.fm</SsButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  gap: 18px;
  align-items: center;
  flex-wrap: wrap;
}
.head__text {
  flex: 1 1 200px;
  min-width: 0;
}
.head__name {
  font-weight: 900;
  font-size: 36px;
  line-height: 1;
  overflow-wrap: anywhere;
}
.head__meta {
  color: var(--ss-text-muted);
  font-size: 16px;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.sec-title {
  margin-bottom: 14px;
}
.sec-sub {
  color: var(--ss-text-muted);
  font-weight: 600;
  font-size: 15px;
}
.badges {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
  gap: 10px;
}
.link {
  font-weight: 700;
}
.h2h-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.rows {
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--ss-line-soft);
  color: var(--ss-text);
  text-decoration: none;
}
.row:hover {
  text-decoration: none;
  color: var(--ss-accent);
}
.row__main {
  flex: 1;
  min-width: 0;
}
.row__title {
  font-weight: 700;
}
.row__sub {
  font-size: 13px;
  color: var(--ss-text-muted);
}
.row__date {
  font-size: 13px;
  color: var(--ss-text-muted);
  white-space: nowrap;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
