<script setup lang="ts">
// Manage notifications: push on this device, plus an in-app / push switch per kind.
import { computed, onMounted, ref } from "vue";
import { SsButton, SsIcon, SsToggle } from "@/design-system";
import { sendTestPush } from "@/lib/api";
import { currentPushSubscription, disablePush, enablePush, pushSupported } from "@/lib/pwa";
import { NOTIFICATION_KINDS, prefOn, type NotificationKind, type NotificationPrefs } from "@/lib/notifications";
import { errorMessage } from "@/lib/supabase";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

const auth = useAuth();
const ui = useUi();

// ---- this device
const canPush = pushSupported() && !!import.meta.env.VITE_VAPID_PUBLIC_KEY;
const needsInstall = computed(() => ui.isIos && !ui.isStandalone);
const pushOn = ref(false);
const pushBusy = ref(false);
const pushDenied = ref(false);

onMounted(async () => {
  if (!canPush) return;
  pushDenied.value = Notification.permission === "denied";
  pushOn.value = !!(await currentPushSubscription().catch(() => null));
});

async function setDevicePush(v: boolean) {
  pushBusy.value = true;
  try {
    if (v) {
      pushOn.value = await enablePush();
      pushDenied.value = Notification.permission === "denied";
      if (pushOn.value) ui.flash("Notifications are on for this device");
      else if (pushDenied.value) ui.error("Notifications are blocked. Turn them on in your browser settings.");
    } else {
      await disablePush();
      pushOn.value = false;
    }
  } catch (e) {
    ui.error(errorMessage(e, "Couldn't change notifications."));
  } finally {
    pushBusy.value = false;
  }
}
const deviceModel = computed({ get: () => pushOn.value, set: (v: boolean) => setDevicePush(v) });

async function test() {
  try {
    const n = await sendTestPush();
    ui.flash(n ? "Sent. Check your notifications." : "No devices registered yet", n ? "accent" : "info");
  } catch (e) {
    ui.error(errorMessage(e));
  }
}

// ---- per kind
const prefs = computed<NotificationPrefs>(() => auth.profile?.notification_prefs ?? {});
const saving = ref(false);

async function setPref(kind: NotificationKind, channel: "inapp" | "push", on: boolean) {
  const next: NotificationPrefs = { ...prefs.value, [kind]: { ...prefs.value[kind], [channel]: on } };
  saving.value = true;
  try {
    await auth.saveProfile({ notification_prefs: next });
  } catch (e) {
    ui.error(errorMessage(e, "Couldn't save that."));
  } finally {
    saving.value = false;
  }
}

function setAll(channel: "inapp" | "push", on: boolean) {
  const next: NotificationPrefs = { ...prefs.value };
  for (const k of NOTIFICATION_KINDS) next[k.kind] = { ...next[k.kind], [channel]: on };
  auth.saveProfile({ notification_prefs: next }).catch((e) => ui.error(errorMessage(e, "Couldn't save that.")));
}
const allPushOff = computed(() => NOTIFICATION_KINDS.every((k) => !prefOn(prefs.value, k.kind, "push")));
</script>

<template>
  <div class="ns">
    <!-- This device -->
    <div class="device">
      <div class="device__text">
        <div class="device__title"><SsIcon name="bell" :size="16" />Push on this device</div>
        <div class="device__body">
          <template v-if="!canPush">This browser can't get push notifications. You'll still see them in the app.</template>
          <template v-else-if="needsInstall">On iPhone, add Stubstash to your Home Screen first, then turn this on from there.</template>
          <template v-else-if="pushDenied">Notifications are blocked for this site. Allow them in your browser settings.</template>
          <template v-else>Alerts on your lock screen, even when Stubstash is closed. Turn it on for each phone or computer.</template>
        </div>
      </div>
      <SsToggle
        v-if="canPush"
        v-model="deviceModel"
        plain
        :disabled="pushBusy || needsInstall"
        :label="pushOn ? 'On' : 'Off'"
      />
    </div>
    <SsButton v-if="pushOn" size="sm" variant="outline" class="ns__test" @click="test">
      <SsIcon name="bell" :size="16" />Send a test
    </SsButton>

    <!-- Per kind -->
    <div class="kinds" role="table" aria-label="Notification types">
      <div class="kinds__head" role="row">
        <span role="columnheader">What</span>
        <span role="columnheader" class="col">In app</span>
        <span role="columnheader" class="col">Push</span>
      </div>
      <div v-for="k in NOTIFICATION_KINDS" :key="k.kind" class="kind" role="row">
        <div class="kind__text" role="cell">
          <div class="kind__label">{{ k.label }}</div>
          <div class="kind__hint">{{ k.hint }}</div>
        </div>
        <div class="col" role="cell">
          <SsToggle
            plain
            :model-value="prefOn(prefs, k.kind, 'inapp')"
            :aria-label="`${k.label} in app`"
            @update:model-value="(v: boolean) => setPref(k.kind, 'inapp', v)"
          />
        </div>
        <div class="col" role="cell">
          <SsToggle
            plain
            :model-value="prefOn(prefs, k.kind, 'push')"
            :aria-label="`${k.label} push`"
            @update:model-value="(v: boolean) => setPref(k.kind, 'push', v)"
          />
        </div>
      </div>
    </div>

    <div class="ns__foot">
      <button type="button" class="link" @click="setAll('push', allPushOff)">
        {{ allPushOff ? "Turn all push back on" : "Turn off all push" }}
      </button>
      <span class="ns__note">Push goes to every device where it's on. Friends' shows only count if they're from the last two weeks.</span>
    </div>
  </div>
</template>

<style scoped>
.ns { display: flex; flex-direction: column; gap: 14px; }
.device { display: flex; align-items: center; gap: 16px; justify-content: space-between; }
.device__title { display: flex; align-items: center; gap: 6px; font-weight: 800; }
.device__body { font-size: 14px; color: var(--ss-text-muted); margin-top: 2px; }
.ns__test { align-self: flex-start; }
.kinds { display: flex; flex-direction: column; border-top: 1px solid var(--ss-line-soft); }
.kinds__head, .kind {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px 64px;
  align-items: center;
  gap: 8px;
}
.kinds__head {
  padding: 10px 0 6px;
  font-family: var(--ss-font-mono);
  font-size: 11px;
  letter-spacing: var(--ss-tracking-mono);
  text-transform: uppercase;
  color: var(--ss-text-faint);
}
.kind { padding: 10px 0; border-top: 1px solid var(--ss-line-soft); }
.kind__label { font-weight: 700; }
.kind__hint { font-size: 13px; color: var(--ss-text-muted); }
.col { display: flex; justify-content: center; text-align: center; }
.ns__foot { display: flex; flex-direction: column; gap: 6px; }
.link { align-self: flex-start; border: 0; background: none; padding: 0; color: var(--ss-accent); font-weight: 700; font-size: 14px; }
.ns__note { font-size: 13px; color: var(--ss-text-faint); }
</style>
