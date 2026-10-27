<script setup lang="ts">
// Shared frame for auth screens: yellow glow, logo top-left, centered column.
import { SsLogo } from "@/design-system";

defineProps<{ kicker?: string; title: string; lede?: string }>();
</script>

<template>
  <div class="auth">
    <header class="auth__top">
      <RouterLink to="/" aria-label="Stubstash home"><SsLogo :size="22" /></RouterLink>
      <slot name="top" />
    </header>
    <main class="auth__body">
      <div class="auth__col">
        <div v-if="kicker" class="ss-kicker">{{ kicker }}</div>
        <h1 class="auth__title">{{ title }}</h1>
        <p v-if="lede" class="auth__lede">{{ lede }}</p>
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: radial-gradient(120% 70% at 50% 0%, rgba(244, 184, 17, 0.16), transparent 60%), var(--ss-bg);
}
.auth__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(20px + var(--ss-safe-top)) 24px 20px;
}
.auth__top a { text-decoration: none; }
.auth__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px calc(40px + var(--ss-safe-bottom));
}
.auth__col {
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.auth__title {
  font-weight: 900;
  font-size: clamp(38px, 9vw, 52px);
  line-height: 0.92;
  letter-spacing: var(--ss-tracking-tight);
  text-wrap: balance;
}
.auth__lede {
  font-size: 18px;
  color: var(--ss-text-3);
  line-height: 1.45;
  text-wrap: pretty;
}
</style>
