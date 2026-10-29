<script setup lang="ts">
// "Mark as festival" for one or many shows: name it once (with suggestions
// from names everyone has used, so spellings match) and apply to all.
import { computed, ref, watch } from "vue";
import { SsButton, SsField, SsSheet } from "@/design-system";
import AutocompleteInput, { type AutocompleteOption } from "@/components/forms/AutocompleteInput.vue";
import { festivalNames, setFestival } from "@/lib/api";
import { errorMessage } from "@/lib/supabase";
import { plural } from "@/lib/format";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const open = defineModel<boolean>({ default: false });
const props = defineProps<{
  /** Attendance ids to mark. */
  ids: string[];
  /** How many shows (tickets) that is, for the button text. */
  showCount: number;
  /** Prefill, e.g. a name already used on some of them. */
  name?: string | null;
  /** Context line, e.g. "Infinity Downs Farm · Aug 23–26, 2018". */
  context?: string;
}>();
const emit = defineEmits<{ done: [] }>();

const log = useLog();
const ui = useUi();
const name = ref("");
const saving = ref(false);
watch(open, (o) => o && (name.value = props.name ?? ""));

async function search(q: string): Promise<AutocompleteOption[]> {
  return (await festivalNames(q)).map((f) => ({
    id: f.name,
    label: f.name,
    sub: f.uses > 1 ? `${f.uses} shows on Stubstash` : null,
  }));
}

const label = computed(() => `Mark ${plural(props.showCount, "show")} as a festival`);

async function apply() {
  saving.value = true;
  try {
    await setFestival(props.ids, true, name.value.trim() || null);
    await log.refresh();
    ui.flash(name.value.trim() ? `Marked as ${name.value.trim()}` : "Marked as a festival");
    open.value = false;
    emit("done");
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <SsSheet v-model="open" label="Mark as festival">
    <div class="ss-kicker">FESTIVAL</div>
    <div class="ss-h2">Which festival?</div>
    <p v-if="context" class="ss-muted ctx">{{ context }}</p>
    <form class="ss-stack" @submit.prevent="apply">
      <SsField label="Festival name" hint="Pick a suggestion so your days group together. Optional.">
        <AutocompleteInput v-model="name" :search="search" :min-chars="1" placeholder="e.g. Lockn' Festival" />
      </SsField>
      <div class="actions">
        <SsButton variant="outline" @click="open = false">Cancel</SsButton>
        <SsButton type="submit" :loading="saving">{{ label }}</SsButton>
      </div>
    </form>
  </SsSheet>
</template>

<style scoped>
.ctx { margin: -4px 0 4px; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.actions > * { flex: 1; }
</style>
