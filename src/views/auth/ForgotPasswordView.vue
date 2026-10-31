<script setup lang="ts">
import { ref } from "vue";
import { useRoute } from "vue-router";
import { SsButton, SsField, SsInput } from "@/design-system";
import AuthFrame from "./AuthFrame.vue";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/lib/supabase";

const auth = useAuth();
const route = useRoute();
const email = ref(typeof route.query.email === "string" ? route.query.email : "");
const busy = ref(false);
const sent = ref(false);
const error = ref<string | null>(null);

async function submit() {
  error.value = null;
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return void (error.value = "Enter the email you signed up with.");
  busy.value = true;
  try {
    await auth.sendPasswordReset(email.value.trim());
    sent.value = true;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthFrame
    v-if="sent"
    kicker="RESET LINK SENT"
    title="Check your email."
    :lede="`If ${email} has an account, a reset link is on its way.`"
  >
    <SsButton to="/login" variant="outline" size="lg" block>Back to sign in</SsButton>
  </AuthFrame>
  <AuthFrame v-else kicker="RESET PASSWORD" title="Lost your password?" lede="We'll email you a link to set a new one.">
    <form class="form" novalidate @submit.prevent="submit">
      <SsField label="Email">
        <SsInput v-model="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" size="lg" />
      </SsField>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <SsButton type="submit" size="lg" block :loading="busy">Send reset link</SsButton>
    </form>
    <RouterLink to="/login" class="back">Back to sign in</RouterLink>
  </AuthFrame>
</template>

<style scoped>
.back { font-size: 15px; }
</style>
