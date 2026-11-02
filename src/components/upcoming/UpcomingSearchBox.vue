<script setup lang="ts">
// The Find shows search box. While you type it suggests artists and venues
// (from SeatGeek; venues only within the current where) and cities (from the geocoder). Picking an artist or venue
// searches by its exact SeatGeek id; picking a city searches around it.
// Enter searches the typed text as is.
import { computed, ref, watch } from "vue";
import { SsIcon, SsInput, SsSpinner } from "@/design-system";
import { useDebouncedSearch } from "@/composables/useDebouncedSearch";
import { upcoming } from "@/lib/api";
import { place, plural } from "@/lib/format";
import { searchPlaces, type PlaceResult } from "@/lib/geocode";
import { whereParams, type SearchPick, type UpcomingFilters } from "@/lib/upcoming";

const q = defineModel<string>({ required: true });
const props = defineProps<{
  pick: SearchPick | null;
  /** Venue suggestions stay within this where (city or home, and distance). */
  filters: UpcomingFilters;
}>();
const emit = defineEmits<{
  pick: [pick: SearchPick];
  city: [place: PlaceResult];
  /** Search the typed text. */
  submit: [];
  /** The pick or the text was cleared. */
  clear: [];
}>();

type Option =
  | { kind: "text"; label: string }
  | { kind: "artist"; id: number; label: string; sub: string }
  | { kind: "venue"; id: number; label: string; sub: string; place: string }
  | { kind: "city"; label: string; sub: string; place: PlaceResult };

/** True when SeatGeek's artist and venue lookup failed (cities may still show). */
const sgFailed = ref(false);

/** Artists, venues and cities matching the text. A failing source just adds nothing. */
async function suggest(text: string): Promise<Option[]> {
  const [sg, cities] = await Promise.allSettled([upcoming.suggest(text, whereParams(props.filters)), searchPlaces(text)]);
  const out: Option[] = [];
  sgFailed.value = sg.status === "rejected";
  if (sg.status === "rejected") console.warn("Artist/venue suggestions failed", sg.reason);
  if (sg.status === "fulfilled") {
    for (const a of sg.value.artists) {
      out.push({ kind: "artist", id: a.id, label: a.name, sub: `Artist · ${plural(a.upcoming, "upcoming show")}` });
    }
    for (const v of sg.value.venues) {
      const where = place(v.city, v.state);
      out.push({ kind: "venue", id: v.id, label: v.name, place: where, sub: `Venue${where ? ` · ${where}` : ""} · ${plural(v.upcoming, "show")}` });
    }
  }
  if (cities.status === "fulfilled") {
    for (const c of cities.value.slice(0, 3)) out.push({ kind: "city", label: c.label, sub: "City · shows nearby", place: c });
  }
  return out;
}

const typed = computed(() => (props.pick ? "" : q.value));
const { results, searching, clear: clearSuggestions } = useDebouncedSearch(typed, suggest, { ms: 500 });

const focused = ref(false);
const active = ref(-1);
const options = computed<Option[]>(() => {
  const t = q.value.trim();
  if (!t || props.pick) return [];
  return [{ kind: "text", label: t }, ...results.value];
});
const open = computed(() => focused.value && options.value.length > 0 && q.value.trim().length >= 2);
watch(options, () => (active.value = -1));

const box = ref<InstanceType<typeof SsInput>>();

function choose(o: Option) {
  focused.value = false;
  clearSuggestions();
  if (o.kind === "text") return emit("submit");
  if (o.kind === "city") {
    q.value = "";
    return emit("city", o.place);
  }
  q.value = o.label;
  emit("pick", o.kind === "artist" ? { kind: "artist", id: o.id, name: o.label } : { kind: "venue", id: o.id, name: o.label, place: o.place });
}

function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown" && open.value) {
    e.preventDefault();
    active.value = (active.value + 1) % options.value.length;
  } else if (e.key === "ArrowUp" && open.value) {
    e.preventDefault();
    active.value = active.value <= 0 ? options.value.length - 1 : active.value - 1;
  } else if (e.key === "Enter") {
    e.preventDefault();
    const o = open.value && active.value >= 0 ? options.value[active.value] : { kind: "text" as const, label: q.value };
    choose(o);
    (e.target as HTMLInputElement).blur();
  } else if (e.key === "Escape") {
    focused.value = false;
  }
}

function unpick() {
  q.value = "";
  emit("clear");
  setTimeout(() => box.value?.focus());
}

