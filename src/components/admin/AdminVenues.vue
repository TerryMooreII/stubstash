<script setup lang="ts">
// Admin: venues. Search, filter, edit (incl. map pin), re-run lookups, merge duplicates.
import { computed, onMounted, reactive, ref, watch } from "vue";
import { SsArt, SsButton, SsChip, SsEmpty, SsField, SsInput, SsSelect, SsSheet, SsSkeleton, SsTag } from "@/design-system";
import MergePicker, { type MergeItem } from "@/components/admin/MergePicker.vue";
import VenueMap from "@/components/map/VenueMap.vue";
import { admin, type AdminVenue, type VenueFilter, type VenuePatch } from "@/lib/admin";
import { countryOptions } from "@/lib/countries";
import { errorMessage } from "@/lib/supabase";
import { num, place } from "@/lib/format";
import type { GeoSource, MapVenue } from "@/lib/types";
import { useUi } from "@/stores/ui";

const ui = useUi();
const PAGE = 50;
const FILTERS: { key: VenueFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "no_image", label: "No image" },
  { key: "no_pin", label: "No exact pin" },
  { key: "manual", label: "Added by users" },
  { key: "unused", label: "Unused" },
];
const countries = countryOptions();

const q = ref("");
const filter = ref<VenueFilter>("all");
const rows = ref<AdminVenue[]>([]);
const total = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref<string | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

async function load(reset = true) {
  const mine = ++seq;
  if (reset) loading.value = true; else loadingMore.value = true;
  error.value = null;
  try {
    const list = await admin.venues(q.value.trim(), filter.value, PAGE, reset ? 0 : rows.value.length);
    if (mine !== seq) return;
    rows.value = reset ? list : [...rows.value, ...list];
    total.value = list[0]?.total ?? (reset ? 0 : total.value);
  } catch (e) {
    if (mine === seq) error.value = errorMessage(e);
  } finally {
    if (mine === seq) { loading.value = false; loadingMore.value = false; }
  }
}

watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(() => load(true), 300);
});
watch(filter, () => load(true));
onMounted(() => load(true));

function pinStatus(v: AdminVenue): { label: string; tone: "teal" | "lavender" | "butter" } {
  if (v.lat != null && v.geo_source === "user") return { label: "PIN SET BY HAND", tone: "lavender" };
  if (v.lat != null) return { label: "EXACT PIN", tone: "teal" };
  return { label: "CITY ONLY", tone: "butter" };
}

// ---- requeue
const queueing = reactive<Record<string, boolean>>({});
async function requeue(ids: string[], key: string) {
  queueing[key] = true;
  try {
    const n = await admin.requeue("venue", ids);
    ui.flash(n > 1 ? `Queued ${num(n)} venues. The lookup runs every 2 minutes.` : "Queued. The lookup runs every 2 minutes.");
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    queueing[key] = false;
  }
}

// ---- edit
const editing = ref<AdminVenue | null>(null);
const editOpen = ref(false);
const form = reactive({
  name: "", city: "", state_code: "", country_code: "", capacity: "", image_url: "", image_credit: "",
});
const pin = ref<{ lat: number; lng: number } | null>(null);
const pinMoved = ref(false);
const saving = ref(false);
const previewFailed = ref(false);

function startEdit(v: AdminVenue) {
  editing.value = v;
  Object.assign(form, {
    name: v.name,
    city: v.city ?? "",
    state_code: v.state_code ?? "",
    country_code: v.country_code ?? "",
    capacity: v.capacity != null ? String(v.capacity) : "",
    image_url: v.image_url ?? "",
    image_credit: v.image_credit ?? "",
  });
  pin.value = v.lat != null && v.lng != null
    ? { lat: v.lat, lng: v.lng }
    : v.city_lat != null && v.city_lng != null ? { lat: v.city_lat, lng: v.city_lng } : null;
  pinMoved.value = false;
  previewFailed.value = false;
  editOpen.value = true;
}
watch(() => form.image_url, () => (previewFailed.value = false));

function onPick(lat: number, lng: number) {
  pin.value = { lat, lng };
  pinMoved.value = true;
}

/** One-venue list for the map, at the current (possibly moved) pin. */
const mapVenues = computed<MapVenue[]>(() => {
  const v = editing.value;
  if (!v || !pin.value) return [];
  const yr = new Date().getFullYear();
  return [{
    venue_id: v.id, name: form.name || v.name, city: v.city, state_code: v.state_code, country_code: v.country_code,
    lat: pin.value.lat, lng: pin.value.lng, visits: Math.max(1, v.shows), first_year: yr, last_year: yr,
    recent_artists: [], miles_from_home: null, geo_source: (pinMoved.value ? "user" : v.geo_source) as GeoSource,
  }];
});

