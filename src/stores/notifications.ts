// Bell count + notification list, kept fresh with Supabase Realtime (plus a
// slow poll and a refresh when the app comes back to the foreground).
import { defineStore } from "pinia";
import { ref } from "vue";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { notificationsApi, type AppNotification } from "@/lib/notifications";

const PAGE = 30;

export const useNotifications = defineStore("notifications", () => {
  const unread = ref(0);
  const items = ref<AppNotification[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  const hasMore = ref(false);

  let channel: RealtimeChannel | null = null;
  let poll: ReturnType<typeof setInterval> | undefined;
  let userId: string | null = null;

  function setBadge(n: number) {
    // Installed PWA icon badge, where supported.
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (n > 0) nav.setAppBadge?.(n).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }

  async function refreshCount() {
    if (!userId) return;
    unread.value = await notificationsApi.unread().catch(() => unread.value);
    setBadge(unread.value);
  }

  async function load() {
    if (!userId) return;
    loading.value = true;
    try {
      const rows = await notificationsApi.list(PAGE);
      items.value = rows;
      hasMore.value = rows.length === PAGE;
      loaded.value = true;
    } finally {
      loading.value = false;
    }
    await refreshCount();
  }

  async function loadMore() {
    const last = items.value[items.value.length - 1];
    if (!last || !hasMore.value) return;
    const rows = await notificationsApi.list(PAGE, last.updated_at);
    items.value = [...items.value, ...rows];
    hasMore.value = rows.length === PAGE;
  }

  async function markRead(ids?: string[]) {
    const now = new Date().toISOString();
    items.value = items.value.map((n) => (!ids || ids.includes(n.id)) && !n.read_at ? { ...n, read_at: now } : n);
    unread.value = ids ? Math.max(0, unread.value - ids.length) : 0;
    setBadge(unread.value);
    await notificationsApi.markRead(ids).catch(() => {});
    await refreshCount();
  }

  async function remove(id: string) {
    const was = items.value.find((n) => n.id === id);
    items.value = items.value.filter((n) => n.id !== id);
    if (was && !was.read_at) unread.value = Math.max(0, unread.value - 1);
    await notificationsApi.remove(id).catch(() => {});
    await refreshCount();
  }

  function onVisible() {
    if (document.visibilityState === "visible") {
      refreshCount();
      if (loaded.value) load();
    }
  }

  function start(id: string) {
    if (userId === id) return;
    stop();
    userId = id;
    refreshCount();
    channel = supabase
      .channel(`notifications:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${id}` }, () => {
        refreshCount();
        if (loaded.value) load();
      })
      .subscribe();
    poll = setInterval(refreshCount, 2 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
  }

  function stop() {
    if (channel) supabase.removeChannel(channel);
    channel = null;
    clearInterval(poll);
    document.removeEventListener("visibilitychange", onVisible);
    userId = null;
    unread.value = 0;
    items.value = [];
    loaded.value = false;
    setBadge(0);
  }

  return { unread, items, loaded, loading, hasMore, refreshCount, load, loadMore, markRead, remove, start, stop };
});
