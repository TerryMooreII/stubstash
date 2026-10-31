<script setup lang="ts">
import { appUrl } from "@/lib/url";
// Find and manage friends: incoming requests, search, people who were at your
// shows, a scannable QR code, an invite link, and your current friends.
import { computed, onMounted, ref } from "vue";
import { SsAvatar, SsBackLink, SsButton, SsCard, SsInput, SsPageHeader, SsSkeleton } from "@/design-system";
import PersonRow from "@/components/people/PersonRow.vue";
import QrCode from "@/components/people/QrCode.vue";
import { social } from "@/lib/api";
import { firstName, plural } from "@/lib/format";
import { errorMessage } from "@/lib/supabase";
import type { Friend, FriendshipState } from "@/lib/types";
import { useAction, useKeyedAction } from "@/composables/useAction";
import { useDebouncedSearch } from "@/composables/useDebouncedSearch";
import { useFriendRequest } from "@/composables/useFriendRequest";
import { useShareLink } from "@/composables/useShareLink";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

type Incoming = Awaited<ReturnType<typeof social.incoming>>[number];
type Suggested = Awaited<ReturnType<typeof social.suggested>>[number];

const auth = useAuth();
const ui = useUi();

const incoming = ref<Incoming[]>([]);
const suggested = ref<Suggested[]>([]);
const friends = ref<Friend[]>([]);
const loading = ref(true);
/** Local friendship overrides after taps, keyed by handle. */
const states = ref<Record<string, FriendshipState>>({});

const q = ref("");

