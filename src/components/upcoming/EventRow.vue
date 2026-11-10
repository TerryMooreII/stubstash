<script setup lang="ts">
// One search result: date, artist photo, artist / venue / price, tags
// (friends going, seen before, this week) and Interested / Going buttons.
// Tapping the venue or the city fills them into the search (the page handles "venue" / "city").
import { computed } from "vue";
import { useRouter } from "vue-router";
import { SsArt } from "@/design-system";
import PlanToggle from "./PlanToggle.vue";
import { dateParts, firstName, parseDate } from "@/lib/format";
import { daysUntil, eventPlace, priceFrom } from "@/lib/upcoming";
import { rememberEvent } from "@/lib/eventSeed";
import type { PlanItem } from "@/lib/types";

const props = defineProps<{ item: PlanItem; busy?: boolean }>();
const emit = defineEmits<{ plan: [status: "going" | "interested" | null]; venue: []; city: [] }>();
const router = useRouter();

const e = computed(() => props.item.event);
const d = computed(() => dateParts(e.value.local_date));
const dow = computed(() => parseDate(e.value.local_date).toLocaleDateString("en-US", { weekday: "short" }));
const place = computed(() => eventPlace(e.value));
const price = computed(() => priceFrom(e.value));
const canCity = computed(() => !!e.value.city && e.value.lat != null && e.value.lng != null);

const tags = computed(() => {
  const out: { label: string; tone: "accent" | "teal" | "plain" }[] = [];
  for (const c of props.item.crew.filter((x) => x.status === "going" || x.status === "interested").slice(0, 2)) {
    out.push({ label: `${firstName(c.display_name, c.handle)} ${c.status === "going" ? "is going" : "is interested"}`, tone: "accent" });
  }
  const seen = props.item.seen ?? 0;
  out.push(seen ? { label: `Seen ${seen}×`, tone: "plain" } : { label: "Never seen live", tone: "teal" });
  if (e.value.status === "cancelled") out.push({ label: "Cancelled", tone: "plain" });
  else if (e.value.status === "postponed") out.push({ label: "Postponed", tone: "plain" });
  else if (daysUntil(e.value.local_date) <= 7) out.push({ label: "This week", tone: "plain" });
  return out;
});

const open = () => {
  rememberEvent(props.item);
  router.push(`/app/upcoming/${e.value.seatgeek_id}`);
};
</script>

<template>
  <div class="ev-row" role="link" tabindex="0" @click="open" @keydown.enter="open">
    <div class="ev-row__date">
      <div class="ev-row__mon">{{ d.mon }}</div>
      <div class="ev-row__day">{{ d.day }}</div>
      <div class="ev-row__dow">{{ e.date_tbd ? "TBA" : dow }}</div>
    </div>
    <SsArt :src="e.image_url" :seed="e.artist" shape="circle" class="ev-row__art" />
    <div class="ev-row__text">
      <div class="ev-row__artist">{{ e.artist }}</div>
      <div class="ev-row__line">
        <button type="button" class="ev-row__link" :aria-label="`Search shows at ${e.venue_name}`" @click.stop="emit('venue')" @keydown.enter.stop>{{ e.venue_name }}</button>
        <template v-if="place">
          ·
          <button v-if="canCity" type="button" class="ev-row__link" :aria-label="`Shows near ${place}`" @click.stop="emit('city')" @keydown.enter.stop>{{ place }}</button>
          <span v-else>{{ place }}</span>
        </template>
        <template v-if="price"> · {{ price }}</template>
      </div>
      <div class="ev-row__tags">
        <span v-for="t in tags" :key="t.label" class="tag" :class="`tag--${t.tone}`">{{ t.label }}</span>
      </div>
    </div>
    <PlanToggle :status="item.status" :busy="busy" @set="(s) => emit('plan', s)" />
  </div>
</template>

<style scoped>
.ev-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line-soft);
  cursor: pointer;
}
.ev-row:hover { border-color: var(--ss-line); }
.ev-row__date { width: 52px; text-align: center; flex-shrink: 0; }
.ev-row__mon { font-family: var(--ss-font-mono); font-size: 11px; color: var(--ss-accent); }
.ev-row__day { font-weight: 900; font-size: 26px; line-height: 1; }
.ev-row__dow { font-size: 12px; color: var(--ss-text-muted); }
.ev-row__art { width: 52px; height: 52px; }
.ev-row__text { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ev-row__artist { font-weight: 900; font-size: 18px; line-height: 1.1; overflow-wrap: anywhere; }
.ev-row__line { font-size: 14px; color: var(--ss-text-3); }
.ev-row__link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--ss-line);
  text-underline-offset: 3px;
  cursor: pointer;
}
.ev-row__link:hover { color: var(--ss-text); text-decoration-color: currentColor; }
.ev-row__tags { display: flex; gap: 6px; flex-wrap: wrap; }
.tag { padding: 2px 8px; border-radius: var(--ss-radius-xs); font-size: 12px; font-weight: 700; }
.tag--accent { background: var(--ss-accent-soft); color: var(--ss-accent); }
.tag--teal { background: rgba(118, 169, 185, 0.18); color: var(--ss-teal-light); }
.tag--plain { background: var(--ss-surface-3); color: var(--ss-text-2); }
</style>
