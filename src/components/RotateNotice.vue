<script setup lang="ts">
// Phones held sideways get a "turn it back" screen. The installed app is
// locked to portrait on Android (manifest), but iOS and browser tabs can't be
// locked, so this covers them. Uses the device's orientation, not the
// viewport's shape, so an open keyboard (which makes the viewport short and
// wide) doesn't trigger it. Phones only: tablets and desktops never see it.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { SsLogo } from "@/design-system";

const show = ref(false);

function isPhone(): boolean {
  return window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 500;
}

function isLandscape(): boolean {
  const type = screen.orientation?.type;
  if (type) return type.startsWith("landscape");
  const angle = (window as { orientation?: number }).orientation; // older iOS
  return angle === 90 || angle === -90;
}

function update() {
  show.value = isPhone() && isLandscape();
}

onMounted(() => {
  update();
  screen.orientation?.addEventListener("change", update);
  window.addEventListener("orientationchange", update);
});
onBeforeUnmount(() => {
  screen.orientation?.removeEventListener("change", update);
  window.removeEventListener("orientationchange", update);
});
</script>

<template>
  <div v-if="show" class="rotate" role="alert">
    <SsLogo :size="22" />
    <svg class="rotate__phone" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="20" y="6" width="24" height="44" rx="5" stroke="currentColor" stroke-width="3" />
      <path d="M29 43h6" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      <path d="M12 52a22 22 0 0 0 26 6" stroke="var(--ss-accent)" stroke-width="3" stroke-linecap="round" />
      <path d="M34 54l5 4-5 4" stroke="var(--ss-accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <div class="rotate__title">Turn your phone upright</div>
    <div class="rotate__body">Stubstash works best in portrait.</div>
  </div>
</template>

<style scoped>
.rotate {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: var(--ss-bg);
  color: var(--ss-text);
  text-align: center;
}
.rotate__phone { color: var(--ss-text-2); margin-top: 8px; }
.rotate__title { font-weight: 900; font-size: 24px; letter-spacing: var(--ss-tracking-tight); }
.rotate__body { color: var(--ss-text-muted); font-size: 15px; }
</style>
