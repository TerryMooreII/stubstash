<script setup lang="ts">
// Badge as a ticket stub (design "1b"): notched sides, a tear-off with the
// badge code, "ADMIT · №" and a big stat. Earned stubs are printed in the
// badge colour; locked ones are blank card stock.
// layout="compact" is the dashboard strip, layout="card" the profile grid
// with description, progress bar and status.
import { computed } from "vue";
import { BADGE_COLORS } from "@/lib/color";
import { badgeArt, badgeTilt, inkOn } from "@/lib/badgeArt";
import { num } from "@/lib/format";

const props = withDefaults(
  defineProps<{
    badgeKey: string;
    name: string;
    description?: string;
    color: string;
    earned: boolean;
    progress?: number;
    target?: number;
    /** Position in the list: sets the "№" and the tilt. */
    index?: number;
    layout?: "compact" | "card";
  }>(),
  { layout: "compact", index: 0, target: 1, progress: 0 },
);

const art = computed(() => badgeArt(props.badgeKey, props.name, props.target));
const fill = computed(() => (props.earned ? BADGE_COLORS[props.color] ?? props.color : null));
const light = computed(() => !!fill.value && inkOn(fill.value) === "light");
const serial = computed(() => `№${String(props.index + 1).padStart(2, "0")}`);
const counts = computed(() => !props.earned && props.target > 1);
const pct = computed(() => `${Math.min(100, (props.progress / props.target) * 100)}%`);
const status = computed(() =>
  props.earned ? "EARNED" : counts.value ? `${num(props.progress)}/${num(props.target)}` : "LOCKED",
);
</script>

<template>
  <div class="ss-badge" :class="[`ss-badge--${layout}`, { 'is-earned': earned, 'is-light': light }]">
    <div
      class="ss-badge__stub"
      :style="{ background: fill ?? undefined, transform: `rotate(${badgeTilt(index)}deg)` }"
      aria-hidden="true"
    >
      <div class="ss-badge__tear"><span>{{ art.code }}</span></div>
      <div class="ss-badge__face">
        <div class="ss-badge__admit">ADMIT · {{ serial }}</div>
        <div class="ss-badge__statline">
          <span class="ss-badge__stat">{{ art.stat }}</span>
          <span class="ss-badge__unit">{{ art.unit }}</span>
        </div>
      </div>
    </div>
    <div class="ss-badge__text">
      <div class="ss-badge__name">{{ name }}</div>
      <div v-if="layout === 'card' && description" class="ss-badge__desc">{{ description }}</div>
    </div>
    <div v-if="layout === 'card'" class="ss-badge__foot">
      <div v-if="counts" class="ss-badge__bar"><div :style="{ width: pct }" /></div>
      <span class="ss-badge__status" :class="{ 'is-locked': !earned && !counts }">{{ status }}</span>
    </div>
    <span class="ss-visually-hidden">{{ earned ? "Earned" : "Not earned yet" }}</span>
  </div>
</template>

<style scoped>
.ss-badge {
  /* Contains the visually-hidden label so it can't poke out of scrolling rows. */
  position: relative;
  --stub-w: 168px;
  --stub-h: 80px;
  --tear: 44px;
  --notch: 9px;
  --ink: #55555b;
  --frame: #2e2e33;
}
.is-earned { --ink: #141416; --frame: rgba(20, 20, 22, 0.35); }
.is-earned.is-light { --ink: var(--ss-cream); --frame: rgba(252, 228, 163, 0.35); }

.ss-badge--card {
  padding: 20px 18px;
  border-radius: 18px;
  background: var(--ss-surface-0);
  border: 1px solid var(--ss-line);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ss-badge--compact {
  --stub-w: 132px;
  --stub-h: 64px;
  --tear: 34px;
  --notch: 7px;
  flex: 0 0 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding-top: 4px;
}

/* ---- the stub */
.ss-badge__stub {
  --hole: #0000 calc(var(--notch) - 0.3px), #000 var(--notch);
  width: var(--stub-w);
  max-width: 100%;
  height: var(--stub-h);
  display: flex;
  flex-shrink: 0;
  border-radius: 6px;
  background: #1a1a1d;
  color: var(--ink);
  transition: transform var(--ss-dur) var(--ss-ease);
  /* Half-circle notches on both short sides. */
  -webkit-mask:
    radial-gradient(circle at 0 50%, var(--hole)) left / 50.5% 100% no-repeat,
    radial-gradient(circle at 100% 50%, var(--hole)) right / 50.5% 100% no-repeat;
  mask:
    radial-gradient(circle at 0 50%, var(--hole)) left / 50.5% 100% no-repeat,
    radial-gradient(circle at 100% 50%, var(--hole)) right / 50.5% 100% no-repeat;
}
.ss-badge:hover .ss-badge__stub { transform: rotate(0deg) scale(1.03) !important; }
.ss-badge__tear {
  width: var(--tear);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 2px dashed var(--frame);
}
.ss-badge__tear span {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-weight: 900;
  font-size: 15px;
  letter-spacing: 0.08em;
}
.ss-badge__face {
  flex: 1;
  min-width: 0;
  padding: 9px 14px 9px 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: left;
}
.ss-badge__admit {
  font-family: var(--ss-font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.ss-badge__statline { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.ss-badge__stat {
  font-weight: 900;
  font-size: 30px;
  line-height: 0.9;
  letter-spacing: -0.02em;
  white-space: nowrap;
  flex-shrink: 0;
}
.ss-badge__unit {
  font-weight: 800;
  font-size: 9px;
  letter-spacing: 0.1em;
  line-height: 1.1;
  min-width: 0;
}
.ss-badge--compact .ss-badge__tear span { font-size: 12px; }
.ss-badge--compact .ss-badge__face { padding: 7px 10px 7px 9px; }
.ss-badge--compact .ss-badge__admit { font-size: 8px; }
.ss-badge--compact .ss-badge__stat { font-size: 22px; }
.ss-badge--compact .ss-badge__unit { font-size: 7px; }

/* ---- text */
.ss-badge__text { display: flex; flex-direction: column; gap: 4px; }
.ss-badge__name {
  font-weight: 800;
  font-size: 18px;
  line-height: 1.15;
  color: var(--ss-text-faint);
}
.is-earned .ss-badge__name { color: var(--ss-text); }
.ss-badge--compact .ss-badge__name { font-weight: 700; font-size: 13px; }
.ss-badge__desc {
  font-size: 15px;
  color: var(--ss-text-muted);
  line-height: 1.35;
  text-wrap: pretty;
}
.ss-badge__foot { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.ss-badge__bar { height: 4px; background: var(--ss-line); border-radius: 2px; overflow: hidden; }
.ss-badge__bar div { height: 100%; background: var(--ss-accent); }
.ss-badge__status { font-family: var(--ss-font-mono); font-size: 13px; color: var(--ss-accent); }
.ss-badge__status.is-locked { color: var(--ss-text-off); }
</style>
