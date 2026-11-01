<script setup lang="ts">
// One upcoming show (from SeatGeek): countdown, your Going / Interested / Can't go,
// the friends coming, invites, and a link to tickets. After the night it offers
// to log the show (the morning-after notification links here with ?log=1).
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsArt, SsAvatar, SsBackLink, SsButton, SsCard, SsEmpty, SsIcon, SsSkeleton } from "@/design-system";
import InviteSheet from "@/components/upcoming/InviteSheet.vue";
import StatusPill from "@/components/upcoming/StatusPill.vue";
import { upcoming } from "@/lib/api";
import { firstName, longDate, num } from "@/lib/format";
import { appUrl } from "@/lib/url";
import { STATUS_SUB, countdown, crewSummary, daysUntil, eventPlace, logQuery, showTime } from "@/lib/upcoming";
import type { PlanItem } from "@/lib/types";
import { useAction } from "@/composables/useAction";
import { useAsyncData } from "@/composables/useAsyncData";
import { useShareLink } from "@/composables/useShareLink";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

const props = defineProps<{ id: string }>();
const route = useRoute();
const router = useRouter();
const auth = useAuth();
const ui = useUi();

const sgId = computed(() => Number(props.id));
const { data, loading, error, reload } = useAsyncData(() => upcoming.event(sgId.value), { watch: () => props.id });
/** Local copy so plan changes show straight away. */
const item = ref<PlanItem | null>(null);
watch(data, (d) => (item.value = d));

const e = computed(() => item.value?.event ?? null);
const days = computed(() => (e.value ? daysUntil(e.value.local_date) : 0));
const past = computed(() => !!e.value && days.value < 0);
const cancelled = computed(() => e.value?.status === "cancelled");
const lineup = computed(() => (e.value ? e.value.performers.filter((p) => p !== e.value!.artist) : []));
const when = computed(() => {
  if (!e.value) return "";
  const t = showTime(e.value.local_time);
  return [e.value.date_tbd ? "Date TBA" : longDate(e.value.local_date), t && `Show ${t}`].filter(Boolean).join(" · ");
});
const mapsUrl = computed(() => {
  if (!e.value) return null;
  const q = e.value.lat != null && e.value.lng != null
    ? `${e.value.lat},${e.value.lng}`
    : [e.value.venue_name, eventPlace(e.value)].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
});
const canInvite = computed(() => !past.value && (item.value?.status === "going" || item.value?.status === "interested"));

// The morning-after notification: go straight to finding the setlist.
watch(e, (ev) => {
  if (ev && route.query.log === "1" && daysUntil(ev.local_date) < 0) {
    router.replace({ path: "/app/log", query: logQuery(ev) });
  }
});

const OPTIONS = [
  { value: "going", label: "Going" },
  { value: "interested", label: "Interested" },
  { value: "cant", label: "Can’t go" },
] as const;

const { run: setPlan, busy } = useAction(async (status: "going" | "interested" | "cant") => {
  if (!item.value) return;
  const next = item.value.status === status && status !== "cant" ? null : status;
  const wasInvited = item.value.status === "invited" && item.value.invited_by;
  item.value = { ...(await upcoming.setPlan(sgId.value, next)), seen: item.value.seen };
  if (wasInvited) ui.flash(`${firstName(wasInvited.display_name, wasInvited.handle)} will get your answer`);
  else if (next === "going") ui.flash("You’re going!");
  else if (next === "interested") ui.flash("Saved to your plans");
});

const inviteOpen = ref(false);
async function invited() {
  if (!item.value?.event.id) return;
  const fresh = await upcoming.plan(item.value.event.id).catch(() => null);
  if (fresh) item.value = { ...fresh, seen: item.value.seen };
}

const { canShare, copy, share } = useShareLink();
const link = computed(() => appUrl(`/app/upcoming/${props.id}`));
function shareEvent() {
  if (!e.value) return;
  const text = `${e.value.artist} · ${longDate(e.value.local_date)} at ${e.value.venue_name}. You in?`;
  if (canShare) share({ title: e.value.artist, text, url: link.value });
  else copy(link.value, "Show link copied");
}
</script>

