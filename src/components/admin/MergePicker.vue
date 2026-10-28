<script setup lang="ts">
// Merge a duplicate artist or venue into another one: search for the target,
// confirm, then move all shows and delete the duplicate.
import { ref, watch } from "vue";
import { SsButton, SsInput, SsSheet, SsSpinner } from "@/design-system";
import { errorMessage } from "@/lib/supabase";
import { num } from "@/lib/format";
import { useUi } from "@/stores/ui";

export interface MergeItem {
  id: string;
  name: string;
  sub?: string | null;
  shows: number;
}

const open = defineModel<boolean>({ default: false });
const props = defineProps<{
  noun: "artist" | "venue";
  from: MergeItem | null;
  search: (q: string) => Promise<MergeItem[]>;
  merge: (from: string, into: string) => Promise<number>;
}>();
const emit = defineEmits<{ merged: [moved: number] }>();
const ui = useUi();

const q = ref("");
const results = ref<MergeItem[]>([]);
const searching = ref(false);
const target = ref<MergeItem | null>(null);
const busy = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

watch(open, (v) => {
  if (v) {
    q.value = props.from?.name ?? "";
    target.value = null;
    results.value = [];
    runSearch();
  }
});

watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(runSearch, 300);
});

async function runSearch() {
  const term = q.value.trim();
  const mine = ++seq;
  if (term.length < 2) { results.value = []; return; }
  searching.value = true;
  try {
    const list = await props.search(term);
    if (mine !== seq) return;
    results.value = list.filter((x) => x.id !== props.from?.id);
  } catch (e) {
    if (mine === seq) ui.error(errorMessage(e));
  } finally {
    if (mine === seq) searching.value = false;
  }
}

async function confirm() {
  if (!props.from || !target.value) return;
  busy.value = true;
  try {
    const moved = await props.merge(props.from.id, target.value.id);
    ui.flash(`Merged. ${num(moved)} show${moved === 1 ? "" : "s"} moved to ${target.value.name}.`);
    emit("merged", moved);
    open.value = false;
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SsSheet v-model="open" :label="`Merge ${noun}`" :width="520">
    <div v-if="from" class="merge">
      <h2 class="ss-h2">Merge “{{ from.name }}”</h2>

      <template v-if="!target">
        <p class="ss-muted">
          Move all shows from <b>{{ from.name }}</b> onto another {{ noun }}, then delete {{ from.name }}.
          Pick the {{ noun }} to keep.
        </p>
        <SsInput v-model="q" icon="search" :placeholder="`Search ${noun}s`" clearable autofocus />
        <div class="list">
          <div v-if="searching" class="center"><SsSpinner :size="18" /></div>
          <button v-for="r in results" v-else :key="r.id" type="button" class="opt" @click="target = r">
            <span class="opt__name">{{ r.name }}</span>
            <span class="opt__sub">
              <template v-if="r.sub">{{ r.sub }} · </template>{{ num(r.shows) }} show{{ r.shows === 1 ? "" : "s" }}
            </span>
          </button>
          <p v-if="!searching && q.trim().length >= 2 && !results.length" class="ss-muted">No other {{ noun }}s match.</p>
        </div>
        <div class="actions">
          <SsButton variant="ghost" @click="open = false">Cancel</SsButton>
        </div>
      </template>

      <template v-else>
        <div class="confirm">
          <div class="side side--from">
            <div class="side__k">Delete</div>
            <div class="side__name">{{ from.name }}</div>
            <div class="side__sub"><template v-if="from.sub">{{ from.sub }} · </template>{{ num(from.shows) }} show{{ from.shows === 1 ? "" : "s" }}</div>
          </div>
          <div class="arrow" aria-hidden="true">→</div>
          <div class="side side--into">
            <div class="side__k">Keep</div>
            <div class="side__name">{{ target.name }}</div>
            <div class="side__sub"><template v-if="target.sub">{{ target.sub }} · </template>{{ num(target.shows) }} show{{ target.shows === 1 ? "" : "s" }}</div>
          </div>
        </div>
        <p class="ss-muted">
          {{ num(from.shows) }} show{{ from.shows === 1 ? "" : "s" }} will move to {{ target.name }}. Missing details
          (image, ids, pin) are copied over. This can't be undone.
        </p>
        <div class="actions">
          <SsButton variant="ghost" :disabled="busy" @click="target = null">Back</SsButton>
          <SsButton variant="danger" :loading="busy" @click="confirm">Merge and delete {{ from.name }}</SsButton>
        </div>
      </template>
    </div>
  </SsSheet>
</template>

<style scoped>
.merge { display: flex; flex-direction: column; gap: 14px; }
.list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
.center { display: flex; justify-content: center; padding: 16px; }
.opt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--ss-radius-sm);
  border: 1px solid var(--ss-line);
  background: var(--ss-surface-1);
  color: var(--ss-text);
  text-align: left;
  min-width: 0;
}
.opt:hover { border-color: var(--ss-accent); }
.opt__name { font-weight: 800; overflow-wrap: anywhere; }
.opt__sub { font-size: 13px; color: var(--ss-text-muted); }
.confirm { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.side {
  flex: 1 1 160px;
  min-width: 0;
  padding: 12px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
}
.side--from { border-color: var(--ss-danger); }
.side--into { border-color: var(--ss-accent); }
.side__k { font-family: var(--ss-font-mono); font-size: 11px; letter-spacing: 0.1em; color: var(--ss-text-muted); text-transform: uppercase; }
.side__name { font-weight: 900; font-size: 18px; overflow-wrap: anywhere; }
.side__sub { font-size: 13px; color: var(--ss-text-muted); }
.arrow { font-size: 22px; font-weight: 900; color: var(--ss-text-muted); }
.actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