const inviteUrl = computed(() => appUrl(`/add/${auth.profile?.handle ?? ""}`));
const inviteDisplay = computed(() => inviteUrl.value.replace(/^https?:\/\//, ""));

async function load() {
  loading.value = true;
  try {
    const [i, s, f] = await Promise.all([social.incoming(), social.suggested(), social.friends()]);
    incoming.value = i;
    suggested.value = s;
    friends.value = f;
  } catch (err) {
    ui.error(errorMessage(err));
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ---- search (debounced)
const { results, searching } = useDebouncedSearch(
  q,
  async (term) => (term.replace(/^@/, "").length < 2 ? [] : social.search(term)),
  { onError: (err) => ui.error(errorMessage(err)) },
);

const stateOf = (p: { handle: string; friendship?: FriendshipState }) => states.value[p.handle] ?? p.friendship ?? null;

async function refreshFriends() {
  friends.value = await social.friends();
}

const { request, busy: requesting } = useFriendRequest({
  onDone: async (handle, res) => {
    states.value[handle] = res;
    if (res === "friends") {
      await refreshFriends();
      incoming.value = incoming.value.filter((i) => i.handle !== handle);
    }
  },
});
const add = (p: { handle: string; display_name: string }) => request(p.handle, firstName(p.display_name, p.handle));

const { run: runRespond, busy: responding } = useKeyedAction(async (handle: string, r: Incoming, accept: boolean) => {
  await social.respond(r.requester_id, accept);
  incoming.value = incoming.value.filter((i) => i.requester_id !== r.requester_id);
  if (accept) {
    states.value[handle] = "friends";
    ui.flash(`You and ${firstName(r.display_name, r.handle)} are now friends`);
    await refreshFriends();
  }
});
const respond = (r: Incoming, accept: boolean) => runRespond(r.handle, r, accept);
/** In-flight taps, by handle. */
const busy = computed(() => ({ ...requesting.value, ...responding.value }));

const { run: remove } = useAction(async (f: Friend) => {
  if (!confirm(`Remove ${f.display_name || "@" + f.handle} from your friends?`)) return;
  await social.remove(f.id);
  friends.value = friends.value.filter((x) => x.id !== f.id);
  states.value[f.handle] = null;
  ui.flash("Removed", "info");
});

const { canShare, copy, share } = useShareLink();
const copyInvite = () => copy(inviteUrl.value, "Invite link copied");
const shareInvite = () =>
  share({
    title: "Add me on Stubstash",
    text: `I'm logging my concerts on Stubstash. Add me so we can compare shows.`,
    url: inviteUrl.value,
  });
</script>

<template>
  <div class="ss-page">
    <SsBackLink to="/app/me" label="Profile" />
    <SsPageHeader kicker="Find your people" title="Who's in your crew?" />

    <!-- Incoming requests -->
    <div v-for="r in incoming" :key="r.requester_id" class="request">
      <SsAvatar :name="r.display_name || r.handle" :path="r.avatar_path" :size="44" />
      <div class="request__text">
        <div class="request__title">{{ r.display_name || "@" + r.handle }} wants to add you</div>
        <div class="request__sub">{{ r.shared_example ? `You were both at ${r.shared_example}` : `@${r.handle}` }}</div>
      </div>
      <div class="request__actions">
        <SsButton size="sm" variant="outline" :disabled="busy[r.handle]" @click="respond(r, false)">Ignore</SsButton>
        <SsButton size="sm" :loading="busy[r.handle]" @click="respond(r, true)">Accept</SsButton>
      </div>
    </div>

    <!-- Search -->
    <SsInput
      v-model="q"
      size="lg"
      icon="search"
      placeholder="Search by name or @handle"
      clearable
      inputmode="search"
      enterkeyhint="search"
      autocomplete="off"
    />
    <SsCard v-if="q.trim().replace(/^@/, '').length >= 2" pad="sm" class="results">
      <div v-if="searching && !results.length" class="ss-stack" style="padding: 8px 6px">
        <SsSkeleton v-for="i in 2" :key="i" height="44px" />
      </div>
      <PersonRow
        v-for="p in results"
        :key="p.id"
        :name="p.display_name"
        :handle="p.handle"
        :avatar-path="p.avatar_path"
        :why="p.show_count != null ? plural(p.show_count, 'show') + ' logged' : p.is_public ? 'Public profile' : 'Private profile'"
        :state="stateOf(p)"
        :busy="busy[p.handle]"
        @add="add(p)"
      />
      <p v-if="!searching && !results.length" class="none">
        No one by that name yet. Send them your invite link below.
      </p>
    </SsCard>

    <div class="cols">
      <SsCard>
        <h2 class="ss-h2">Were at your shows</h2>
        <p class="lead">Public profiles that logged the same nights as you.</p>
        <div v-if="loading" class="ss-stack"><SsSkeleton v-for="i in 3" :key="i" height="44px" /></div>
        <template v-else-if="suggested.length">
          <PersonRow
            v-for="p in suggested"
            :key="p.id"
            :name="p.display_name"
            :handle="p.handle"
            :avatar-path="p.avatar_path"
            :why="`At ${plural(p.shared_count, 'of your shows', 'of your shows')}${p.example ? ' · incl. ' + p.example : ''}`"
            :state="stateOf(p)"
            :busy="busy[p.handle]"
            @add="add(p)"
          />
        </template>
        <p v-else class="ss-muted">
          Nobody yet. As more people log shows, anyone with a public profile who was at your shows shows up here.
        </p>

        <h2 class="ss-h2 friends-title">Your friends <span class="count">{{ friends.length }}</span></h2>
        <div v-if="loading" class="ss-stack"><SsSkeleton v-for="i in 2" :key="i" height="44px" /></div>
        <template v-else-if="friends.length">
          <PersonRow
            v-for="f in friends"
            :key="f.id"
            :name="f.display_name"
            :handle="f.handle"
            :avatar-path="f.avatar_path"
            :why="`${plural(f.shared_count, 'show')} together · ${plural(f.show_count, 'show')} logged`"
          >
            <template #action>
              <SsButton size="sm" variant="ghost" @click="remove(f)">Remove</SsButton>
            </template>
          </PersonRow>
        </template>
        <p v-else class="ss-muted">No friends yet. Share your link or QR code to get started.</p>
      </SsCard>

      <div class="ss-stack side">
        <div class="qr-card">
          <QrCode v-if="auth.profile" :value="inviteUrl" :size="132" label="QR code to add me on Stubstash" />
          <div class="qr-card__text">
            <div class="qr-card__kicker">AT THE SHOW?</div>
            <div class="qr-card__title">Scan to add me</div>
            <div class="qr-card__body">Show this to the people next to you on the rail. Works offline.</div>
          </div>
        </div>

        <SsCard>
          <h2 class="ss-h2">Invite link</h2>
          <div class="invite">
            <div class="invite__url ss-truncate" :title="inviteUrl">{{ inviteDisplay }}</div>
            <SsButton variant="light" size="md" class="invite__btn" @click="copyInvite">Copy</SsButton>
          </div>
          <SsButton v-if="canShare" variant="outline" size="sm" class="share-btn" @click="shareInvite">Share link</SsButton>
          <p class="hint">
            Friends who aren't on Stubstash yet: tag them in "Who was there" on any show and they'll get an invite with
            that show already in their log.
          </p>
        </SsCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.request {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  background: var(--ss-accent-soft);
  border: 1px solid var(--ss-accent);
  flex-wrap: wrap;
}
.request__text {
  flex: 1 1 200px;
  min-width: 0;
}
.request__title {
  font-weight: 900;
  font-size: 17px;
}
.request__sub {
  font-size: 14px;
  color: var(--ss-text-3);
}
.request__actions {
  display: flex;
  gap: 8px;
}
.results {
  padding-top: 4px;
  padding-bottom: 4px;
}
.results :deep(.person:first-child) {
  border-top: 0;
}
.none {
  padding: 16px 0;
  color: var(--ss-text-muted);
}
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
  gap: 14px;
  align-items: start;
}
.lead {
  font-size: 14px;
  color: var(--ss-text-muted);
  margin: 2px 0 8px;
}
.friends-title {
  margin-top: 22px;
  margin-bottom: 4px;
}
.count {
  color: var(--ss-text-muted);
  font-weight: 600;
  font-size: 15px;
}
.side {
  gap: 14px;
}
.qr-card {
  padding: 20px;
  border-radius: var(--ss-radius-lg);
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  display: flex;
  gap: 18px;
  align-items: center;
  flex-wrap: wrap;
}
.qr-card__text {
  flex: 1 1 160px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.qr-card__kicker {
  font-family: var(--ss-font-mono);
  font-size: 10px;
  letter-spacing: var(--ss-tracking-mono);
  font-weight: 700;
}
.qr-card__title {
  font-weight: 900;
  font-size: 24px;
  line-height: 1;
}
.qr-card__body {
  font-size: 14px;
  font-weight: 600;
}
.invite {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.invite__url {
  flex: 1;
  height: 46px;
  padding: 0 14px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  line-height: 44px;
  font-weight: 700;
}
.invite__btn {
  border-radius: var(--ss-radius-sm);
}
.share-btn {
  margin-top: 10px;
}
.hint {
  font-size: 13px;
  color: var(--ss-text-muted);
  line-height: 1.4;
  margin-top: 12px;
}
</style>