<template>
  <div class="ss-page">
    <SsBackLink fallback="/app/upcoming" label="Upcoming" />

    <template v-if="loading && !item">
      <SsSkeleton height="340px" />
      <SsSkeleton height="58px" />
    </template>
    <SsEmpty v-else-if="error && !item" title="Couldn’t load this show" :body="error">
      <SsButton variant="outline" size="sm" @click="reload">Try again</SsButton>
    </SsEmpty>

    <template v-else-if="item && e">
      <!-- Hero -->
      <SsArt :src="e.image_url" :seed="e.artist" :alt="e.artist" :credit="e.image_credit" credit-label="Artist image" focus="top" eager class="hero">
        <div class="hero__cd">
          <div class="hero__days">{{ past ? "✓" : e.date_tbd ? "?" : days }}</div>
          <div class="hero__days-lbl">{{ past ? countdown(e.local_date) : e.date_tbd ? "DATE TBA" : days === 1 ? "DAY TO GO" : days === 0 ? "TONIGHT" : "DAYS TO GO" }}</div>
        </div>
        <div class="hero__body">
          <div class="ss-hero hero__artist">{{ e.artist }}</div>
          <div class="hero__line">{{ when }}</div>
          <div class="hero__line hero__venue">{{ [e.venue_name, eventPlace(e)].filter(Boolean).join(" · ") }}</div>
          <div v-if="lineup.length" class="hero__lineup">With {{ lineup.join(", ") }}</div>
        </div>
      </SsArt>

      <div v-if="cancelled" class="banner banner--warn">SeatGeek lists this show as cancelled.</div>
      <div v-else-if="e.status === 'postponed'" class="banner banner--warn">SeatGeek lists this show as postponed. Check the new date before you plan.</div>

      <!-- Invited, not answered yet -->
      <div v-if="item.status === 'invited' && item.invited_by" class="banner">
        <SsAvatar :name="item.invited_by.display_name || item.invited_by.handle" :path="item.invited_by.avatar_path" :size="36" />
        <span>
          <b>{{ firstName(item.invited_by.display_name, item.invited_by.handle) }} invited you.</b>
          <template v-if="item.note"> “{{ item.note }}”</template>
        </span>
      </div>

      <!-- After the show -->
      <SsCard v-if="past" tone="accent" class="log">
        <div>
          <div class="ss-h3">{{ item.status === "going" ? "How was it?" : "Were you there?" }}</div>
          <div>Find the setlist on setlist.fm and add the show to your stash.</div>
        </div>
        <SsButton variant="dark" :to="{ path: '/app/log', query: logQuery(e) }"><SsIcon name="plus" :size="16" />Log this show</SsButton>
      </SsCard>

      <!-- Your answer -->
      <div v-else class="switch" role="group" aria-label="Your plan">
        <button
          v-for="o in OPTIONS"
          :key="o.value"
          type="button"
          class="switch__opt"
          :class="[`is-${o.value}`, { 'is-on': item.status === o.value }]"
          :aria-pressed="item.status === o.value"
          :disabled="busy || cancelled"
          @click="setPlan(o.value)"
        >
          {{ item.status === o.value && o.value === "going" ? "✓ Going" : o.label }}
        </button>
      </div>

      <div class="grid">
        <!-- The crew -->
        <SsCard class="crew">
          <div class="ss-between crew__head">
            <div class="ss-h3">The crew</div>
            <span class="ss-muted">{{ item.crew.length ? crewSummary(item.crew) : "No friends yet" }}</span>
          </div>
          <div class="who">
            <SsAvatar :name="auth.displayName" :path="auth.profile?.avatar_path" me :size="40" />
            <div class="who__name">You</div>
            <StatusPill :status="item.status" />
          </div>
          <RouterLink v-for="c in item.crew" :key="c.user_id" :to="`/u/${c.handle}`" class="who">
            <SsAvatar :name="c.display_name || c.handle" :path="c.avatar_path" :size="40" />
            <div class="who__text">
              <div class="who__name ss-truncate">{{ c.display_name || "@" + c.handle }}</div>
              <div class="who__sub">{{ c.invited_by_me && c.status === "invited" ? "You invited them · no reply yet" : STATUS_SUB[c.status] }}</div>
            </div>
            <StatusPill :status="c.status" />
          </RouterLink>
          <SsButton v-if="canInvite" block @click="inviteOpen = true"><SsIcon name="plus" :size="16" />Invite friends</SsButton>
          <p v-else-if="!past" class="crew__hint">Mark yourself going or interested to invite friends.</p>
        </SsCard>

        <!-- Tickets -->
        <SsCard class="tickets">
          <div class="ss-between">
            <div class="ss-h3">Tickets</div>
            <span class="via">VIA SEATGEEK</span>
          </div>
          <div v-if="e.lowest_price" class="price">
            <span class="price__n">${{ Math.round(e.lowest_price) }}</span>
            <span class="ss-muted">lowest<template v-if="e.listing_count"> · {{ num(e.listing_count) }} listings</template></span>
          </div>
          <div v-else-if="!past" class="ss-muted">See seats and prices on SeatGeek.</div>
          <SsButton v-if="e.ticket_url && !past" variant="light" :href="e.ticket_url" block>
            Get tickets on SeatGeek <SsIcon name="external" :size="16" />
          </SsButton>
          <SsButton variant="outline" block @click="shareEvent">
            <SsIcon name="share" :size="16" />{{ canShare ? "Share this show" : "Copy show link" }}
          </SsButton>
          <p v-if="e.lowest_price" class="fine">Prices change often. SeatGeek has the latest.</p>
        </SsCard>

        <!-- The venue -->
        <section class="venue">
          <SsArt
            :src="e.venue_image_url"
            :seed="e.venue_name"
            :alt="e.venue_name"
            :credit="e.venue_image_credit"
            credit-label="Venue image"
            class="venue__art"
          />
          <div class="venue__body">
            <div class="ss-kicker">THE VENUE</div>
            <div class="ss-h3 venue__name">{{ e.venue_name }}</div>
            <div class="ss-muted">{{ eventPlace(e) }}</div>
            <SsButton v-if="mapsUrl" variant="outline" size="sm" :href="mapsUrl"><SsIcon name="pin" :size="16" />Directions</SsButton>
          </div>
        </section>
      </div>

      <InviteSheet v-model="inviteOpen" :item="item" @done="invited" />
    </template>
  </div>
