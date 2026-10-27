<script setup lang="ts">
import { watch } from "vue";
import { SsToastHost } from "@/design-system";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";
import { setlistfm } from "@/lib/api";
import { flushOutbox, setCacheScope } from "@/lib/offline";

const auth = useAuth();
const log = useLog();
const ui = useUi();

// Per-user cache + fresh log whenever the signed-in user changes.
watch(
  () => auth.userId,
  (id, prev) => {
    setCacheScope(id);
    if (id !== prev) log.reset();
    if (id) syncOutbox();
  },
  { immediate: true },
);

// Shows logged while offline go out when the connection comes back.
watch(() => ui.online, (on) => on && syncOutbox());

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
