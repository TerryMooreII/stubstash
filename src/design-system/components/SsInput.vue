<script setup lang="ts">
// Text input in the design's style. size="xl" is the big search box with an
// accent border; prefix shows static text before the value ("setlist.fm/user/").
import { ref } from "vue";
import SsIcon, { type IconName } from "./SsIcon.vue";

const model = defineModel<string>({ default: "" });
withDefaults(
  defineProps<{
    type?: string;
    placeholder?: string;
    size?: "md" | "lg" | "xl";
    icon?: IconName;
    prefix?: string;
    clearable?: boolean;
    invalid?: boolean;
    autocomplete?: string;
    inputmode?: "text" | "search" | "email" | "numeric" | "decimal" | "url" | "tel";
    maxlength?: number;
    id?: string;
    name?: string;
    required?: boolean;
    autofocus?: boolean;
    enterkeyhint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  }>(),
  { type: "text", size: "md" },
);
const emit = defineEmits<{ enter: []; clear: [] }>();
const input = ref<HTMLInputElement>();
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div class="ss-input" :class="[`ss-input--${size}`, { 'is-invalid': invalid }]" @click="input?.focus()">
    <SsIcon v-if="icon" :name="icon" :size="size === 'xl' ? 22 : 18" class="ss-input__icon" />
    <span v-if="prefix" class="ss-input__prefix">{{ prefix }}</span>
    <input
      :id="id"
      ref="input"
      v-model="model"
      :name="name"
      :type="type"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :maxlength="maxlength"
      :required="required"
      :autofocus="autofocus"
      :enterkeyhint="enterkeyhint"
      :aria-invalid="invalid || undefined"
      @keydown.enter="emit('enter')"
    />
    <button
      v-if="clearable && model"
      type="button"
      class="ss-input__clear"
      aria-label="Clear"
      @click.stop="model = ''; emit('clear'); input?.focus()"
    >
      <SsIcon name="close" :size="16" />
    </button>
    <slot name="end" />
  </div>
</template>

<style scoped>
.ss-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  min-width: 0;
  cursor: text;
  transition: border-color var(--ss-dur-fast);
}
.ss-input:focus-within {
  border-color: var(--ss-accent);
}
.ss-input.is-invalid {
  border-color: var(--ss-danger);
}
.ss-input--md { height: 46px; font-size: 16px; }
.ss-input--lg { height: 56px; padding: 0 18px; border-radius: var(--ss-radius-md); font-size: 17px; font-weight: 700; }
.ss-input--xl {
  height: 62px;
  padding: 0 20px;
  border-radius: 16px;
  border: 2px solid var(--ss-accent);
  font-size: 20px;
  font-weight: 700;
}
input {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: transparent;
  border: 0;
  outline: none;
  color: var(--ss-text);
  font-size: inherit;
  font-weight: inherit;
  color-scheme: dark;
}
input:focus-visible {
  outline: none;
}
.ss-input__icon {
  color: var(--ss-text-muted);
}
.ss-input__prefix {
  color: var(--ss-text-faint);
  white-space: nowrap;
  font-weight: 400;
}
.ss-input__clear {
  border: 0;
  background: transparent;
  color: var(--ss-text-muted);
  padding: 6px;
  display: flex;
  border-radius: 50%;
}
.ss-input__clear:hover {
  color: var(--ss-text);
}
</style>
