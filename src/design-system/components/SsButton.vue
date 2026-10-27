<script setup lang="ts">
// Pill button. Variants map to the design:
//   primary  - yellow fill, 900 weight ("Log a show", "Save to my shows")
//   light    - off-white fill ("Continue with ...", "Open app")
//   outline  - transparent with grey border ("Edit", "Not now")
//   accent-outline - transparent with accent border ("Install app")
//   ghost    - text only ("I'll add shows myself")
//   dark     - near-black fill with accent text (on yellow panels)
//   neutral  - grey fill ("Add" next to an input)
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import SsSpinner from "./SsSpinner.vue";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "light" | "outline" | "accent-outline" | "ghost" | "dark" | "neutral" | "danger";
    size?: "sm" | "md" | "lg";
    to?: RouteLocationRaw;
    href?: string;
    type?: "button" | "submit" | "reset";
    block?: boolean;
    loading?: boolean;
    disabled?: boolean;
    square?: boolean;
  }>(),
  { variant: "primary", size: "md", type: "button" },
);

const tag = computed(() => (props.to ? RouterLink : props.href ? "a" : "button"));
const attrs = computed(() => {
  if (props.to) return { to: props.to };
  if (props.href) return { href: props.href, target: /^https?:/.test(props.href) ? "_blank" : undefined, rel: "noopener" };
  return { type: props.type, disabled: props.disabled || props.loading };
});
</script>

<template>
  <component
    :is="tag"
    v-bind="attrs"
    class="ss-btn"
    :class="[`ss-btn--${variant}`, `ss-btn--${size}`, { 'ss-btn--block': block, 'ss-btn--square': square, 'is-loading': loading }]"
    :aria-busy="loading || undefined"
  >
    <SsSpinner v-if="loading" :size="size === 'sm' ? 14 : 18" />
    <slot />
  </component>
</template>

<style scoped>
.ss-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--ss-radius-pill);
  border: 1px solid transparent;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background var(--ss-dur-fast), color var(--ss-dur-fast), border-color var(--ss-dur-fast),
    transform var(--ss-dur-fast) var(--ss-ease);
  -webkit-tap-highlight-color: transparent;
}
.ss-btn:hover {
  text-decoration: none;
}
.ss-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.ss-btn:disabled {
  cursor: not-allowed;
}

.ss-btn--sm { height: 36px; padding: 0 14px; font-size: 14px; }
.ss-btn--md { height: 46px; padding: 0 20px; font-size: 16px; }
.ss-btn--lg { height: 56px; padding: 0 28px; font-size: 18px; }
.ss-btn--square.ss-btn--sm { width: 36px; padding: 0; }
.ss-btn--square.ss-btn--md { width: 46px; padding: 0; }
.ss-btn--block { width: 100%; }

.ss-btn--primary { background: var(--ss-accent); color: var(--ss-on-accent); font-weight: 900; }
.ss-btn--primary:hover { background: var(--ss-accent-hover); color: var(--ss-on-accent); }
.ss-btn--primary:disabled { background: var(--ss-surface-3); color: var(--ss-text-faint); }

.ss-btn--light { background: var(--ss-text); color: var(--ss-on-accent); }
.ss-btn--light:hover { background: #fff; color: var(--ss-on-accent); }

.ss-btn--outline { background: transparent; border-color: var(--ss-line-strong); color: var(--ss-text); }
.ss-btn--outline:hover { border-color: var(--ss-text-faint); color: var(--ss-text); }

.ss-btn--accent-outline { background: transparent; border-color: var(--ss-accent); color: var(--ss-accent); }
.ss-btn--accent-outline:hover { background: var(--ss-accent-soft); color: var(--ss-accent); }

.ss-btn--ghost { background: transparent; color: var(--ss-text-muted); font-weight: 600; }
.ss-btn--ghost:hover { color: var(--ss-text); }

.ss-btn--dark { background: var(--ss-bg); color: var(--ss-accent); font-weight: 900; }
.ss-btn--dark:hover { background: #000; color: var(--ss-accent-hover); }

.ss-btn--neutral { background: var(--ss-surface-3); color: var(--ss-text); border-radius: var(--ss-radius-sm); }
.ss-btn--neutral:hover { background: var(--ss-line-strong); color: var(--ss-text); }

.ss-btn--danger { background: transparent; border-color: rgba(255, 95, 108, 0.5); color: var(--ss-danger); }
.ss-btn--danger:hover { background: var(--ss-danger-soft); color: var(--ss-danger); }

.is-loading { opacity: 0.85; }
</style>
