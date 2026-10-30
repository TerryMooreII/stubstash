<script setup lang="ts">
// City search box with a result list. Debounced: Nominatim asks for ~1 req/s.
import { ref, watch } from "vue";
import { SsIcon, SsInput, SsSpinner } from "@/design-system";
import { searchPlaces, type PlaceResult } from "@/lib/geocode";

withDefaults(defineProps<{ placeholder?: string; busy?: boolean }>(), { placeholder: "Search for a city", busy: false });
const emit = defineEmits<{ pick: [place: PlaceResult] }>();

const q = ref("");
const places = ref<PlaceResult[]>([]);
const searching = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

watch(q, (v) => {
  clearTimeout(timer);
  if (v.trim().length < 2) {
    places.value = [];
    return;
  }
  timer = setTimeout(async () => {
    const my = ++seq;
    searching.value = true;
    try {
      const r = await searchPlaces(v.trim());
      if (my === seq) places.value = r;
    } catch {
      if (my === seq) places.value = [];
    } finally {
      if (my === seq) searching.value = false;
    }
  }, 500);
});

function pick(p: PlaceResult) {
  q.value = "";
  places.value = [];
  emit("pick", p);
}
</script>

<template>
  <div>
    <SsInput v-model="q" icon="search" :placeholder="placeholder" clearable autocomplete="off">
      <template #end><SsSpinner v-if="searching || busy" :size="16" /></template>
    </SsInput>
    <ul v-if="places.length" class="places">
      <li v-for="p in places" :key="`${p.lat},${p.lng}`">
        <button type="button" class="place" @click="pick(p)">
          <SsIcon name="pin" :size="16" />{{ p.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.places {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.place {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 6px;
  border: 0;
  border-top: 1px solid var(--ss-line-soft);
  background: transparent;
  color: var(--ss-text);
  font-weight: 600;
  text-align: left;
}
.place:hover {
  color: var(--ss-accent);
}
</style>
