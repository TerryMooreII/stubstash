<script setup lang="ts">
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
const busy = ref(false);
const error = ref<string | null>(null);

const next = computed(() => {
  const n = route.query.next;
  return typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/app";
});

async function submit() {
  error.value = null;
  if (!email.value.trim() || !password.value) {
    error.value = "Enter your email and password.";
    return;
  }
  busy.value = true;
  try {
    await auth.signIn(email.value.trim(), password.value);
    router.replace(next.value);
  } catch (e) {
    const msg = errorMessage(e);
    error.value = /invalid login/i.test(msg)
      ? "That email and password don't match."
      : /not confirmed/i.test(msg)
        ? "Confirm your email first. Check your inbox for the link."
        : msg;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthFrame kicker="WELCOME BACK" title="Back to the pit." lede="Sign in to pick up your log where you left it.">
    <form class="form" novalidate @submit.prevent="submit">
      <SsField label="Email">
        <SsInput v-model="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" size="lg" />
      </SsField>
      <SsField label="Password">
        <SsInput v-model="password" type="password" autocomplete="current-password" placeholder="Your password" size="lg" enterkeyhint="go" />
      </SsField>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <SsButton type="submit" size="lg" block :loading="busy">Sign in</SsButton>
    </form>
    <div class="links">
      <RouterLink :to="{ name: 'forgot', query: { email: email || undefined } }">Forgot your password?</RouterLink>
      <span>New here? <RouterLink :to="{ name: 'signup', query: route.query }">Start your log</RouterLink></span>
    </div>
  </AuthFrame>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 14px; }
.error { color: var(--ss-danger); font-weight: 600; font-size: 14px; }
.links { display: flex; flex-direction: column; gap: 10px; font-size: 15px; color: var(--ss-text-muted); }
</style>
