<script setup lang="ts">
// "Who was there with you": toggle friends, or type any name.
// Names that aren't Stubstash friends get an invite link after saving.
import { computed, onMounted, ref } from "vue";
import { SsAvatar, SsIcon } from "@/design-system";
import { social } from "@/lib/api";
import type { Friend } from "@/lib/types";

export interface Companion { name: string; user_id: string | null }

const model = defineModel<Companion[]>({ default: () => [] });
const friends = ref<Friend[]>([]);
const draft = ref("");

onMounted(async () => {
  friends.value = await social.friends().catch(() => []);
});

const extras = computed(() => model.value.filter((c) => !c.user_id || !friends.value.some((f) => f.id === c.user_id)));

function isOn(f: Friend) {
  return model.value.some((c) => c.user_id === f.id);
}
function toggle(f: Friend) {
  model.value = isOn(f)
    ? model.value.filter((c) => c.user_id !== f.id)
    : [...model.value, { name: f.display_name || f.handle, user_id: f.id }];
}
function addName() {
  const n = draft.value.trim().slice(0, 60);
  if (!n) return;
  if (!model.value.some((c) => c.name.toLowerCase() === n.toLowerCase())) model.value = [...model.value, { name: n, user_id: null }];
  draft.value = "";
}
function remove(c: Companion) {
  model.value = model.value.filter((x) => x !== c);
}
</script>

<template>
  <div class="cp">
    <span class="cp__label">Who was there with you</span>
    <div class="cp__chips">
      <button
        v-for="f in friends"
        :key="f.id"
        type="button"
        class="cp__chip"
        :class="{ 'is-on': isOn(f) }"
        :aria-pressed="isOn(f)"
        @click="toggle(f)"
      >
        <SsAvatar :name="f.display_name || f.handle" :path="f.avatar_path" :size="24" />
        {{ (f.display_name || f.handle).split(" ")[0] }}
      </button>
      <span v-for="c in extras" :key="c.name" class="cp__chip is-on">
        <SsAvatar :name="c.name" :size="24" />
        {{ c.name }}
        <button type="button" class="cp__x" :aria-label="`Remove ${c.name}`" @click="remove(c)"><SsIcon name="close" :size="12" /></button>
      </span>
    </div>
    <div class="cp__add">
      <input
        v-model="draft"
        class="cp__input"
        placeholder="Add someone by name"
        maxlength="60"
        aria-label="Add someone who was there"
        @keydown.enter.prevent="addName"
      />
      <button type="button" class="cp__add-btn" :disabled="!draft.trim()" @click="addName">Add</button>
    </div>
    <span v-if="extras.length" class="cp__hint">Not on Stubstash yet? You'll get an invite link to send them after you save.</span>
  </div>
</template>

<style scoped>
.cp { display: flex; flex-direction: column; gap: 8px; }
.cp__label { font-size: 13px; font-weight: 700; color: var(--ss-text-3); }
.cp__chips { display: flex; gap: 8px; flex-wrap: wrap; }
.cp__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 5px;
  border-radius: var(--ss-radius-pill);
  border: 1px solid var(--ss-line-strong);
  background: var(--ss-surface-2);
  color: var(--ss-text);
  font-weight: 700;
  font-size: 14px;
}
.cp__chip.is-on { background: var(--ss-accent-soft); border-color: var(--ss-accent); }
.cp__x {
  border: 0;
  background: transparent;
  color: var(--ss-text-muted);
  padding: 2px;
  display: inline-flex;
}
.cp__add { display: flex; gap: 8px; }
.cp__input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  color: var(--ss-text);
  font-size: 15px;
  outline: none;
}
.cp__input:focus { border-color: var(--ss-accent); }
.cp__add-btn {
  height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-3);
  color: var(--ss-text);
  font-weight: 700;
}
.cp__add-btn:disabled { opacity: 0.5; cursor: default; }
.cp__hint { font-size: 12px; color: var(--ss-text-faint); }
</style>
