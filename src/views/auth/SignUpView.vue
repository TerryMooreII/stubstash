<script setup lang="ts">
import { SITE_HOST } from "@/lib/url";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsButton, SsField, SsInput } from "@/design-system";
import AuthFrame from "./AuthFrame.vue";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/lib/supabase";

const auth = useAuth();
const route = useRoute();
const router = useRouter();

const email = ref("");
const password = ref("");
const handle = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
const sentTo = ref<string | null>(null);

const next = computed(() => {
  const n = route.query.next;
  return typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/app";
});

const passwordOk = computed(() => password.value.length >= 8 && /[a-z]/i.test(password.value) && /\d/.test(password.value));
const handleOk = computed(() => !handle.value || /^@?[A-Za-z0-9_]{3,24}$/.test(handle.value.trim()));

async function submit() {
  error.value = null;
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return void (error.value = "Enter a valid email.");
  if (!passwordOk.value) return void (error.value = "Use at least 8 characters with letters and numbers.");
  if (!handleOk.value) return void (error.value = "Handles are 3 to 24 letters, numbers or underscores.");
  busy.value = true;
  try {
    const { needsConfirmation } = await auth.signUp(
      email.value.trim(),
      password.value,
      handle.value.trim().replace(/^@/, "") || undefined,
    );
    if (needsConfirmation) {
      sentTo.value = email.value.trim();
    } else {
      await auth.loadProfile();
      router.replace(next.value);
    }
  } catch (e) {
    const msg = errorMessage(e);
    error.value = /already registered|already exists/i.test(msg) ? "That email already has an account. Try signing in." : msg;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthFrame
    v-if="sentTo"
    kicker="ONE MORE STEP"
    title="Check your email."
    :lede="`We sent a confirmation link to ${sentTo}. Tap it and you're in.`"
  >
    <p class="note">No email after a minute? Check spam, or <button class="linkish" @click="sentTo = null">try a different address</button>.</p>
    <SsButton :to="{ name: 'login', query: route.query }" variant="outline" size="lg" block>I've confirmed, sign me in</SsButton>
  </AuthFrame>

  <AuthFrame
    v-else
    kicker="WELCOME TO THE PIT"
    title="Every show you've ever been to. Counted."
    lede="Log gigs from setlist.fm in a tap, then watch the stats, maps and bragging rights stack up."
  >
    <form class="form" novalidate @submit.prevent="submit">
      <SsField label="Email">
        <SsInput v-model="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" size="lg" />
      </SsField>
      <SsField label="Password" hint="8+ characters, letters and numbers">
        <SsInput v-model="password" type="password" autocomplete="new-password" placeholder="Make it a good one" size="lg" />
      </SsField>
      <SsField label="Handle (optional)" :hint="`Your public link: ${SITE_HOST}/u/handle`" :error="handleOk ? null : 'Letters, numbers or underscores, 3 to 24 long'">
        <SsInput v-model="handle" prefix="@" autocomplete="username" placeholder="samgigs" size="lg" :maxlength="25" />
      </SsField>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <SsButton type="submit" size="lg" block :loading="busy">Create my account</SsButton>
    </form>
    <div class="links">
      <span>Already logging? <RouterLink :to="{ name: 'login', query: route.query }">Sign in</RouterLink></span>
    </div>
  </AuthFrame>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 14px; }
.error { color: var(--ss-danger); font-weight: 600; font-size: 14px; }
.links { font-size: 15px; color: var(--ss-text-muted); }
.note { color: var(--ss-text-muted); font-size: 15px; line-height: 1.45; }
.linkish { border: 0; background: none; padding: 0; color: var(--ss-accent); font-weight: 600; }
</style>
