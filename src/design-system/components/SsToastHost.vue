<script setup lang="ts">
// Renders the toast from the ui store. Mount once in App.vue.
import { useUi } from "@/stores/ui";

const ui = useUi();
</script>

<template>
  <div class="ss-toast-host" aria-live="polite" aria-atomic="true">
    <Transition name="ss-toast">
      <div v-if="ui.toast" :key="ui.toast.id" class="ss-toast" :class="`ss-toast--${ui.toast.tone}`" role="status">
        {{ ui.toast.message }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ss-toast-host {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(var(--ss-tabbar-h) + 24px + var(--ss-safe-bottom));
  z-index: 200;
  pointer-events: none;
  width: max-content;
  max-width: calc(100vw - 32px);
}
@media (min-width: 820px) {
  .ss-toast-host {
    bottom: 28px;
  }
}
.ss-toast {
  padding: 12px 20px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  font-weight: 900;
  font-size: 15px;
  box-shadow: var(--ss-shadow-pop);
  text-align: center;
}
.ss-toast--error {
  background: var(--ss-coral);
}
.ss-toast--info {
  background: var(--ss-text);
}
.ss-toast-enter-active,
.ss-toast-leave-active {
  transition: opacity var(--ss-dur), transform var(--ss-dur) var(--ss-ease);
}
.ss-toast-enter-from,
.ss-toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
