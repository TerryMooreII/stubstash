<script setup lang="ts">
// /add/:handle: the "Scan to add me" / invite-link landing page.
import { computed } from "vue";
import { SsAvatar, SsButton, SsSpinner } from "@/design-system";
import AuthFrame from "./auth/AuthFrame.vue";
import { useAuth } from "@/stores/auth";
import { publicProfile } from "@/lib/api";
import { plural } from "@/lib/format";
import { useAsyncData } from "@/composables/useAsyncData";
import { useFriendRequest } from "@/composables/useFriendRequest";

const props = defineProps<{ handle: string }>();
const auth = useAuth();

const clean = computed(() => props.handle.replace(/^@/, ""));
const { data: person, loading } = useAsyncData(async () => {
  await auth.init();
  return publicProfile(clean.value).catch(() => null);
});
const next = computed(() => `/add/${encodeURIComponent(clean.value)}`);

const name = computed(() => person.value?.display_name || `@${person.value?.handle ?? clean.value}`);

const { request, busy: requesting } = useFriendRequest({
  onDone: (_handle, res) => {
    if (person.value) person.value = { ...person.value, friendship: res };
  },
});
const busy = computed(() => !!person.value && !!requesting.value[person.value.handle]);
async function add() {
  if (person.value) await request(person.value.handle, name.value);
}
</script>

<template>
  <AuthFrame v-if="loading" title="Finding them…"><SsSpinner :size="28" /></AuthFrame>

  <AuthFrame
    v-else-if="!person"
    kicker="HMM"
    title="No one by that handle."
    :lede="`We couldn't find @${clean} on Stubstash. Double-check the link.`"
  >
    <SsButton :to="auth.signedIn ? '/app/friends' : '/'" variant="outline" size="lg" block>
      {{ auth.signedIn ? "Find friends" : "What's Stubstash?" }}
    </SsButton>
  </AuthFrame>

  <AuthFrame v-else kicker="ADD TO YOUR CREW" :title="person.is_self ? 'That\'s you!' : name">
    <div class="who">
      <SsAvatar :name="person.display_name || person.handle" :path="person.avatar_path" :size="72" :me="person.is_self" />
      <div>
        <div class="who__handle">@{{ person.handle }}</div>
        <div class="who__sub">
          <template v-if="person.show_count != null">{{ plural(person.show_count, "show") }} logged</template>
          <template v-else>Private profile</template>
          <template v-if="person.home_city"> · {{ person.home_city }}</template>
        </div>
      </div>
    </div>

    <template v-if="person.is_self">
      <p class="note">Share this link so friends can add you.</p>
      <SsButton to="/app/friends" size="lg" block>Go to friends</SsButton>
    </template>
    <template v-else-if="!auth.signedIn">
      <p class="note">Stubstash logs every show you've been to, with setlists, stats and a map. Join to add {{ name }} and compare shows.</p>
      <SsButton :to="{ name: 'signup', query: { next } }" size="lg" block>Join Stubstash to add @{{ person.handle }}</SsButton>
      <SsButton :to="{ name: 'login', query: { next } }" variant="ghost">I already have an account</SsButton>
    </template>
    <template v-else-if="person.friendship === 'friends'">
      <p class="note">You're already friends.</p>
      <SsButton :to="`/u/${person.handle}`" size="lg" block>See their shows</SsButton>
    </template>
    <template v-else-if="person.friendship === 'sent'">
      <p class="note">Request sent. You'll see their shows once they accept.</p>
      <SsButton to="/app" variant="outline" size="lg" block>Back to my dashboard</SsButton>
    </template>
    <template v-else>
      <SsButton size="lg" block :loading="busy" @click="add">
        {{ person.friendship === "received" ? "Accept friend request" : "Add friend" }}
      </SsButton>
      <SsButton to="/app" variant="ghost">Not now</SsButton>
    </template>
  </AuthFrame>
</template>

<style scoped>
.who { display: flex; gap: 16px; align-items: center; }
.who__handle { font-weight: 900; font-size: 20px; }
.who__sub { color: var(--ss-text-muted); font-size: 15px; }
.note { color: var(--ss-text-3); font-size: 16px; line-height: 1.45; }
</style>
