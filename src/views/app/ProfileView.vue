<script setup lang="ts">
import { SITE_HOST } from "@/lib/url";
// Profile: yours at /app/me, anyone's at /u/:handle.
// Yours: year in review, then cards for Badges, Friends, Notifications and
// Settings (each opens its own page). Someone else's: year in review, badges,
// the shows you were both at and their latest. Private profiles show a friend prompt.
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  SsAvatar, SsButton, SsCard, SsEmpty, SsIcon, SsSkeleton, SsTicketRow, SsToggle,
} from "@/design-system";
import BadgeGroups from "@/components/people/BadgeGroups.vue";
import ProfileHub from "@/components/people/ProfileHub.vue";
import YearInReviewCard from "@/components/people/YearInReviewCard.vue";
import { badges as loadBadges, publicProfile, social, userLog } from "@/lib/api";
import { firstName, mediumDate, plural } from "@/lib/format";
import { entryTicketProps } from "@/lib/shows";
import ShowListRow from "@/components/shows/ShowListRow.vue";
import { useAction } from "@/composables/useAction";
import { useFriendRequest } from "@/composables/useFriendRequest";
import { profileBanner } from "@/lib/heroImage";
import { errorMessage } from "@/lib/supabase";
import type { Badge, LogEntry, PublicProfile } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const props = defineProps<{ handle?: string }>();

const auth = useAuth();
const log = useLog();
const ui = useUi();
const router = useRouter();

const isSelf = computed(
  () => !props.handle || (!!auth.profile && props.handle.replace(/^@/, "").toLowerCase() === auth.profile.handle.toLowerCase()),
);

const other = ref<PublicProfile | null>(null);
const otherLog = ref<LogEntry[]>([]);
const shared = ref<{ attendance_id: string; event_date: string; artist_name: string; venue_name: string; city: string | null }[]>([]);
const badgeList = ref<Badge[]>([]);
const loading = ref(true);
const notFound = ref(false);

const entries = computed(() => (isSelf.value ? log.entries : otherLog.value));
const targetId = computed(() => (isSelf.value ? auth.userId ?? undefined : other.value?.id));
const canView = computed(() => isSelf.value || !!other.value?.can_view);

const name = computed(() =>
  isSelf.value ? auth.displayName : other.value?.display_name || other.value?.handle || "",
);
const handle = computed(() => (isSelf.value ? auth.profile?.handle : other.value?.handle) ?? "");
const homeCity = computed(() => (isSelf.value ? auth.profile?.home_city : other.value?.home_city) ?? null);
const avatarPath = computed(() => (isSelf.value ? auth.profile?.avatar_path : other.value?.avatar_path) ?? null);
// Each person gets their own header photo: their pick, else one chosen from their id.
const headerPhoto = computed(() =>
  isSelf.value
    ? profileBanner(auth.userId ?? handle.value, auth.profile?.header_photo)
    : profileBanner(other.value?.id ?? handle.value, other.value?.header_photo),
);
const showCount = computed(() => (isSelf.value ? log.total : other.value?.show_count ?? otherLog.value.length));

const years = computed(() =>
  [...new Set(entries.value.map((e) => Number(e.event_date.slice(0, 4))))].sort((a, b) => b - a),
);
const earned = computed(() => badgeList.value.filter((b) => b.earned).length);

async function load() {
  loading.value = true;
  notFound.value = false;
  other.value = null;
  otherLog.value = [];
  shared.value = [];
  try {
    if (isSelf.value) {
      if (!auth.signedIn) return;
      await log.load(); // badges, friends etc. load in ProfileHub
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


// ---- public toggle (self)
const { run: setPublic } = useAction(async (v: boolean) => {
  await auth.saveProfile({ is_public: v });
  ui.flash(v ? "Public: anyone with your link can see your shows" : "Private: only friends can see your shows", "info", 3600);
});
const isPublic = computed({
  get: () => !!auth.profile?.is_public,
  set: (v: boolean) => void setPublic(v),
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
const { request, busy: requesting } = useFriendRequest({
  onDone: (_handle, res) => {
    if (other.value) other.value = { ...other.value, friendship: res };
    if (res === "friends") load();
  },
});
const friendBusy = computed(() => !!other.value && !!requesting.value[other.value.handle]);
async function friendAction() {
  if (!other.value) return;
  if (!auth.signedIn) {
    router.push({ name: "signup", query: { next: `/add/${other.value.handle}` } });
    return;
  }
  if (other.value.friendship === "friends" || other.value.friendship === "sent") return;
  await request(other.value.handle, firstName(name.value));
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
        <div v-if="isSelf" class="head__tools">
          <SsToggle v-model="isPublic" on-label="Public profile" off-label="Private" />
        </div>
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
        :title="name ? `${firstName(name)}'s log is private` : 'This log is private'"
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
          :photo="headerPhoto"
        />
        <SsEmpty
          v-else-if="!loading"
          :title="isSelf ? 'Your year in review starts with one show' : 'No shows logged yet'"
          :body="isSelf ? 'Log a show and your stats, badges and year in review fill in.' : undefined"
        >
          <SsButton v-if="isSelf" to="/app/log">Log a show</SsButton>
        </SsEmpty>

        <!-- Yours: shortcuts to badges, friends, notifications and settings -->
        <ProfileHub v-if="isSelf" />

        <!-- Theirs: badges -->
        <SsCard v-else>
          <h2 class="ss-h2 sec-title">
            Badges <span class="sec-sub">{{ earned }} of {{ badgeList.length }} earned</span>
          </h2>
          <BadgeGroups :badges="badgeList" :loading="loading" />
        </SsCard>

        <!-- Others: shows together + latest -->
        <template v-if="!isSelf">
          <SsCard v-if="auth.signedIn" title="Shows you were both at">
            <template #aside>{{ plural(shared.length, "show") }}</template>
            <div v-if="shared.length" class="rows">
              <ShowListRow v-for="s in shared" :key="s.attendance_id" :to="`/app/shows/${s.attendance_id}`" truncate>
                {{ s.artist_name }}
                <template #sub>{{ s.venue_name }}<template v-if="s.city"> · {{ s.city }}</template></template>
                <template #end><span class="row__date">{{ mediumDate(s.event_date) }}</span></template>
              </ShowListRow>
            </div>
            <p v-else class="ss-muted">None yet. Next time, go together.</p>
          </SsCard>

          <div class="ss-between">
            <h2 class="ss-h2">Latest shows</h2>
          </div>
          <div v-if="latest.length" class="ss-grid" style="--ss-grid-min: 300px">
            <SsTicketRow v-for="e in latest" :key="e.attendance_id" v-bind="entryTicketProps(e, `/u/${handle}/shows`)" />
          </div>
          <SsButton v-if="otherLog.length" :to="`/u/${handle}/map`" variant="outline" style="align-self: flex-start">
            <SsIcon name="pin" :size="16" />See their map
          </SsButton>
        </template>
      </template>

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
.head__tools {
  display: flex;
  align-items: center;
  gap: 8px;
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
.rows {
  display: flex;
  flex-direction: column;
}
.row__date {
  font-size: 13px;
  color: var(--ss-text-muted);
  white-space: nowrap;
}
</style>
