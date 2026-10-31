<script setup lang="ts">
// Admin: venues. Search, filter, edit (incl. map pin), re-run lookups, merge duplicates.
import { computed, reactive, ref } from "vue";
import { SsButton, SsChip, SsField, SsInput, SsSelect, SsSheet, SsTag } from "@/design-system";
import AdminPagedList from "@/components/admin/AdminPagedList.vue";
import AdminRow from "@/components/admin/AdminRow.vue";
import ImageUrlField from "@/components/admin/ImageUrlField.vue";
import MergePicker, { type MergeItem } from "@/components/admin/MergePicker.vue";
import { imageTag, imageUrlInvalid, pinTag, sourceTag } from "@/components/admin/catalog";
import VenueMap from "@/components/map/VenueMap.vue";
import { usePagedSearch } from "@/composables/usePagedSearch";
import { useRequeue } from "@/composables/useRequeue";
import { admin, type AdminVenue, type VenueFilter, type VenuePatch } from "@/lib/admin";
import { countryOptions } from "@/lib/countries";
import { diffPatch } from "@/lib/patch";
import { errorMessage } from "@/lib/supabase";
import { num, placeOf, plural } from "@/lib/format";
import type { MapVenue } from "@/lib/types";
import { useUi } from "@/stores/ui";

const ui = useUi();
const FILTERS: { key: VenueFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "no_image", label: "No image" },
  { key: "no_pin", label: "No exact pin" },
  { key: "manual", label: "Added by users" },
  { key: "unused", label: "Unused" },
];
const countries = countryOptions();

const filter = ref<VenueFilter>("all");
const { q, rows, total, loading, loadingMore, error, load } = usePagedSearch(
  (term, limit, offset) => admin.venues(term, filter.value, limit, offset),
  { watch: filter },
);

const { requeue, queueing } = useRequeue("venue");

// ---- edit
const editing = ref<AdminVenue | null>(null);
const editOpen = ref(false);
const form = reactive({
  name: "", city: "", state_code: "", country_code: "", capacity: "", image_url: "", image_credit: "",
});
const pin = ref<{ lat: number; lng: number } | null>(null);
const pinMoved = ref(false);
const saving = ref(false);

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
  editOpen.value = true;
}

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
    recent_artists: [], miles_from_home: null, geo_source: pinMoved.value ? "user" : v.geo_source,
  }];
});

const capacityInvalid = computed(() => !!form.capacity.trim() && !/^\d{1,7}$/.test(form.capacity.trim()));
const urlInvalid = computed(() => imageUrlInvalid(form.image_url));
const stateInvalid = computed(() => !!form.state_code.trim() && !/^[A-Za-z0-9]{1,3}$/.test(form.state_code.trim()));

const patch = computed<VenuePatch>(() => {
  const v = editing.value;
  if (!v) return {};
  const { capacity, ...rest } = diffPatch({ ...form, state_code: form.state_code.toUpperCase() }, v, { required: ["name"] });
  const p: VenuePatch = rest;
  if (capacity !== undefined) p.capacity = capacity ? Number(capacity) : "";
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
  mergeFrom.value = { id: v.id, name: v.name, sub: placeOf(v), shows: v.shows };
  mergeOpen.value = true;
}
async function searchVenues(term: string): Promise<MergeItem[]> {
  const list = await admin.venues(term, "all", 20, 0);
  return list.map((v) => ({ id: v.id, name: v.name, sub: placeOf(v), shows: v.shows }));
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
      <span class="ss-muted">{{ loading ? "Loading…" : plural(total, "venue") }}</span>
      <SsButton v-if="showBulk" size="sm" variant="outline" :loading="queueing.bulk" @click="requeue('bulk', bulkIds)">
        {{ filter === "no_pin" ? "Find pins for all of these" : "Find images for all missing" }}
      </SsButton>
    </div>

    <AdminPagedList
      :rows="rows"
      :total="total"
      :loading="loading"
      :loading-more="loadingMore"
      :error="error"
      error-title="Couldn't load venues"
      empty-title="No venues match"
      empty-body="Try another search or filter."
      @retry="load(true)"
      @more="load(false)"
    >
      <template #default="{ item: v }">
        <AdminRow :name="v.name" :image="v.image_url" :to="`/app/venues/${v.id}`" :sub="placeOf(v) || 'No city'">
          <template #tags>
            <SsTag :tone="pinTag(v).tone">{{ pinTag(v).label }}</SsTag>
            <SsTag :tone="sourceTag(v, 'dark').tone">{{ sourceTag(v, "dark").label }}</SsTag>
            <SsTag :tone="imageTag(v).tone">{{ imageTag(v).label }}</SsTag>
          </template>
          <template #stats>
            <template v-if="v.capacity">Capacity {{ num(v.capacity) }} · </template>{{ plural(v.shows, "show") }} · {{ plural(v.fans, "fan") }}
          </template>
          <template #actions>
            <SsButton size="sm" variant="outline" @click="startEdit(v)">Edit</SsButton>
            <SsButton size="sm" variant="ghost" :loading="queueing[v.id]" @click="requeue(v.id, [v.id])">Find pin &amp; image again</SsButton>
            <SsButton size="sm" variant="ghost" @click="startMerge(v)">Merge</SsButton>
          </template>
        </AdminRow>
      </template>
    </AdminPagedList>

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

        <ImageUrlField v-model:url="form.image_url" v-model:credit="form.image_credit" />

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

<style scoped src="./adminCatalog.css"></style>

<style scoped>
.pinfield { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pinfield__label { font-size: var(--ss-fs-sm); font-weight: 700; color: var(--ss-text-3); }
.map { border-radius: var(--ss-radius-sm); overflow: hidden; border: 1px solid var(--ss-line); }
.map__none { padding: 16px; margin: 0; }
.coords { font-family: var(--ss-font-mono); font-size: 12px; color: var(--ss-text-muted); }
</style>
