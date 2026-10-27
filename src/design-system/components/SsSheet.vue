<script setup lang="ts">
// Modal: a bottom sheet on phones, a centered dialog on desktop.
// Closes on backdrop click and Escape; traps nothing fancy but returns focus.
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const open = defineModel<boolean>({ default: false });
const props = withDefaults(
  defineProps<{ label: string; width?: number; bare?: boolean; dismissable?: boolean }>(),
  { width: 440, dismissable: true },
);

const panel = ref<HTMLElement>();
let lastFocus: HTMLElement | null = null;

function close() {
  if (props.dismissable) open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

watch(open, async (v) => {
  if (v) {
    lastFocus = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    await nextTick();
    panel.value?.focus();
  } else {
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKey);
  document.body.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <Transition name="ss-sheet">
      <div v-if="open" class="ss-sheet" @click.self="close">
        <div
          ref="panel"
          class="ss-sheet__panel"
          :class="{ 'ss-sheet__panel--bare': bare }"
          :style="{ maxWidth: width + 'px' }"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
          tabindex="-1"
        >
          <slot :close="close" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ss-sheet {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(5, 4, 7, 0.75);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow-y: auto;
}
.ss-sheet__panel {
  width: 100%;
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  border-radius: 24px 24px 0 0;
  padding: 24px 24px calc(24px + var(--ss-safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 16px;
  outline: none;
  max-height: 92dvh;
  overflow-y: auto;
}
.ss-sheet__panel--bare {
  background: transparent;
  border: 0;
  padding: 20px;
  align-items: center;
}
@media (min-width: 820px) {
  .ss-sheet {
    align-items: center;
    padding: 24px;
  }
  .ss-sheet__panel {
    border-radius: 20px;
    padding-bottom: 24px;
  }
}

.ss-sheet-enter-active,
.ss-sheet-leave-active {
  transition: opacity var(--ss-dur) var(--ss-ease);
}
.ss-sheet-enter-active .ss-sheet__panel,
.ss-sheet-leave-active .ss-sheet__panel {
  transition: transform var(--ss-dur) var(--ss-ease);
}
.ss-sheet-enter-from,
.ss-sheet-leave-to {
  opacity: 0;
}
.ss-sheet-enter-from .ss-sheet__panel,
.ss-sheet-leave-to .ss-sheet__panel {
  transform: translateY(24px);
}
</style>
