<script setup lang="ts">
import { watch } from "vue";
import { SsToastHost } from "@/design-system";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useNotifications } from "@/stores/notifications";
import { useUi } from "@/stores/ui";
import { setlistfm } from "@/lib/api";
import { flushOutbox, setCacheScope } from "@/lib/offline";
import { offlineAutoEnabled, saveForOffline } from "@/lib/offlineSave";

const auth = useAuth();
const log = useLog();
const notifications = useNotifications();
const ui = useUi();

// Per-user cache + fresh log whenever the signed-in user changes.
watch(
  () => auth.userId,
  (id, prev) => {
    setCacheScope(id);
    if (id !== prev) log.reset();
    if (id) syncOutbox();
    if (id) notifications.start(id);
    else notifications.stop();
  },
  { immediate: true },
);

// Shows logged while offline go out when the connection comes back.
watch(() => ui.online, (on) => on && syncOutbox());

// Quietly save shows that aren't on this device yet, once per session, a few
// seconds after the log loads (Settings > App has the switch and a full save).
let autoSavedFor: string | null = null;
watch(
  () => [log.loaded, ui.online, auth.userId] as const,
  ([loaded, online, id]) => {
    if (!loaded || !online || !id || autoSavedFor === id || !offlineAutoEnabled()) return;
    autoSavedFor = id;
    setTimeout(() => {
      if (auth.userId === id && navigator.onLine) saveForOffline(log.entries, { full: false }).catch(() => {});
    }, 5000);
  },
);

async function syncOutbox() {
  if (!auth.userId || !navigator.onLine) return;
  const n = await flushOutbox(async (item) => {
    if (item.kind === "log-setlist") await setlistfm.log(item.setlistfm_id);
  });
  if (n) {
    ui.flash(`Synced ${n} show${n > 1 ? "s" : ""} you logged offline`);
    log.refresh();
  }
}
</script>

<template>
  <RouterView />
  <SsToastHost />
</template>
