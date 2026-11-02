<script setup lang="ts">
// Your profile's shortcuts: Badges, Friends, Notifications and Settings as
// cards with a quick preview, each opening its full page.
import { computed, onMounted, ref, shallowRef } from "vue";
import { SsAvatar, SsBadgeTile, SsIcon, SsSkeleton, type IconName } from "@/design-system";
import { badges as loadBadges, social } from "@/lib/api";
import { badgeNumbers } from "@/lib/badgeArt";
import { plural, timeAgo } from "@/lib/format";
import { notificationsApi, type AppNotification } from "@/lib/notifications";
import type { Badge, Friend } from "@/lib/types";
import { useNotifications } from "@/stores/notifications";

const notifications = useNotifications();

const badges = shallowRef<Badge[]>([]);
const friends = shallowRef<Friend[]>([]);
const requests = ref(0);
const latest = shallowRef<AppNotification | null>(null);
const loading = ref(true);

onMounted(async () => {
  const [b, f, i, n] = await Promise.allSettled([
    loadBadges(), social.friends(), social.incoming(), notificationsApi.list(1),
  ]);
  if (b.status === "fulfilled") badges.value = b.value;
  if (f.status === "fulfilled") friends.value = f.value;
  if (i.status === "fulfilled") requests.value = i.value.length;
  if (n.status === "fulfilled") latest.value = n.value[0] ?? null;
  loading.value = false;
});

const earned = computed(() => badges.value.filter((b) => b.earned));
const badgeNo = computed(() => badgeNumbers(badges.value));
/** The hardest badges you've earned (latest in the list), else the first few to chase. */
const badgePreview = computed(() =>
  earned.value.length ? [...earned.value].sort((a, b) => b.sort_order - a.sort_order).slice(0, 6) : badges.value.slice(0, 6));

const SETTINGS: { key: string; label: string; icon: IconName }[] = [
  { key: "profile", label: "Profile & home", icon: "user" },
  { key: "notifications", label: "Notification settings", icon: "bell" },
  { key: "privacy", label: "Privacy", icon: "lock" },
  { key: "setlistfm", label: "setlist.fm import", icon: "refresh" },
  { key: "app", label: "App & offline", icon: "download" },
  { key: "account", label: "Account", icon: "logout" },
];
</script>

<template>
  <div class="hub">
    <!-- Badges -->
    <RouterLink to="/app/me/badges" class="card">
      <div class="card__head">
        <SsIcon name="star" :size="20" />
        <span class="card__title">Badges</span>
        <span class="card__go">→</span>
      </div>
      <SsSkeleton v-if="loading" height="70px" />
      <template v-else>
        <div class="card__big">{{ earned.length }} <span>of {{ badges.length }} earned</span></div>
        <div class="badges">
          <SsBadgeTile
            v-for="b in badgePreview"
            :key="b.key"
            :badge-key="b.key"
            :index="badgeNo.get(b.key) ?? 0"
            :name="b.name"
            :color="b.color"
            :earned="b.earned"
            :target="b.target"
          />
        </div>
      </template>
    </RouterLink>

    <!-- Friends -->
    <RouterLink to="/app/friends" class="card">
      <div class="card__head">
        <SsIcon name="users" :size="20" />
        <span class="card__title">Friends</span>
        <span v-if="requests" class="pill">{{ plural(requests, "request") }}</span>
        <span class="card__go">→</span>
      </div>
      <SsSkeleton v-if="loading" height="70px" />
      <template v-else>
        <div class="card__big">{{ friends.length }} <span>{{ friends.length === 1 ? "friend" : "friends" }}</span></div>
        <div v-if="friends.length" class="faces">
          <SsAvatar
            v-for="f in friends.slice(0, 6)"
            :key="f.id"
            :name="f.display_name || f.handle"
            :path="f.avatar_path"
            :size="34"
            class="faces__one"
          />
          <span v-if="friends.length > 6" class="faces__more">+{{ friends.length - 6 }}</span>
        </div>
        <div class="card__sub">{{ friends.length ? "Head-to-head, requests and your invite link" : "Add the people you go to shows with" }}</div>
      </template>
    </RouterLink>

    <!-- Notifications -->
    <RouterLink to="/app/notifications" class="card">
      <div class="card__head">
        <SsIcon name="bell" :size="20" />
        <span class="card__title">Notifications</span>
        <span v-if="notifications.unread" class="pill">{{ notifications.unread > 99 ? "99+" : notifications.unread }} new</span>
        <span class="card__go">→</span>
      </div>
      <SsSkeleton v-if="loading" height="70px" />
      <div v-else-if="latest" class="latest" :class="{ 'is-unread': !latest.read_at }">
        <div class="latest__title">{{ latest.title }}</div>
        <div class="card__sub">{{ timeAgo(latest.updated_at) }}</div>
      </div>
      <div v-else class="card__sub">You’re all caught up.</div>
    </RouterLink>

    <!-- Settings -->
    <div class="card card--list">
      <RouterLink to="/app/settings" class="card__head card__head--link">
        <SsIcon name="settings" :size="20" />
        <span class="card__title">Settings</span>
        <span class="card__go">→</span>
      </RouterLink>
      <RouterLink
        v-for="s in SETTINGS"
        :key="s.key"
        :to="{ path: '/app/settings', query: s.key === 'profile' ? {} : { section: s.key } }"
        class="setting"
      >
        <SsIcon :name="s.icon" :size="16" />{{ s.label }}
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.hub {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: 14px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  border-radius: var(--ss-radius-lg);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line-soft);
  color: var(--ss-text);
  text-decoration: none;
  min-width: 0;
}
a.card:hover { text-decoration: none; color: var(--ss-text); border-color: var(--ss-line-strong); }
.card__head { display: flex; align-items: center; gap: 10px; color: var(--ss-accent); text-decoration: none; }
.card__head--link:hover { text-decoration: none; }
.card__title { font-weight: 900; font-size: 20px; color: var(--ss-text); flex: 1; }
.card__go { color: var(--ss-accent); font-weight: 900; }
.card__big { font-weight: 900; font-size: 32px; line-height: 1; }
.card__big span { font-size: 15px; font-weight: 600; color: var(--ss-text-muted); }
.card__sub { font-size: 13px; color: var(--ss-text-muted); }
.pill {
  padding: 2px 8px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  font-size: 12px;
  font-weight: 900;
}
/* Scrolls sideways like the dashboard strip; tiles are 140px wide. */
.badges { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 6px; margin: 0 -4px; }
.faces { display: flex; align-items: center; }
.faces__one { margin-right: -8px; border: 2px solid var(--ss-surface-1); border-radius: 50%; }
.faces__more { margin-left: 16px; font-size: 13px; font-weight: 700; color: var(--ss-text-muted); }
.latest { padding-left: 10px; border-left: 3px solid var(--ss-line); }
.latest.is-unread { border-left-color: var(--ss-accent); }
.latest__title { font-weight: 700; line-height: 1.3; }
.card--list { gap: 2px; }
.card--list .card__head { margin-bottom: 8px; }
.setting {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--ss-line-soft);
  color: var(--ss-text-2);
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
}
.setting:hover { color: var(--ss-accent); text-decoration: none; }
</style>
