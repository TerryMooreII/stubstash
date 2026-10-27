<script setup lang="ts">
// Landing page for the email confirmation link. supabase-js exchanges the
// code in the URL (detectSessionInUrl); we wait for the session, then move on.
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsButton, SsSpinner } from "@/design-system";
import AuthFrame from "./AuthFrame.vue";
import { useAuth } from "@/stores/auth";
import { supabase } from "@/lib/supabase";

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const failed = ref(false);

onMounted(async () => {
  await auth.init();
  for (let i = 0; i < 25 && !auth.session; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) { auth.session = data.session; break; }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!auth.session) {
    failed.value = true;
    return;
  }
  await auth.loadProfile().catch(() => {});
  const n = route.query.next;
  router.replace(typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/app");
});
</script>

<template>
  <AuthFrame
    v-if="failed"
    kicker="HMM"
    title="That link didn't sign you in."
    lede="It may have expired or already been used. Sign in with your email and password instead."
  >
    <SsButton to="/login" size="lg" block>Sign in</SsButton>
  </AuthFrame>
  <AuthFrame v-else kicker="YOU'RE CONFIRMED" title="Opening your stash…">
    <SsSpinner :size="28" />
  </AuthFrame>
</template>
