<script setup lang="ts">
// Switch with a label inside a pill, like the "Public profile" toggle.
const model = defineModel<boolean>({ default: false });
defineProps<{ label?: string; onLabel?: string; offLabel?: string; plain?: boolean; disabled?: boolean }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    class="ss-toggle"
    :class="{ 'ss-toggle--plain': plain }"
    :aria-checked="model"
    :disabled="disabled"
    @click="model = !model"
  >
    <span class="ss-toggle__track" :class="{ 'is-on': model }"><span class="ss-toggle__knob" /></span>
    <span v-if="label || onLabel">{{ model ? (onLabel ?? label) : (offLabel ?? label) }}</span>
  </button>
</template>

<style scoped>
.ss-toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 8px;
  border-radius: var(--ss-radius-pill);
  border: 1px solid var(--ss-line);
  background: var(--ss-surface-1);
  color: var(--ss-text);
  font-weight: 700;
}
.ss-toggle--plain {
  padding: 0;
  border: 0;
  background: transparent;
}
.ss-toggle:disabled { opacity: 0.6; cursor: not-allowed; }
.ss-toggle__track {
  width: 40px;
  height: 24px;
  border-radius: 24px;
  background: var(--ss-line-strong);
  position: relative;
  display: block;
  flex-shrink: 0;
  transition: background var(--ss-dur-fast);
}
.ss-toggle__track.is-on { background: var(--ss-accent); }
.ss-toggle__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: left var(--ss-dur-fast) var(--ss-ease);
}
.ss-toggle__track.is-on .ss-toggle__knob { left: 19px; }
</style>
