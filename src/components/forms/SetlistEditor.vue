<script setup lang="ts">
// Setlist editor: sets with songs. Type a song and hit enter; move songs up
// and down (they hop between sets at the edges); add sets and encores.
import { computed, reactive } from "vue";
import { SsButton, SsIcon } from "@/design-system";
import { addSet, addSong, canMove, moveSong, removeSet, removeSong, songNumber, totalSongs } from "@/lib/setlist";
import type { SetDraft } from "@/lib/types";
import { plural } from "@/lib/format";

const sets = defineModel<SetDraft[]>({ required: true });
const drafts = reactive<Record<number, string>>({});
const count = computed(() => totalSongs(sets.value));

function add(i: number) {
  const t = drafts[i] ?? "";
  if (!t.trim()) return;
  sets.value = addSong(sets.value, i, t);
  drafts[i] = "";
}
</script>

<template>
  <div class="sle">
    <div class="sle__head">
      <h2 class="ss-h3">Setlist</h2>
      <span class="ss-muted sle__count">{{ plural(count, "song") }}</span>
    </div>

    <div v-for="(set, i) in sets" :key="i" class="sle__set">
      <div v-if="sets.length > 1" class="sle__set-head">
        <span class="ss-kicker">{{ set.name }}</span>
        <button type="button" class="sle__icon" :aria-label="`Remove ${set.name}`" @click="sets = removeSet(sets, i)">
          <SsIcon name="trash" :size="16" />
        </button>
      </div>
      <ol class="sle__songs ss-list">
        <li v-for="(song, j) in set.songs" :key="`${i}-${j}-${song}`" class="sle__song">
          <span class="sle__n">{{ songNumber(sets, i, j) }}</span>
          <span class="sle__t">{{ song }}</span>
          <button type="button" class="sle__icon" :disabled="!canMove(sets, i, j, -1)" :aria-label="`Move ${song} up`" @click="sets = moveSong(sets, i, j, -1)">↑</button>
          <button type="button" class="sle__icon" :disabled="!canMove(sets, i, j, 1)" :aria-label="`Move ${song} down`" @click="sets = moveSong(sets, i, j, 1)">↓</button>
          <button type="button" class="sle__icon" :aria-label="`Remove ${song}`" @click="sets = removeSong(sets, i, j)">×</button>
        </li>
      </ol>
      <div class="sle__add">
        <input
          v-model="drafts[i]"
          class="sle__input"
          :placeholder="set.songs.length ? 'Add a song, hit enter' : 'First song, hit enter'"
          :aria-label="`Add a song to ${set.name}`"
          enterkeyhint="enter"
          maxlength="300"
          @keydown.enter.prevent="add(i)"
        />
        <SsButton variant="neutral" size="md" @click="add(i)">Add</SsButton>
      </div>
    </div>

    <div class="sle__more">
      <SsButton variant="ghost" size="sm" @click="sets = addSet(sets, false)">+ Add a set</SsButton>
      <SsButton variant="ghost" size="sm" @click="sets = addSet(sets, true)">+ Add encore</SsButton>
    </div>
  </div>
</template>

<style scoped>
.sle { display: flex; flex-direction: column; gap: 12px; }
.sle__head { display: flex; justify-content: space-between; align-items: baseline; }
.sle__count { font-size: 13px; }
.sle__set { display: flex; flex-direction: column; gap: 6px; }
.sle__set-head { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
.sle__song {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border-top: 1px solid var(--ss-line-soft);
}
.sle__n { font-family: var(--ss-font-mono); font-size: 11px; color: var(--ss-text-faint); width: 22px; flex-shrink: 0; }
.sle__t { flex: 1; min-width: 0; font-weight: 700; overflow-wrap: anywhere; }
.sle__icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ss-text-faint);
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.sle__icon:hover:not(:disabled) { background: var(--ss-surface-2); color: var(--ss-text); }
.sle__icon:disabled { opacity: 0.3; cursor: default; }
.sle__add { display: flex; gap: 8px; }
.sle__input {
  flex: 1;
  min-width: 0;
  height: 46px;
  padding: 0 14px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  color: var(--ss-text);
  font-size: 15px;
  outline: none;
}
.sle__input:focus { border-color: var(--ss-accent); }
.sle__more { display: flex; gap: 4px; flex-wrap: wrap; }
</style>