</template>

<style scoped>
.hero {
  border-radius: var(--ss-radius-xl);
  min-height: 340px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.hero__cd {
  position: relative;
  z-index: 1;
  align-self: flex-start;
  margin: 14px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--ss-bg);
  text-align: center;
}
.hero__days { font-weight: 900; font-size: 36px; line-height: 0.9; color: var(--ss-accent); }
.hero__days-lbl { font-family: var(--ss-font-mono); font-size: 9px; letter-spacing: 0.14em; color: var(--ss-text-2); }
.hero__body {
  position: relative;
  z-index: 1;
  padding: 24px;
  background: linear-gradient(180deg, transparent, rgba(10, 9, 12, 0.92) 55%);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hero__artist { color: #fff; overflow-wrap: anywhere; }
.hero__line { font-size: 18px; font-weight: 600; color: var(--ss-text-2); }
.hero__venue { font-weight: 700; }
.hero__lineup { font-size: 14px; color: var(--ss-text-3); }

.banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-accent-soft);
  color: var(--ss-text);
}
.banner--warn { background: var(--ss-danger-soft); }

.log { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }

.switch {
  display: flex;
  gap: 8px;
  padding: 6px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line-soft);
}
.switch__opt {
  flex: 1;
  height: 46px;
  border-radius: var(--ss-radius-pill);
  border: 0;
  background: transparent;
  color: var(--ss-text-3);
  font-weight: 900;
  font-size: 15px;
  cursor: pointer;
}
.switch__opt:disabled { cursor: default; opacity: 0.7; }
.switch__opt.is-on { color: var(--ss-on-accent); }
.switch__opt.is-going.is-on { background: var(--ss-accent); }
.switch__opt.is-interested.is-on { background: var(--ss-teal); }
.switch__opt.is-cant.is-on { background: var(--ss-surface-3); color: var(--ss-text); }

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 14px; align-items: start; }
.crew, .tickets { display: flex; flex-direction: column; gap: 12px; }
.crew__head { align-items: baseline; gap: 10px; }
.who {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--ss-line-soft);
  color: var(--ss-text);
  text-decoration: none;
}
a.who:hover { text-decoration: none; color: var(--ss-accent); }
.who__text { flex: 1; min-width: 0; }
.who > .who__name { flex: 1; }
.who__name { font-weight: 700; }
.who__sub { font-size: 12px; color: var(--ss-text-faint); }
.crew__hint { margin: 0; font-size: 13px; color: var(--ss-text-muted); }
.via { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.1em; color: var(--ss-text-faint); }
.price { display: flex; align-items: baseline; gap: 10px; }
.price__n { font-weight: 900; font-size: 44px; line-height: 1; }
.fine { margin: 0; font-size: 12px; color: var(--ss-text-faint); }
.venue {
  display: flex;
  flex-direction: column;
  border-radius: var(--ss-radius-lg);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line-soft);
  overflow: hidden;
}
.venue__art { height: 180px; }
.venue__body { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.venue__name { overflow-wrap: anywhere; }
</style>
