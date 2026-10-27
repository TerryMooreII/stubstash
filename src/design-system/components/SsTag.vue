<script setup lang="ts">
// Small mono label on a bright fill: "FIRST TIME", "ONLY TIME", "ENCORE",
// "SETLIST.FM", "ADDED BY YOU".
withDefaults(
  defineProps<{ tone?: "accent" | "teal" | "light" | "butter" | "lavender" | "dark" | "outline" }>(),
  { tone: "accent" },
);
</script>

<template>
  <span class="ss-tag" :class="`ss-tag--${tone}`"><slot /></span>
</template>

<style scoped>
.ss-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: var(--ss-radius-xs);
  font-family: var(--ss-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--ss-on-accent);
}
.ss-tag--accent { background: var(--ss-accent); }
.ss-tag--teal { background: var(--ss-teal-light); }
.ss-tag--light { background: var(--ss-text); }
.ss-tag--butter { background: var(--ss-butter); }
.ss-tag--lavender { background: var(--ss-lavender); }
.ss-tag--dark { background: rgba(10, 9, 12, 0.7); color: var(--ss-text-2); }
.ss-tag--outline { background: transparent; border: 1px solid var(--ss-line-strong); color: var(--ss-text-muted); }
</style>
