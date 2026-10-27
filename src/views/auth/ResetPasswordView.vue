<script setup lang="ts">
// Reached from the password reset email. supabase-js picks the recovery
// session out of the URL; we wait for it, then let the user set a password.
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { SsButton, SsField, SsInput, SsSpinner } from "@/design-system";
import AuthFrame from "./AuthFrame.vue";
import { useAuth } from "@/stores/auth";
import { supabase, errorMessage } from "@/lib/supabase";
import { useUi } from "@/stores/ui";

const auth = useAuth();
const ui = useUi();
const router = useRouter();

const ready = ref(false);
const hasSession = ref(false);
const password = ref("");
const confirm = ref("");
const busy = ref(false);
const error = ref<string | null>(null);

const ok = computed(() => password.value.length >= 8 && /[a-z]/i.test(password.value) && /\d/.test(password.value));

onMounted(async () => {
  await auth.init();
  // Give detectSessionInUrl a moment to finish the PKCE exchange.
  for (let i = 0; i < 20 && !auth.session; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) { auth.session = data.session; break; }
    await new Promise((r) => setTimeout(r, 150));
  }
  hasSession.value = !!auth.session;
  ready.value = true;
});

async function submit() {
  error.value = null;
  if (!ok.value) return void (error.value = "Use at least 8 characters with letters and numbers.");
  if (password.value !== confirm.value) return void (error.value = "Those passwords don't match.");
  busy.value = true;
  try {
    await auth.updatePassword(password.value);
    ui.flash("Password updated");
    router.replace("/app");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthFrame v-if="!ready" title="One sec…"><SsSpinner :size="28" /></AuthFrame>
  <AuthFrame
    v-else-if="!hasSession"
    kicker="LINK EXPIRED"
    title="That reset link didn't work."
    lede="Reset links only work once and expire after a while. Ask for a fresh one."
  >
    <SsButton to="/forgot" size="lg" block>Send a new link</SsButton>
  </AuthFrame>
  <AuthFrame v-else kicker="NEW PASSWORD" title="Pick a new password.">
    <form class="form" novalidate @submit.prevent="submit">
      <SsField label="New password" hint="8+ characters, letters and numbers">
        <SsInput v-model="password" type="password" autocomplete="new-password" size="lg" />
      </SsField>
      <SsField label="Type it again">
        <SsInput v-model="confirm" type="password" autocomplete="new-password" size="lg" />
      </SsField>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <SsButton type="submit" size="lg" block :loading="busy">Save password</SsButton>
    </form>
  </AuthFrame>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 14px; }
.error { color: var(--ss-danger); font-weight: 600; font-size: 14px; }
</style>
