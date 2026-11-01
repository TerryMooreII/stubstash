<script setup lang="ts">
// "Your plans" card: artist art with a countdown and your status, then the
// date, artist, venue and who else is coming.
import { computed } from "vue";
import { SsArt } from "@/design-system";
import CrewAvatars from "./CrewAvatars.vue";
import StatusPill from "./StatusPill.vue";
import { dateParts } from "@/lib/format";
import { countdown, crewSummary, eventPlace } from "@/lib/upcoming";
import type { PlanItem } from "@/lib/types";

const props = defineProps<{ item: PlanItem }>();
const e = computed(() => props.item.event);
const d = computed(() => dateParts(e.value.local_date));
</script>

<template>
  <RouterLink :to="`/app/upcoming/${e.seatgeek_id}`" class="plan-card">
    <SsArt :src="e.image_url" :seed="e.artist" focus="top" class="plan-card__art">
      <div class="plan-card__pills">
        <span class="plan-card__cd">{{ e.date_tbd ? "DATE TBA" : countdown(e.local_date) }}</span>
        <StatusPill :status="item.status" />
      </div>
    </SsArt>
    <div class="plan-card__body">
      <div class="plan-card__date">{{ d.mon }} {{ d.day }} · {{ d.yr }}</div>
      <div class="plan-card__artist">{{ e.artist }}</div>
      <div class="plan-card__venue">{{ [e.venue_name, eventPlace(e)].filter(Boolean).join(" · ") }}</div>
      <div class="plan-card__crew">
        <CrewAvatars :crew="item.crew" />
        <span>{{ crewSummary(item.crew) }}</span>
      </div>
    </div>
  </RouterLink>
</template>

<style scoped>
.plan-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--ss-radius-lg);
  overflow: hidden;
  background: var(--ss-surface-1);
  color: var(--ss-text);
  text-decoration: none;
}
.plan-card:hover { text-decoration: none; color: var(--ss-text); outline: 1px solid var(--ss-line); }
.plan-card__art { height: 110px; }
.plan-card__pills {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px;
}
.plan-card__cd {
  padding: 4px 10px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-bg);
  color: var(--ss-accent);
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.04em;
}
.plan-card__body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 2px dashed var(--ss-bg);
}
.plan-card__date { font-family: var(--ss-font-mono); font-size: 11px; color: var(--ss-accent); }
.plan-card__artist { font-weight: 900; font-size: 22px; line-height: 1.05; overflow-wrap: anywhere; }
.plan-card__venue { font-size: 14px; color: var(--ss-text-3); }
.plan-card__crew { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 13px; color: var(--ss-text-muted); }
</style>
