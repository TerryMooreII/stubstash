<script setup lang="ts">
// Tilted dashed "sticker" badge. layout="compact" is the dashboard strip,
// layout="card" is the profile grid with description + progress.
import { computed } from "vue";
import { BADGE_COLORS } from "@/lib/color";
import { num } from "@/lib/format";

const props = withDefaults(
  defineProps<{
    name: string;
    description?: string;
    color: string;
    earned: boolean;
    progress?: number;
    target?: number;
    layout?: "compact" | "card";
  }>(),
  { layout: "compact" },
);
const ini = computed(() => props.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase());
const fill = computed(() => BADGE_COLORS[props.color] ?? props.color);
const status = computed(() =>
  props.earned ? "EARNED" : props.target && props.target > 1 ? `${num(props.progress ?? 0)}/${num(props.target)}` : "LOCKED",
);
</script>

<template>
  <div class="ss-badge" :class="[`ss-badge--${layout}`, { 'is-earned': earned }]">
    <div class="ss-badge__sticker" :style="earned ? { background: fill } : undefined" aria-hidden="true">{{ ini }}</div>
    <div class="ss-badge__text">
      <div class="ss-badge__name">{{ name }}</div>
      <template v-if="layout === 'card'">
        <div v-if="description" class="ss-badge__desc">{{ description }}</div>
        <div class="ss-badge__status">{{ status }}</div>
      </template>
    </div>
    <span class="ss-visually-hidden">{{ earned ? "Earned" : "Not earned yet" }}</span>
  </div>
</template>

<style scoped>
.ss-badge {
  /* Contains the visually-hidden label so it can't poke out of scrolling rows. */
  position: relative;
}
.ss-badge--compact {
  flex: 0 0 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.ss-badge--card {
  padding: 14px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-0);
  border: 1px solid var(--ss-line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ss-badge__sticker {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  transform: rotate(-6deg);
  background: var(--ss-surface-1);
  border: 2px dashed var(--ss-line-strong);
  color: var(--ss-text-off);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 22px;
  transition: transform var(--ss-dur) var(--ss-ease);
}
.ss-badge--card .ss-badge__sticker {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  font-size: 18px;
}
.is-earned .ss-badge__sticker {
  border-color: var(--ss-bg);
  color: var(--ss-on-accent);
}
.ss-badge:hover .ss-badge__sticker {
  transform: rotate(0deg) scale(1.04);
}
.ss-badge__name {
  font-weight: 700;
  font-size: 13px;
  line-height: 1.15;
  color: var(--ss-text-faint);
}
.is-earned .ss-badge__name {
  color: var(--ss-text);
}
.ss-badge--card .ss-badge__name {
  font-weight: 900;
  font-size: 15px;
}
.ss-badge__desc {
  font-size: 13px;
  color: var(--ss-text-muted);
  line-height: 1.3;
}
.ss-badge__status {
  font-family: var(--ss-font-mono);
  font-size: 10px;
  color: var(--ss-accent);
  margin-top: 4px;
}
</style>