// Let a tap on a suggestion land before the list closes.
function onBlur() {
  setTimeout(() => (focused.value = false), 150);
}

const ICON = { text: "search", artist: "music", venue: "ticket", city: "pin" } as const;
</script>

<template>
  <div class="usb">
    <!-- A picked artist or venue -->
    <div v-if="pick" class="usb__pick">
      <SsIcon :name="pick.kind === 'artist' ? 'music' : 'ticket'" :size="18" class="usb__pick-icon" />
      <span class="usb__pick-text">
        <span class="usb__pick-kind">{{ pick.kind === "artist" ? "ARTIST" : "VENUE" }}</span>
        <span class="ss-truncate">{{ pick.name }}<template v-if="pick.kind === 'venue' && pick.place"> · {{ pick.place }}</template></span>
      </span>
      <button type="button" class="usb__unpick" :aria-label="`Clear ${pick.name}`" @click="unpick">
        <SsIcon name="close" :size="18" />
      </button>
    </div>

    <SsInput
      v-else
      ref="box"
      v-model="q"
      size="lg"
      icon="search"
      placeholder="Search an artist, venue or city"
      clearable
      inputmode="search"
      enterkeyhint="search"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-controls="usb-list"
      :aria-expanded="open"
      :aria-activedescendant="active >= 0 ? `usb-opt-${active}` : undefined"
      @focus="focused = true"
      @blur="onBlur"
      @keydown="onKey"
      @clear="emit('clear')"
    >
      <template #end><SsSpinner v-if="searching && focused" :size="16" /></template>
    </SsInput>

    <ul v-if="open" id="usb-list" class="usb__list" role="listbox" aria-label="Suggestions">
      <li
        v-for="(o, i) in options"
        :id="`usb-opt-${i}`"
        :key="`${o.kind}:${o.label}:${i}`"
        role="option"
        :aria-selected="i === active"
        class="usb__opt"
        :class="{ 'is-active': i === active }"
        @mousedown.prevent
        @click="choose(o)"
      >
        <SsIcon :name="ICON[o.kind]" :size="18" class="usb__opt-icon" />
        <span class="usb__opt-text">
          <span v-if="o.kind === 'text'" class="ss-truncate">Search shows for “{{ o.label }}”</span>
          <template v-else>
            <span class="usb__opt-label ss-truncate">{{ o.label }}</span>
            <span class="usb__opt-sub ss-truncate">{{ o.sub }}</span>
          </template>
        </span>
      </li>
      <li v-if="sgFailed && !searching" class="usb__more">Couldn’t look up artists and venues right now.</li>
      <li v-if="searching" class="usb__more" aria-hidden="true"><SsSpinner :size="14" /> Looking for artists, venues and cities…</li>
    </ul>
  </div>
</template>

<style scoped>
.usb { position: relative; }
.usb__pick {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 8px 0 18px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-accent);
  min-width: 0;
}
.usb__pick-icon { color: var(--ss-accent); flex-shrink: 0; }
.usb__pick-text { flex: 1; min-width: 0; display: flex; flex-direction: column; font-weight: 700; font-size: 16px; line-height: 1.2; }
.usb__pick-kind { font-family: var(--ss-font-mono); font-size: 10px; letter-spacing: 0.12em; color: var(--ss-text-faint); font-weight: 400; }
.usb__unpick {
  border: 0;
  background: transparent;
  color: var(--ss-text-muted);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.usb__unpick:hover { color: var(--ss-text); background: var(--ss-surface-3); }
.usb__list {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 6px;
  list-style: none;
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  border-radius: var(--ss-radius-md);
  box-shadow: var(--ss-shadow-pop);
  max-height: min(420px, 60vh);
  overflow-y: auto;
}
.usb__opt {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: var(--ss-radius-sm);
  cursor: pointer;
  min-width: 0;
}
.usb__opt.is-active, .usb__opt:hover { background: var(--ss-surface-3); }
.usb__opt-icon { color: var(--ss-text-muted); flex-shrink: 0; }
.usb__opt-text { flex: 1; min-width: 0; display: flex; flex-direction: column; font-weight: 600; }
.usb__opt-label { font-weight: 700; }
.usb__opt-sub { font-size: 12px; color: var(--ss-text-muted); font-weight: 400; }
.usb__more { display: flex; align-items: center; gap: 8px; padding: 10px; font-size: 13px; color: var(--ss-text-faint); }
</style>
