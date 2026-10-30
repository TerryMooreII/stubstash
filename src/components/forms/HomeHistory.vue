<script setup lang="ts">
// "Places you've lived": when you moved to your current home, plus earlier
// homes. Each show's miles are measured from wherever you lived that night.
import { computed, onMounted, ref } from "vue";
import { SsButton, SsIcon } from "@/design-system";
import MonthYearPicker from "@/components/forms/MonthYearPicker.vue";
import PlaceSearch from "@/components/forms/PlaceSearch.vue";
import { addPastHome, deletePastHome, listPastHomes, setPastHomeMovedIn } from "@/lib/api";
import type { PlaceResult } from "@/lib/geocode";
import type { PastHome } from "@/lib/types";
import { errorMessage } from "@/lib/supabase";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

const auth = useAuth();
const ui = useUi();

const past = ref<PastHome[]>([]);
const loading = ref(true);
onMounted(async () => {
  try {
    past.value = await listPastHomes();
  } catch (err) {
    ui.error(errorMessage(err));
  } finally {
    loading.value = false;
  }
});

const sorted = computed(() =>
  [...past.value].sort((a, b) => (b.moved_in ?? "").localeCompare(a.moved_in ?? "")),
);
const currentCity = computed(() => auth.profile?.home_city ?? null);
const since = computed(() => auth.profile?.home_since ?? null);

