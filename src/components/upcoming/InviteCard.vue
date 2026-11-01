<script setup lang="ts">
// A friend's invite you haven't answered: I'm in / Interested / Can't make it / Details.
import { computed } from "vue";
import { SsAvatar } from "@/design-system";
import { firstName, longDate } from "@/lib/format";
import { crewSummary } from "@/lib/upcoming";
import type { PlanItem } from "@/lib/types";

const props = defineProps<{ item: PlanItem; busy?: boolean }>();
const emit = defineEmits<{ respond: [status: "going" | "interested" | "cant"] }>();

const e = computed(() => props.item.event);
const from = computed(() => props.item.invited_by);
const fromName = computed(() => (from.value ? firstName(from.value.display_name, from.value.handle) : "A friend"));
</script>

<template>
  <div class="invite">
    <div class="invite__head">
      <SsAvatar :name="from?.display_name || from?.handle || '?'" :path="from?.avatar_path" :size="44" />
      <div class="invite__text">
        <div class="invite__kicker">{{ fromName.toUpperCase() }} INVITED YOU</div>
        <div class="invite__artist">{{ e.artist }}</div>
        <div class="invite__when">{{ e.date_tbd ? "Date TBA" : longDate(e.local_date) }} · {{ e.venue_name }}</div>
      </div>
    </div>
    <div class="invite__note">
      <template v-if="item.note">“{{ item.note }}” · </template>{{ crewSummary(item.crew) }}
    </div>
    <div class="invite__actions">
      <button type="button" class="ib ib--yes" :disabled="busy" @click="emit('respond', 'going')">I’m in</button>
      <button type="button" class="ib ib--maybe" :disabled="busy" @click="emit('respond', 'interested')">Interested</button>
      <button type="button" class="ib ib--no" :disabled="busy" @click="emit('respond', 'cant')">Can’t make it</button>
      <RouterLink :to="`/app/upcoming/${e.seatgeek_id}`" class="ib ib--details">Details</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.invite {
  padding: 18px;
  border-radius: var(--ss-radius-lg);
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.invite__head { display: flex; gap: 12px; align-items: center; }
.invite__text { flex: 1; min-width: 0; }
.invite__kicker { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.14em; font-weight: 700; }
.invite__artist { font-weight: 900; font-size: 24px; line-height: 1; overflow-wrap: anywhere; }
.invite__when { font-size: 14px; font-weight: 600; }
.invite__note { font-size: 16px; font-weight: 600; font-style: italic; }
.invite__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ib {
  flex: 1 1 90px;
  height: 44px;
  border-radius: var(--ss-radius-pill);
  border: 0;
  font-weight: 900;
  font-size: 15px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}
.ib:disabled { opacity: 0.6; cursor: progress; }
.ib--yes { background: var(--ss-bg); color: var(--ss-accent); }
.ib--maybe { background: transparent; border: 2px solid var(--ss-bg); color: var(--ss-on-accent); }
.ib--no { background: transparent; color: var(--ss-on-accent); font-weight: 700; text-decoration: underline; }
.ib--details { background: rgba(10, 9, 12, 0.12); color: var(--ss-on-accent); font-weight: 700; }
.ib--details:hover { color: var(--ss-on-accent); text-decoration: none; }
</style>