const capacityInvalid = computed(() => !!form.capacity.trim() && !/^\d{1,7}$/.test(form.capacity.trim()));
const urlInvalid = computed(() => !!form.image_url.trim() && !/^https:\/\//i.test(form.image_url.trim()));
const stateInvalid = computed(() => !!form.state_code.trim() && !/^[A-Za-z0-9]{1,3}$/.test(form.state_code.trim()));

const patch = computed<VenuePatch>(() => {
  const v = editing.value;
  if (!v) return {};
  const p: VenuePatch = {};
  const t = (s: string) => s.trim();
  if (t(form.name) && t(form.name) !== v.name) p.name = t(form.name);
  if (t(form.city) !== (v.city ?? "")) p.city = t(form.city);
  if (t(form.state_code).toUpperCase() !== (v.state_code ?? "")) p.state_code = t(form.state_code).toUpperCase();
  if (form.country_code !== (v.country_code ?? "")) p.country_code = form.country_code;
  const cap = t(form.capacity);
  if (cap !== (v.capacity != null ? String(v.capacity) : "")) p.capacity = cap ? Number(cap) : "";
  if (t(form.image_url) !== (v.image_url ?? "")) p.image_url = t(form.image_url);
  if (t(form.image_credit) !== (v.image_credit ?? "")) p.image_credit = t(form.image_credit);
  if (pinMoved.value && pin.value) { p.lat = pin.value.lat; p.lng = pin.value.lng; }
  return p;
});
const dirty = computed(() => Object.keys(patch.value).length > 0);
const invalid = computed(() => capacityInvalid.value || urlInvalid.value || stateInvalid.value);

async function save() {
  if (!editing.value || !dirty.value || invalid.value) return;
  saving.value = true;
  try {
    await admin.updateVenue(editing.value.id, patch.value);
    ui.flash(patch.value.lat != null ? "Saved. The pin is now marked as set by hand." : "Saved.");
    editOpen.value = false;
    await load(true);
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    saving.value = false;
  }
}

// ---- merge
const mergeOpen = ref(false);
const mergeFrom = ref<MergeItem | null>(null);
function startMerge(v: AdminVenue) {
  mergeFrom.value = { id: v.id, name: v.name, sub: place(v.city, v.state_code, v.country_code), shows: v.shows };
  mergeOpen.value = true;
}
async function searchVenues(term: string): Promise<MergeItem[]> {
  const list = await admin.venues(term, "all", 20, 0);
  return list.map((v) => ({ id: v.id, name: v.name, sub: place(v.city, v.state_code, v.country_code), shows: v.shows }));
}

const bulkIds = computed(() => rows.value.map((r) => r.id));
const showBulk = computed(() => (filter.value === "no_image" || filter.value === "no_pin") && rows.value.length > 0);
</script>

<template>
  <section class="admin-list">
    <div class="bar">
      <SsInput v-model="q" icon="search" placeholder="Search venues or cities" clearable />
      <div class="chips">
        <SsChip v-for="f in FILTERS" :key="f.key" size="sm" :active="filter === f.key" @click="filter = f.key">{{ f.label }}</SsChip>
      </div>
    </div>

    <div class="meta">
      <span class="ss-muted">{{ loading ? "Loading…" : `${num(total)} venue${total === 1 ? "" : "s"}` }}</span>
      <SsButton v-if="showBulk" size="sm" variant="outline" :loading="queueing.bulk" @click="requeue(bulkIds, 'bulk')">
        {{ filter === "no_pin" ? "Find pins for all of these" : "Find images for all missing" }}
      </SsButton>
    </div>

    <SsEmpty v-if="error" title="Couldn't load venues" :body="error">
      <SsButton size="sm" variant="outline" @click="load(true)">Try again</SsButton>
    </SsEmpty>

    <div v-else-if="loading" class="rows">
      <SsSkeleton v-for="i in 5" :key="i" height="76px" radius="var(--ss-radius-md)" />
    </div>

    <SsEmpty v-else-if="!rows.length" title="No venues match" body="Try another search or filter." />

    <ul v-else class="rows">
      <li v-for="v in rows" :key="v.id" class="row">
        <SsArt :src="v.image_url" :seed="v.name" :alt="v.name" class="row__img" />
        <div class="row__body">
          <RouterLink :to="`/app/venues/${v.id}`" class="row__name">{{ v.name }}</RouterLink>
          <div class="row__sub">{{ place(v.city, v.state_code, v.country_code) || "No city" }}</div>
          <div class="row__tags">
            <SsTag :tone="pinStatus(v).tone">{{ pinStatus(v).label }}</SsTag>
            <SsTag :tone="v.source === 'manual' ? 'lavender' : 'dark'">{{ v.source === "manual" ? "ADDED BY USER" : "SETLIST.FM" }}</SsTag>
            <SsTag :tone="v.image_url ? 'outline' : 'butter'">{{ v.image_url ? (v.image_source ?? "image") : (v.image_checked_at ? "NO IMAGE" : "LOOKING…") }}</SsTag>
          </div>
          <div class="row__stats">
            <template v-if="v.capacity">Capacity {{ num(v.capacity) }} · </template>{{ num(v.shows) }} show{{ v.shows === 1 ? "" : "s" }} · {{ num(v.fans) }} fan{{ v.fans === 1 ? "" : "s" }}
          </div>
        </div>
        <div class="row__actions">
          <SsButton size="sm" variant="outline" @click="startEdit(v)">Edit</SsButton>
          <SsButton size="sm" variant="ghost" :loading="queueing[v.id]" @click="requeue([v.id], v.id)">Find pin &amp; image again</SsButton>
          <SsButton size="sm" variant="ghost" @click="startMerge(v)">Merge</SsButton>
        </div>
      </li>
    </ul>

    <SsButton v-if="!loading && rows.length < total" variant="outline" class="more" :loading="loadingMore" @click="load(false)">
      Load more
    </SsButton>

    <!-- Edit -->
    <SsSheet v-model="editOpen" label="Edit venue" :width="600">
      <form v-if="editing" class="edit" @submit.prevent="save">
        <h2 class="ss-h2">Edit {{ editing.name }}</h2>
        <SsField label="Name"><SsInput v-model="form.name" /></SsField>
        <div class="two">
          <SsField label="City"><SsInput v-model="form.city" /></SsField>
          <SsField label="State / province" hint="Code, like CO or ON" :error="stateInvalid ? 'Up to 3 letters' : null">
            <SsInput v-model="form.state_code" :maxlength="3" :invalid="stateInvalid" />
          </SsField>
          <SsField label="Country">
            <SsSelect v-model="form.country_code" :options="countries" placeholder="No country" />
          </SsField>
          <SsField label="Capacity" :error="capacityInvalid ? 'Whole number' : null">
            <SsInput v-model="form.capacity" inputmode="numeric" :invalid="capacityInvalid" />
          </SsField>
        </div>

        <div class="pinfield">
          <span class="pinfield__label">Map pin</span>
          <div class="map">
            <VenueMap v-if="mapVenues.length" :venues="mapVenues" :scroll-zoom="false" height="240px" edit-pin @pick-location="onPick" />
            <p v-else class="ss-muted map__none">No location yet. Re-run the lookup, or fill in the city and save first.</p>
          </div>
          <span class="coords">
            <template v-if="pin">{{ pin.lat.toFixed(5) }}, {{ pin.lng.toFixed(5) }} · </template>{{ pinMoved ? "Moved. Saving marks it as set by hand." : "Tap the map to move the pin." }}
          </span>
        </div>

        <SsField label="Image URL" :error="urlInvalid ? 'Use an https:// link' : null" hint="Leave empty to remove the image">
          <SsInput v-model="form.image_url" placeholder="https://…" inputmode="url" :invalid="urlInvalid" />
        </SsField>
        <div class="preview">
          <img
            v-if="form.image_url.trim() && !urlInvalid && !previewFailed"
            :src="form.image_url.trim()"
            alt="Preview"
            referrerpolicy="no-referrer"
            @error="previewFailed = true"
          />
          <span v-else class="ss-muted">{{ previewFailed ? "That image didn't load." : "No image" }}</span>
        </div>
        <SsField label="Image credit"><SsInput v-model="form.image_credit" placeholder="e.g. Wikimedia Commons: File.jpg" /></SsField>

        <div class="actions">
          <SsButton variant="ghost" @click="editOpen = false">Cancel</SsButton>
          <SsButton type="submit" :disabled="!dirty || invalid" :loading="saving">Save</SsButton>
        </div>
      </form>
    </SsSheet>

    <MergePicker
      v-model="mergeOpen"
      noun="venue"
      :from="mergeFrom"
      :search="searchVenues"
      :merge="admin.mergeVenues"
      @merged="load(true)"
    />
  </section>
</template>

<style scoped>
.admin-list { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.bar { display: flex; flex-direction: column; gap: 10px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 14px; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.row {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  min-width: 0;
}
.row__img { width: 56px; height: 56px; border-radius: var(--ss-radius-sm); }
.row__body { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.row__name { font-weight: 900; font-size: 17px; color: var(--ss-text); overflow-wrap: anywhere; }
.row__sub { font-size: 13px; color: var(--ss-text-muted); overflow-wrap: anywhere; }
.row__tags { display: flex; gap: 6px; flex-wrap: wrap; }
.row__stats { font-size: 13px; color: var(--ss-text-faint); }
.row__actions { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; }
.more { align-self: center; }
.edit { display: flex; flex-direction: column; gap: 14px; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: 14px; }
.pinfield { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pinfield__label { font-size: var(--ss-fs-sm); font-weight: 700; color: var(--ss-text-3); }
.map { border-radius: var(--ss-radius-sm); overflow: hidden; border: 1px solid var(--ss-line); }
.map__none { padding: 16px; margin: 0; }
.coords { font-family: var(--ss-font-mono); font-size: 12px; color: var(--ss-text-muted); }
.preview {
  height: 160px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-1);
  border: 1px dashed var(--ss-line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.preview img { width: 100%; height: 100%; object-fit: cover; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
