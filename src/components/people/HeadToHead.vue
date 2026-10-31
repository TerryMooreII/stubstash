<script setup lang="ts">
// Friend row with "You vs Them" show-count bars, as in the design.
import { computed } from "vue";
import { SsAvatar } from "@/design-system";
import { avatarColor } from "@/lib/color";
import { firstName, num, plural } from "@/lib/format";

const props = defineProps<{
  name: string;
  handle: string;
  avatarPath?: string | null;
  theirShows: number;
  myShows: number;
  shared: number;
  max: number;
}>();
const first = computed(() => firstName(props.name, props.handle));
const pct = (n: number) => `${Math.max(2, (n / Math.max(1, props.max)) * 100)}%`;
</script>

<template>
  <div class="h2h">
    <RouterLink :to="`/u/${handle}`" class="h2h__who">
      <SsAvatar :name="name || handle" :path="avatarPath" :size="40" />
      <div class="ss-truncate">
        <div class="h2h__name ss-truncate">{{ name || handle }}</div>
        <div class="h2h__sub">{{ shared ? `${plural(shared, "show")} together` : "No shows together yet" }}</div>
      </div>
    </RouterLink>
    <div class="h2h__bars">
      <div class="h2h__bar">
        <span class="h2h__lbl">You</span>
        <div class="h2h__track"><div class="h2h__fill" :style="{ width: pct(myShows), background: 'var(--ss-accent)' }" /></div>
        <b class="ss-num">{{ num(myShows) }}</b>
      </div>
      <div class="h2h__bar">
        <span class="h2h__lbl ss-truncate">{{ first }}</span>
        <div class="h2h__track"><div class="h2h__fill" :style="{ width: pct(theirShows), background: avatarColor(name || handle) }" /></div>
        <b class="ss-num">{{ num(theirShows) }}</b>
      </div>
    </div>
  </div>
</template>

<style scoped>
.h2h {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
}
.h2h__who {
  display: flex;
  gap: 10px;
  align-items: center;
  flex: 1 1 200px;
  min-width: 0;
  color: var(--ss-text);
  text-decoration: none;
}
.h2h__who:hover {
  text-decoration: none;
  color: var(--ss-text);
}
.h2h__name {
  font-weight: 700;
}
.h2h__sub {
  font-size: 13px;
  color: var(--ss-text-muted);
}
.h2h__bars {
  flex: 2 1 240px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.h2h__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.h2h__lbl {
  width: 44px;
  color: var(--ss-text-muted);
}
.h2h__track {
  flex: 1;
  height: 8px;
  border-radius: 8px;
  background: var(--ss-surface-2);
  overflow: hidden;
}
.h2h__fill {
  height: 100%;
  border-radius: 8px;
  transition: width 600ms var(--ss-ease);
}
.h2h__bar b {
  width: 32px;
  text-align: right;
}
</style>
