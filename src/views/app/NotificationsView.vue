<script setup lang="ts">
// Notification feed: new (unread) first, then earlier. Tapping one marks it
// read and opens what it's about.
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { SsAvatar, SsButton, SsEmpty, SsIcon, SsPageHeader, SsSkeleton, type IconName } from "@/design-system";
import type { AppNotification, NotificationKind } from "@/lib/notifications";
import { timeAgo } from "@/lib/format";
import { useNotifications } from "@/stores/notifications";

const store = useNotifications();
const router = useRouter();

onMounted(() => store.load());

const fresh = computed(() => store.items.filter((n) => !n.read_at));
const earlier = computed(() => store.items.filter((n) => n.read_at));

const ICONS: Record<NotificationKind, IconName> = {
  friend_request: "users", friend_accepted: "users", friend_show: "ticket", same_show: "ticket",
  tagged: "users", invite_claimed: "users", badge_earned: "star", rate_show: "star",
};

async function open(n: AppNotification) {
  if (!n.read_at) store.markRead([n.id]);
  if (n.url?.startsWith("/")) router.push(n.url);
}
</script>

<template>
  <div class="ss-page">
    <SsPageHeader kicker="Notifications" title="What's new">
      <SsButton v-if="store.unread" size="sm" variant="outline" @click="store.markRead()">
          <SsIcon name="check" :size="16" />Mark all read
        </SsButton>
        <SsButton size="sm" variant="ghost" to="/app/settings?section=notifications" aria-label="Notification settings">
          <SsIcon name="settings" :size="16" />Settings
        </SsButton>
    </SsPageHeader>

    <div v-if="!store.loaded && store.loading" class="list">
      <SsSkeleton v-for="i in 5" :key="i" height="72px" radius="var(--ss-radius-md)" />
    </div>

    <SsEmpty
      v-else-if="store.loaded && !store.items.length"
      title="Nothing yet"
      body="Friend requests, friends' new shows, badges and morning-after nudges land here."
    >
      <SsButton size="sm" variant="outline" to="/app/friends">Find friends</SsButton>
    </SsEmpty>

    <template v-else>
      <section v-if="fresh.length" class="group">
        <h2 class="group__title">New</h2>
        <ul class="list">
          <li v-for="n in fresh" :key="n.id">
            <button type="button" class="note is-unread" @click="open(n)">
              <SsAvatar v-if="n.actor_handle" :name="n.actor_name || n.actor_handle" :path="n.actor_avatar" :size="40" />
              <span v-else class="note__icon"><SsIcon :name="ICONS[n.kind]" :size="20" /></span>
              <span class="note__text">
                <span class="note__title">{{ n.title }}</span>
                <span v-if="n.body" class="note__body">{{ n.body }}</span>
              </span>
              <span class="note__when">{{ timeAgo(n.updated_at) }}</span>
              <span class="note__dot" aria-label="Unread" />
            </button>
          </li>
        </ul>
      </section>

      <section v-if="earlier.length" class="group">
        <h2 class="group__title">Earlier</h2>
        <ul class="list">
          <li v-for="n in earlier" :key="n.id" class="row">
            <button type="button" class="note" @click="open(n)">
              <SsAvatar v-if="n.actor_handle" :name="n.actor_name || n.actor_handle" :path="n.actor_avatar" :size="40" />
              <span v-else class="note__icon"><SsIcon :name="ICONS[n.kind]" :size="20" /></span>
              <span class="note__text">
                <span class="note__title">{{ n.title }}</span>
                <span v-if="n.body" class="note__body">{{ n.body }}</span>
              </span>
              <span class="note__when">{{ timeAgo(n.updated_at) }}</span>
            </button>
            <button type="button" class="row__remove" aria-label="Remove" @click="store.remove(n.id)">
              <SsIcon name="close" :size="14" />
            </button>
          </li>
        </ul>
      </section>

      <SsButton v-if="store.hasMore" variant="outline" class="more" @click="store.loadMore()">Load more</SsButton>
    </template>
  </div>
</template>

<style scoped>
.group { display: flex; flex-direction: column; gap: 8px; }
.group__title {
  margin: 0;
  font-family: var(--ss-font-mono);
  font-size: 11px;
  letter-spacing: var(--ss-tracking-mono);
  text-transform: uppercase;
  color: var(--ss-text-faint);
}
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row { position: relative; }
.note {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--ss-radius-md);
  border: 1px solid var(--ss-line);
  background: var(--ss-surface-1);
  color: var(--ss-text);
  text-align: left;
  font: inherit;
}
.note:hover { border-color: var(--ss-line-strong); }
.note.is-unread { background: var(--ss-surface-2); border-color: var(--ss-line-strong); }
.note__icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--ss-accent-soft);
  color: var(--ss-accent);
}
.note__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.note__title { font-weight: 700; line-height: 1.25; }
.note.is-unread .note__title { font-weight: 900; }
.note__body { font-size: 14px; color: var(--ss-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note__when { flex-shrink: 0; font-size: 12px; color: var(--ss-text-faint); }
.row .note__when { margin-right: 22px; }
.note__dot { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: var(--ss-accent); }
.row__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ss-text-faint);
}
.row__remove:hover { color: var(--ss-text); background: var(--ss-surface-2); }
.more { align-self: center; }
</style>