function monthLabel(d: string): string {
  const [y, m] = d.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** Problems with a set of dates, or null when they make sense. */
function check(homeSince: string | null, homes: { id?: string; moved_in: string | null }[]): string | null {
  if (homes.filter((h) => !h.moved_in).length > 1) return "Only your oldest home can skip the date.";
  const dated = homes.map((h) => h.moved_in).filter((d): d is string => !!d);
  if (new Set(dated).size < dated.length) return "Two homes can't share a move-in month.";
  if (homeSince && dated.some((d) => d >= homeSince)) {
    return `Past homes need to be before you moved to ${currentCity.value ?? "your current home"}.`;
  }
  return null;
}

// ---------------------------------------------------------------- current home date
const savingSince = ref(false);
async function setSince(v: string | null) {
  const problem = check(v, past.value);
  if (problem) return ui.error(problem);
  savingSince.value = true;
  try {
    await auth.saveProfile({ home_since: v });
  } catch (err) {
    ui.error(errorMessage(err));
  } finally {
    savingSince.value = false;
  }
}

// ---------------------------------------------------------------- past homes
async function setMovedIn(h: PastHome, v: string | null) {
  const next = past.value.map((x) => (x.id === h.id ? { ...x, moved_in: v } : x));
  const problem = check(since.value, next);
  if (problem) return ui.error(problem);
  const before = h.moved_in;
  h.moved_in = v;
  try {
    await setPastHomeMovedIn(h.id, v);
  } catch (err) {
    h.moved_in = before;
    ui.error(errorMessage(err));
  }
}

async function remove(h: PastHome) {
  if (!confirm(`Remove ${h.city} from places you've lived?`)) return;
  try {
    await deletePastHome(h.id);
    past.value = past.value.filter((x) => x.id !== h.id);
    ui.flash(`Removed ${h.city}`, "info");
  } catch (err) {
    ui.error(errorMessage(err));
  }
}

// Adding: pick a city, then a move-in date (optional for the oldest home).
const adding = ref(false);
const draftPlace = ref<PlaceResult | null>(null);
const draftDate = ref<string | null>(null);
const savingDraft = ref(false);

function startAdd() {
  adding.value = true;
  draftPlace.value = null;
  draftDate.value = null;
}

async function saveDraft() {
  const p = draftPlace.value;
  if (!p) return;
  const problem = check(since.value, [...past.value, { moved_in: draftDate.value }]);
  if (problem) return ui.error(problem);
  savingDraft.value = true;
  try {
    const row = await addPastHome({
      city: p.label,
      lat: p.lat,
      lng: p.lng,
      country_code: p.country_code ? p.country_code.toUpperCase() : null,
      moved_in: draftDate.value,
    });
    past.value = [...past.value, row];
    adding.value = false;
    ui.flash(`Added ${p.label}`);
  } catch (err) {
    ui.error(errorMessage(err));
  } finally {
    savingDraft.value = false;
  }
}
</script>

<template>
  <div class="hh">
    <div class="hh__head">
      <div class="hh__title">Places you've lived</div>
      <p class="hh__note">Moved around? Add earlier homes so each show's miles count from where you lived then.</p>
    </div>

    <p v-if="!currentCity" class="hh__note">Set your current home above first.</p>

    <template v-else>
      <div class="home">
        <div class="home__name">
          <SsIcon name="home" :size="16" />
          <span class="home__city">{{ currentCity }}</span>
          <span class="home__tag">Now</span>
        </div>
        <div class="home__when">
          <span class="home__k">Moved here</span>
          <MonthYearPicker
            :model-value="since"
            label="Moved here"
            :blank-year="past.length ? 'Year' : 'Always'"
            @update:model-value="setSince"
          />
        </div>
      </div>
      <p v-if="past.length && !since" class="hh__warn">
        Set when you moved to {{ currentCity }}. Until then, every show still counts from there.
      </p>

      <div v-for="h in sorted" :key="h.id" class="home">
        <div class="home__name">
          <SsIcon name="pin" :size="16" />
          <span class="home__city">{{ h.city }}</span>
          <button type="button" class="home__x" :aria-label="`Remove ${h.city}`" @click="remove(h)">
            <SsIcon name="trash" :size="16" />
          </button>
        </div>
        <div class="home__when">
          <span class="home__k">Moved there</span>
          <MonthYearPicker
            :model-value="h.moved_in"
            :label="`Moved to ${h.city}`"
            blank-year="Before that"
            @update:model-value="(v) => setMovedIn(h, v)"
          />
        </div>
      </div>

      <div v-if="adding" class="add">
        <template v-if="!draftPlace">
          <PlaceSearch placeholder="Search for a city you lived in" @pick="(p) => (draftPlace = p)" />
        </template>
        <template v-else>
          <div class="home__name">
            <SsIcon name="pin" :size="16" /><span class="home__city">{{ draftPlace.label }}</span>
          </div>
          <div class="home__when">
            <span class="home__k">Moved there</span>
            <MonthYearPicker v-model="draftDate" :label="`Moved to ${draftPlace.label}`" blank-year="Before that" />
          </div>
          <p class="hh__note hh__note--sm">Leave the year blank for the oldest place you want to count.</p>
        </template>
        <div class="add__actions">
          <SsButton variant="ghost" size="sm" @click="adding = false">Cancel</SsButton>
          <SsButton v-if="draftPlace" size="sm" :loading="savingDraft" @click="saveDraft">Save</SsButton>
        </div>
      </div>
      <SsButton v-else-if="!loading" variant="outline" size="sm" @click="startAdd">
        <SsIcon name="plus" :size="16" /> Add a place you lived before
      </SsButton>

      <p v-if="since && past.length" class="hh__note hh__note--sm">
        {{ currentCity }} since {{ monthLabel(since) }}.
      </p>
    </template>
  </div>
</template>

<style scoped>
.hh {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--ss-line-soft);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hh__title {
  font-weight: 700;
}
.hh__note {
  font-size: 14px;
  color: var(--ss-text-muted);
  line-height: 1.45;
  margin: 4px 0 0;
}
.hh__note--sm {
  font-size: 13px;
}
.hh__warn {
  font-size: 13px;
  color: var(--ss-accent);
  margin: -4px 0 0;
}
.home,
.add {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: var(--ss-surface-0);
  border: 1px solid var(--ss-line-soft);
}
.home__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  min-width: 0;
}
.home__city {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.home__tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ss-accent);
}
.home__x {
  border: 0;
  background: transparent;
  color: var(--ss-text-muted);
  padding: 4px;
  display: inline-flex;
}
.home__x:hover {
  color: var(--ss-danger);
}
.home__when {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px;
}
.home__k {
  font-size: 13px;
  color: var(--ss-text-muted);
}
.add__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
