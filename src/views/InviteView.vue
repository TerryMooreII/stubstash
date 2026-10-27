<script setup lang="ts">
// /invite/:token: someone tagged you at a show before you joined.
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { SsButton, SsSpinner } from "@/design-system";
import AuthFrame from "./auth/AuthFrame.vue";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";
import { social } from "@/lib/api";
import { errorMessage } from "@/lib/supabase";
import { dateParts, mediumDate } from "@/lib/format";

const props = defineProps<{ token: string }>();
const auth = useAuth();
const log = useLog();
const ui = useUi();
const router = useRouter();

type Invite = Awaited<ReturnType<typeof social.peekInvite>> | null;
const loading = ref(true);
const invite = ref<Invite>(null);
const busy = ref(false);
const next = computed(() => `/invite/${encodeURIComponent(props.token)}`);
const d = computed(() => (invite.value ? dateParts(invite.value.event_date) : null));
const inviter = computed(() => invite.value?.inviter_name || `@${invite.value?.inviter_handle}`);

onMounted(async () => {
  await auth.init();
  try {
    invite.value = await social.peekInvite(props.token);
  } catch {
    invite.value = null;
  } finally {
    loading.value = false;
  }
});

async function claim() {
  busy.value = true;
  try {
    const attendanceId = await social.claimInvite(props.token);
    log.refresh();
    ui.flash(`Added to your log. You and ${inviter.value} are now friends.`);
    router.replace(`/app/shows/${attendanceId}`);
  } catch (e) {
    ui.error(errorMessage(e));
    busy.value = false;
  }
}
</script>

<template>
  <AuthFrame v-if="loading" title="Checking your ticket…"><SsSpinner :size="28" /></AuthFrame>

  <AuthFrame
    v-else-if="!invite"
    kicker="HMM"
    title="That invite doesn't exist."
    lede="The link may be wrong, or the show was removed."
  >
    <SsButton to="/" variant="outline" size="lg" block>What's Stubstash?</SsButton>
  </AuthFrame>

  <AuthFrame v-else kicker="YOU WERE THERE" :title="`${inviter} says you were at this show.`">
    <div class="stub">
      <div class="stub__date">
        <div class="stub__mon">{{ d!.mon }}</div>
        <div class="stub__day">{{ d!.day }}</div>
        <div class="stub__yr">{{ d!.yr }}</div>
      </div>
      <div class="stub__body">
        <div class="stub__artist">{{ invite.artist }}</div>
        <div class="stub__venue">{{ invite.venue }}<template v-if="invite.city"> · {{ invite.city }}</template></div>
        <div class="stub__when">{{ mediumDate(invite.event_date) }}</div>
      </div>
    </div>

    <template v-if="invite.claimed">
      <p class="note">This invite has already been used.</p>
      <SsButton :to="auth.signedIn ? '/app' : '/signup'" variant="outline" size="lg" block>
        {{ auth.signedIn ? "Open my dashboard" : "Start your own log" }}
      </SsButton>
    </template>
    <template v-else-if="auth.signedIn">
      <SsButton size="lg" block :loading="busy" @click="claim">Add it to my log</SsButton>
      <SsButton to="/app" variant="ghost">Not me</SsButton>
    </template>
    <template v-else>
      <p class="note">Join Stubstash and this show lands in your log, with the setlist. You and {{ inviter }} become friends so you can compare nights.</p>
      <SsButton :to="{ name: 'signup', query: { next } }" size="lg" block>Join and add this show</SsButton>
      <SsButton :to="{ name: 'login', query: { next } }" variant="ghost">I already have an account</SsButton>
    </template>
  </AuthFrame>
</template>

<style scoped>
.stub {
  display: flex;
  border-radius: var(--ss-radius-md);
  overflow: hidden;
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
}
.stub__date {
  width: 84px;
  flex-shrink: 0;
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 0;
  border-right: 2px dashed var(--ss-bg);
}
.stub__mon, .stub__yr { font-weight: 700; font-size: 12px; letter-spacing: 0.1em; }
.stub__day { font-weight: 900; font-size: 32px; line-height: 0.95; }
.stub__body { padding: 14px 16px; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.stub__artist { font-weight: 900; font-size: 22px; line-height: 1.1; }
.stub__venue { color: var(--ss-text-3); font-size: 15px; }
.stub__when { color: var(--ss-text-muted); font-size: 13px; }
.note { color: var(--ss-text-3); font-size: 16px; line-height: 1.45; }
</style>
