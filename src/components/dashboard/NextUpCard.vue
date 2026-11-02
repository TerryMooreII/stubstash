<script setup lang="ts">
// Dashboard "Next up": your next show (going, else interested) with a countdown
// and who's coming, plus a line for invites waiting on you. With no plans it
// can show a small "find shows" prompt instead.
import { computed, onMounted, shallowRef } from "vue";
import { SsIcon } from "@/design-system";
import CrewAvatars from "@/components/upcoming/CrewAvatars.vue";
import { upcoming } from "@/lib/api";
import { dateParts, firstName, plural } from "@/lib/format";
import { crewSummary, daysUntil } from "@/lib/upcoming";
import { rememberEvent } from "@/lib/eventSeed";
import type { PlanItem } from "@/lib/types";

const props = defineProps<{ promptWhenEmpty?: boolean; homeCity?: string | null }>();

const plans = shallowRef<PlanItem[] | null>(null);
onMounted(async () => {
  plans.value = await upcoming.myPlans().catch(() => []);
});

const ahead = computed(() => (plans.value ?? []).filter((p) => !p.event.date_tbd && daysUntil(p.event.local_date) >= 0));
const next = computed(() => ahead.value.find((p) => p.status === "going") ?? ahead.value.find((p) => p.status === "interested") ?? null);
const invites = computed(() => ahead.value.filter((p) => p.status === "invited"));
const days = computed(() => (next.value ? daysUntil(next.value.event.local_date) : 0));
const d = computed(() => (next.value ? dateParts(next.value.event.local_date) : null));
const inviteText = computed(() => {
  const first = invites.value[0];
  if (!first) return "";
  if (invites.value.length > 1) return `${plural(invites.value.length, "invite")} waiting on you`;
  const who = first.invited_by ? firstName(first.invited_by.display_name, first.invited_by.handle) : "A friend";
  return `${who} invited you to ${first.event.artist}`;
});
const showPrompt = computed(() => props.promptWhenEmpty && plans.value !== null && !next.value && !invites.value.length);
</script>

<template>
  <div v-if="next || invites.length || showPrompt" class="next-up">
    <RouterLink v-if="next && d" :to="`/app/upcoming/${next.event.seatgeek_id}`" class="next" @click="rememberEvent(next)">
      <div class="next__cd">
        <div class="next__n">{{ days === 0 ? "!" : days }}</div>
        <div class="next__lbl">{{ days === 0 ? "TONIGHT" : days === 1 ? "DAY" : "DAYS" }}</div>
      </div>
      <div class="next__text">
        <div class="next__kicker">
          {{ next.status === "going" ? "NEXT UP" : "ON YOUR LIST" }} · {{ d.mon }} {{ Number(d.day) }}
        </div>
        <div class="next__artist">{{ next.event.artist }}</div>
        <div class="next__sub">{{ next.event.venue_name }} · {{ crewSummary(next.crew) }}</div>
      </div>
      <div class="next__end">
        <CrewAvatars :crew="next.crew" :size="30" />
        <span class="next__go">Plans →</span>
      </div>
    </RouterLink>

    <RouterLink v-if="invites.length" to="/app/upcoming" class="line line--accent">
      <SsIcon name="calendar" :size="18" />
      <span class="line__text">{{ inviteText }}</span>
      <span class="line__go">Answer →</span>
    </RouterLink>

    <RouterLink v-if="showPrompt" to="/app/upcoming" class="line">
      <SsIcon name="calendar" :size="18" />
      <span class="line__text">Nothing on the calendar. See who’s playing {{ homeCity ? `near ${homeCity}` : "near you" }}.</span>
      <span class="line__go">Find shows →</span>
    </RouterLink>
  </div>
</template>

<style scoped>
.next-up { display: flex; flex-direction: column; gap: 8px; }
.next {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 14px 16px;
  border-radius: var(--ss-radius-lg);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  color: var(--ss-text);
  text-decoration: none;
}
.next:hover { text-decoration: none; color: var(--ss-text); border-color: var(--ss-line-strong); }
.next__cd {
  padding: 8px 12px;
  min-width: 58px;
  border-radius: 10px;
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  text-align: center;
  flex-shrink: 0;
}
.next__n { font-weight: 900; font-size: 28px; line-height: 0.9; }
.next__lbl { font-family: var(--ss-font-mono); font-size: 9px; letter-spacing: 0.12em; font-weight: 700; }
.next__text { flex: 1 1 200px; min-width: 0; }
.next__kicker { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.14em; color: var(--ss-accent); }
.next__artist { font-weight: 900; font-size: 20px; line-height: 1.1; overflow-wrap: anywhere; }
.next__sub { font-size: 14px; color: var(--ss-text-3); }
.next__end { display: flex; align-items: center; gap: 10px; }
.next__go, .line__go { color: var(--ss-accent); font-weight: 700; white-space: nowrap; }
.next__go { padding-left: 8px; }

.line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-1);
  border: 1px dashed var(--ss-line-strong);
  color: var(--ss-text-2);
  font-size: 14px;
  text-decoration: none;
}
.line:hover { text-decoration: none; color: var(--ss-text); }
.line--accent { background: var(--ss-accent-soft); border: 1px solid var(--ss-accent); color: var(--ss-text); font-weight: 700; }
.line__text { flex: 1; min-width: 0; }
</style>
