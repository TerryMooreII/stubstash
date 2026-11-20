<script setup lang="ts">
// Shown under a result right after "I was there": rate the show and tag the
// friends who came, without leaving the search. Each tap saves on its own.
import { onMounted, ref } from "vue";
import { SsAvatar, SsIcon, SsStars } from "@/design-system";
import { addCompanion, removeCompanion, social, updateAttendance } from "@/lib/api";
import { firstName } from "@/lib/format";
import { errorMessage } from "@/lib/supabase";
import type { Friend } from "@/lib/types";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const props = defineProps<{ attendanceId: string; artist: string }>();
const log = useLog();
const ui = useUi();

// ---- rating
const rating = ref<number | null>(null);
const saved = ref(false);
let ratingSeq = 0;
async function rate(v: number | null) {
  const mine = ++ratingSeq;
  rating.value = v;
  try {
    await updateAttendance(props.attendanceId, { rating: v });
    if (mine !== ratingSeq) return;
    saved.value = v != null;
    log.refresh();
  } catch (e) {
    if (mine === ratingSeq) ui.error(errorMessage(e));
  }
}

// ---- who came (friends only here; other names go through "more details")
const friends = ref<Friend[]>([]);
/** Friend id -> their companion row, once tagged. */
const tagged = ref<Record<string, string>>({});
const busy = ref<Record<string, boolean>>({});
onMounted(async () => {
  friends.value = await social.friends().catch(() => []);
});
async function toggle(f: Friend) {
  if (busy.value[f.id]) return;
  busy.value[f.id] = true;
  try {
    const row = tagged.value[f.id];
    if (row) {
      await removeCompanion(row);
      delete tagged.value[f.id];
    } else {
      tagged.value[f.id] = (await addCompanion(props.attendanceId, { name: f.display_name || f.handle, user_id: f.id })).id;
    }
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    delete busy.value[f.id];
  }
}
</script>

<template>
  <div class="logged" role="group" :aria-label="`Your night at ${artist}`">
    <div class="logged__row">
      <span class="logged__k">HOW WAS IT?</span>
      <SsStars :model-value="rating" editable :size="30" @update:model-value="rate" />
      <span v-if="saved" class="logged__saved" role="status"><SsIcon name="check" :size="14" :stroke="3" />Saved</span>
    </div>
    <div v-if="friends.length" class="logged__row">
      <span class="logged__k">WHO CAME?</span>
      <div class="logged__chips">
        <button
          v-for="f in friends"
          :key="f.id"
          type="button"
          class="logged__chip"
          :class="{ 'is-on': !!tagged[f.id] }"
          :aria-pressed="!!tagged[f.id]"
          :disabled="busy[f.id]"
          @click="toggle(f)"
        >
          <SsAvatar :name="f.display_name || f.handle" :path="f.avatar_path" :size="22" />
          {{ firstName(f.display_name, f.handle) }}
        </button>
      </div>
    </div>
    <RouterLink class="logged__more" :to="`/app/shows/${attendanceId}/edit`">Add seat, photos, notes and more →</RouterLink>
  </div>
</template>

<style scoped>
.logged {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ss-line-soft);
}
.logged__row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; }
.logged__k {
  font-family: var(--ss-font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--ss-accent);
  min-width: 86px;
}
.logged__saved { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 700; color: var(--ss-accent); }
.logged__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.logged__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 4px 4px;
  border-radius: var(--ss-radius-pill);
  border: 1px solid var(--ss-line-strong);
  background: transparent;
  color: var(--ss-text-2);
  font-weight: 700;
  font-size: 13px;
}
.logged__chip.is-on { background: var(--ss-accent); border-color: var(--ss-accent); color: var(--ss-on-accent); }
.logged__chip:disabled { opacity: 0.6; }
.logged__more { font-size: 14px; font-weight: 700; }
</style>
