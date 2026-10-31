<script setup lang="ts">
// Admin: artists. Search, filter, edit, re-run image lookup, merge duplicates.
import { computed, reactive, ref } from "vue";
import { SsButton, SsChip, SsField, SsInput, SsSheet, SsTag } from "@/design-system";
import AdminPagedList from "@/components/admin/AdminPagedList.vue";
import AdminRow from "@/components/admin/AdminRow.vue";
import ImageUrlField from "@/components/admin/ImageUrlField.vue";
import MergePicker, { type MergeItem } from "@/components/admin/MergePicker.vue";
import { imageTag, imageUrlInvalid, sourceTag } from "@/components/admin/catalog";
import { usePagedSearch } from "@/composables/usePagedSearch";
import { useRequeue } from "@/composables/useRequeue";
import { admin, type AdminArtist, type ArtistFilter, type ArtistPatch } from "@/lib/admin";
import { diffPatch } from "@/lib/patch";
import { errorMessage } from "@/lib/supabase";
import { plural } from "@/lib/format";
import { useUi } from "@/stores/ui";

const ui = useUi();
const FILTERS: { key: ArtistFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "no_image", label: "No image" },
  { key: "manual", label: "Added by users" },
  { key: "unused", label: "Unused" },
];

const filter = ref<ArtistFilter>("all");
const { q, rows, total, loading, loadingMore, error, load } = usePagedSearch(
  (term, limit, offset) => admin.artists(term, filter.value, limit, offset),
  { watch: filter },
);

const { requeue, queueing } = useRequeue("artist");

// ---- edit
const editing = ref<AdminArtist | null>(null);
const editOpen = ref(false);
const form = reactive({ name: "", genre: "", disambiguation: "", image_url: "", image_credit: "" });
const saving = ref(false);

function startEdit(a: AdminArtist) {
  editing.value = a;
  Object.assign(form, {
    name: a.name,
    genre: a.genre ?? "",
    disambiguation: a.disambiguation ?? "",
    image_url: a.image_url ?? "",
    image_credit: a.image_credit ?? "",
  });
  editOpen.value = true;
}

const patch = computed<ArtistPatch>(() => (editing.value ? diffPatch(form, editing.value, { required: ["name"] }) : {}));
const dirty = computed(() => Object.keys(patch.value).length > 0);
const urlInvalid = computed(() => imageUrlInvalid(form.image_url));

async function save() {
  if (!editing.value || !dirty.value || urlInvalid.value) return;
  saving.value = true;
  try {
    await admin.updateArtist(editing.value.id, patch.value);
    ui.flash("Saved.");
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
function startMerge(a: AdminArtist) {
  mergeFrom.value = { id: a.id, name: a.name, sub: a.disambiguation, shows: a.shows };
  mergeOpen.value = true;
}
async function searchArtists(term: string): Promise<MergeItem[]> {
  const list = await admin.artists(term, "all", 20, 0);
  return list.map((a) => ({ id: a.id, name: a.name, sub: a.disambiguation ?? (a.source === "manual" ? "Added by a user" : null), shows: a.shows }));
}

const missingIds = computed(() => rows.value.map((r) => r.id));
</script>

<template>
  <section class="admin-list">
    <div class="bar">
      <SsInput v-model="q" icon="search" placeholder="Search artists" clearable class="bar__search" />
      <div class="chips">
        <SsChip v-for="f in FILTERS" :key="f.key" size="sm" :active="filter === f.key" @click="filter = f.key">{{ f.label }}</SsChip>
      </div>
    </div>

    <div class="meta">
      <span class="ss-muted">{{ loading ? "Loading…" : plural(total, "artist") }}</span>
      <SsButton
        v-if="filter === 'no_image' && rows.length"
        size="sm"
        variant="outline"
        :loading="queueing.bulk"
        @click="requeue('bulk', missingIds)"
      >
        Find images for all missing
      </SsButton>
    </div>

    <AdminPagedList
      :rows="rows"
      :total="total"
      :loading="loading"
      :loading-more="loadingMore"
      :error="error"
      error-title="Couldn't load artists"
      empty-title="No artists match"
      empty-body="Try another search or filter."
      @retry="load(true)"
      @more="load(false)"
    >
      <template #default="{ item: a }">
        <AdminRow :name="a.name" :image="a.image_url" :to="`/app/artists/${a.id}`" :sub="a.disambiguation">
          <template #tags>
            <SsTag :tone="sourceTag(a, 'teal').tone">{{ sourceTag(a, "teal").label }}</SsTag>
            <SsTag v-if="a.genre" tone="dark">{{ a.genre }}</SsTag>
            <SsTag :tone="imageTag(a).tone">{{ imageTag(a).label }}</SsTag>
          </template>
          <template #stats>{{ plural(a.shows, "show") }} · {{ plural(a.fans, "fan") }}</template>
          <template #actions>
            <SsButton size="sm" variant="outline" @click="startEdit(a)">Edit</SsButton>
            <SsButton size="sm" variant="ghost" :loading="queueing[a.id]" @click="requeue(a.id, [a.id])">Find image again</SsButton>
            <SsButton size="sm" variant="ghost" @click="startMerge(a)">Merge</SsButton>
          </template>
        </AdminRow>
      </template>
    </AdminPagedList>

    <!-- Edit -->
    <SsSheet v-model="editOpen" label="Edit artist" :width="520">
      <form v-if="editing" class="edit" @submit.prevent="save">
        <h2 class="ss-h2">Edit {{ editing.name }}</h2>
        <SsField label="Name"><SsInput v-model="form.name" /></SsField>
        <div class="two">
          <SsField label="Genre"><SsInput v-model="form.genre" placeholder="e.g. Bluegrass" /></SsField>
          <SsField label="Disambiguation" hint="Tells same-named artists apart"><SsInput v-model="form.disambiguation" /></SsField>
        </div>
        <ImageUrlField v-model:url="form.image_url" v-model:credit="form.image_credit" />
        <div class="actions">
          <SsButton variant="ghost" @click="editOpen = false">Cancel</SsButton>
          <SsButton type="submit" :disabled="!dirty || urlInvalid" :loading="saving">Save</SsButton>
        </div>
      </form>
    </SsSheet>

    <MergePicker
      v-model="mergeOpen"
      noun="artist"
      :from="mergeFrom"
      :search="searchArtists"
      :merge="admin.mergeArtists"
      @merged="load(true)"
    />
  </section>
</template>

<style scoped src="./adminCatalog.css"></style>
