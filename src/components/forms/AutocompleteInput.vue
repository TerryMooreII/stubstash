<script setup lang="ts">
// Text input with a suggestion list. Free text is always allowed; picking a
// suggestion emits `select` so the parent can remember its id.
import { ref, watch } from "vue";
import { SsInput } from "@/design-system";

export interface AutocompleteOption {
  id: string;
  label: string;
  sub?: string | null;
  tag?: string | null;
}

const model = defineModel<string>({ default: "" });
const props = withDefaults(
  defineProps<{
    search: (q: string) => Promise<AutocompleteOption[]>;
    placeholder?: string;
    id?: string;
    invalid?: boolean;
    minChars?: number;
  }>(),
  { minChars: 2 },
);
const emit = defineEmits<{ select: [option: AutocompleteOption] }>();

const options = ref<AutocompleteOption[]>([]);
const open = ref(false);
const active = ref(-1);
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
let suppress = false; // don't re-search right after a pick

watch(model, (v) => {
  if (suppress) { suppress = false; return; }
  clearTimeout(timer);
  if ((v ?? "").trim().length < props.minChars) { options.value = []; open.value = false; return; }
  timer = setTimeout(async () => {
    const mine = ++seq;
    const res = await props.search(v.trim()).catch(() => []);
    if (mine !== seq) return;
    options.value = res;
    active.value = -1;
    open.value = res.length > 0;
  }, 250);
});

function pick(o: AutocompleteOption) {
  suppress = true;
  model.value = o.label;
  open.value = false;
  emit("select", o);
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return;
  if (e.key === "ArrowDown") { active.value = (active.value + 1) % options.value.length; e.preventDefault(); }
  else if (e.key === "ArrowUp") { active.value = (active.value - 1 + options.value.length) % options.value.length; e.preventDefault(); }
  else if (e.key === "Enter" && active.value >= 0) { pick(options.value[active.value]!); e.preventDefault(); }
  else if (e.key === "Escape") { open.value = false; }
}
function onBlur() {
  setTimeout(() => (open.value = false), 150);
}
</script>

<template>
  <div class="ac" @keydown="onKey" @focusout="onBlur">
    <SsInput
      :id="id"
      v-model="model"
      :placeholder="placeholder"
      :invalid="invalid"
      autocomplete="off"
      role="combobox"
      :aria-expanded="open"
      aria-autocomplete="list"
    />
    <ul v-if="open" class="ac__list" role="listbox">
      <li
        v-for="(o, i) in options"
        :key="o.id"
        role="option"
        class="ac__opt"
        :class="{ 'is-active': i === active }"
        :aria-selected="i === active"
        @mousedown.prevent="pick(o)"
      >
        <span class="ac__label">{{ o.label }}</span>
        <span v-if="o.sub" class="ac__sub">{{ o.sub }}</span>
        <span v-if="o.tag" class="ac__tag">{{ o.tag }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ac { position: relative; min-width: 0; }
.ac__list {
  position: absolute;
  z-index: 40;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  border-radius: var(--ss-radius-sm);
  box-shadow: var(--ss-shadow-pop);
  max-height: 280px;
  overflow-y: auto;
}
.ac__opt {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.ac__opt:hover,
.ac__opt.is-active { background: var(--ss-surface-3); }
.ac__label { font-weight: 700; }
.ac__sub { font-size: 13px; color: var(--ss-text-muted); }
.ac__tag {
  margin-left: auto;
  font-family: var(--ss-font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ss-teal-light);
}
</style>
