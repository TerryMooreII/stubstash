<script setup lang="ts">
// "← Back" text link. With no `to`, goes back in history (or to the fallback).
import { useRouter, type RouteLocationRaw } from "vue-router";

const props = withDefaults(defineProps<{ to?: RouteLocationRaw; fallback?: RouteLocationRaw; label?: string }>(), {
  label: "Back",
  fallback: "/app",
});
const router = useRouter();
function go() {
  if (props.to) router.push(props.to);
  else if (window.history.state?.back) router.back();
  else router.push(props.fallback);
}
</script>

<template>
  <button type="button" class="ss-back" @click="go">← {{ label }}</button>
</template>

<style scoped>
.ss-back {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--ss-text-muted);
  font-size: 15px;
  font-weight: 600;
  padding: 0;
}
.ss-back:hover {
  color: var(--ss-text);
}
</style>
