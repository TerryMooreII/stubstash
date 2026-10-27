<script setup lang="ts">
import { SsButton } from "@/design-system";
import AuthFrame from "./auth/AuthFrame.vue";
import { useAuth } from "@/stores/auth";

const auth = useAuth();
</script>

<template>
  <AuthFrame kicker="ERROR 404 · NO SETLIST FOUND" title="Wrong venue." lede="This page isn't on the bill. Maybe the link has a typo, or the show moved.">
    <SsButton :to="auth.signedIn ? '/app' : '/'" size="lg" block>{{ auth.signedIn ? "Back to my dashboard" : "Back to the front door" }}</SsButton>
  </AuthFrame>
</template>
