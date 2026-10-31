<script setup lang="ts">
// Merge a duplicate artist or venue into another one: search for the target,
// confirm, then move all shows and delete the duplicate.
import { ref, watch } from "vue";
import { SsButton, SsInput, SsSheet, SsSpinner } from "@/design-system";
import { useDebouncedSearch } from "@/composables/useDebouncedSearch";
import { errorMessage } from "@/lib/supabase";
import { plural } from "@/lib/format";
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
const target = ref<MergeItem | null>(null);
const busy = ref(false);
const { results, searching, now: searchNow } = useDebouncedSearch(
  q,
  async (term) => (await props.search(term)).filter((x) => x.id !== props.from?.id),
  { onError: (e) => ui.error(errorMessage(e)) },
);

watch(open, (v) => {
  if (v) {
    q.value = props.from?.name ?? "";
    target.value = null;
    results.value = [];
    searchNow();
  }
});

async function confirm() {
  if (!props.from || !target.value) return;
  busy.value = true;
  try {
    const moved = await props.merge(props.from.id, target.value.id);
    ui.flash(`Merged. ${plural(moved, "show")} moved to ${target.value.name}.`);
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
          <button v-for="r in results" v-else :key="r.id" type="button" class="opt ss-tile" @click="target = r">
            <span class="opt__name">{{ r.name }}</span>
            <span class="opt__sub">
              <template v-if="r.sub">{{ r.sub }} · </template>{{ plural(r.shows, "show") }}
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
          <div class="side side--from ss-tile">
            <div class="side__k">Delete</div>
            <div class="side__name">{{ from.name }}</div>
            <div class="side__sub"><template v-if="from.sub">{{ from.sub }} · </template>{{ plural(from.shows, "show") }}</div>
          </div>
          <div class="arrow" aria-hidden="true">→</div>
          <div class="side side--into ss-tile">
            <div class="side__k">Keep</div>
            <div class="side__name">{{ target.name }}</div>
            <div class="side__sub"><template v-if="target.sub">{{ target.sub }} · </template>{{ plural(target.shows, "show") }}</div>
          </div>
        </div>
        <p class="ss-muted">
          {{ plural(from.shows, "show") }} will move to {{ target.name }}. Missing details
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
}
.side--from { border-color: var(--ss-danger); }
.side--into { border-color: var(--ss-accent); }
.side__k { font-family: var(--ss-font-mono); font-size: 11px; letter-spacing: 0.1em; color: var(--ss-text-muted); text-transform: uppercase; }
.side__name { font-weight: 900; font-size: 18px; overflow-wrap: anywhere; }
.side__sub { font-size: 13px; color: var(--ss-text-muted); }
.arrow { font-size: 22px; font-weight: 900; color: var(--ss-text-muted); }
.actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
