<script setup lang="ts">
// Admin: artists. Search, filter, edit, re-run image lookup, merge duplicates.
import { computed, onMounted, reactive, ref, watch } from "vue";
import { SsArt, SsButton, SsChip, SsEmpty, SsField, SsInput, SsSheet, SsSkeleton, SsTag } from "@/design-system";
import MergePicker, { type MergeItem } from "@/components/admin/MergePicker.vue";
import { admin, type AdminArtist, type ArtistFilter, type ArtistPatch } from "@/lib/admin";
import { errorMessage } from "@/lib/supabase";
import { num } from "@/lib/format";
import { useUi } from "@/stores/ui";

const ui = useUi();
const PAGE = 50;
const FILTERS: { key: ArtistFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "no_image", label: "No image" },
  { key: "manual", label: "Added by users" },
  { key: "unused", label: "Unused" },
];

const q = ref("");
const filter = ref<ArtistFilter>("all");
const rows = ref<AdminArtist[]>([]);
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
    const list = await admin.artists(q.value.trim(), filter.value, PAGE, reset ? 0 : rows.value.length);
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

// ---- requeue
const queueing = reactive<Record<string, boolean>>({});
async function requeue(ids: string[], key: string) {
  queueing[key] = true;
  try {
    const n = await admin.requeue("artist", ids);
    ui.flash(n > 1 ? `Queued ${num(n)} artists. The lookup runs every 2 minutes.` : "Queued. The lookup runs every 2 minutes.");
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    queueing[key] = false;
  }
}

// ---- edit
const editing = ref<AdminArtist | null>(null);
const editOpen = ref(false);
const form = reactive({ name: "", genre: "", disambiguation: "", image_url: "", image_credit: "" });
const saving = ref(false);
const previewFailed = ref(false);

function startEdit(a: AdminArtist) {
  editing.value = a;
  Object.assign(form, {
    name: a.name,
    genre: a.genre ?? "",
    disambiguation: a.disambiguation ?? "",
    image_url: a.image_url ?? "",
    image_credit: a.image_credit ?? "",
  });
  previewFailed.value = false;
  editOpen.value = true;
}
watch(() => form.image_url, () => (previewFailed.value = false));

const patch = computed<ArtistPatch>(() => {
  const a = editing.value;
  if (!a) return {};
  const p: ArtistPatch = {};
  const t = (s: string) => s.trim();
  if (t(form.name) && t(form.name) !== a.name) p.name = t(form.name);
  if (t(form.genre) !== (a.genre ?? "")) p.genre = t(form.genre);
  if (t(form.disambiguation) !== (a.disambiguation ?? "")) p.disambiguation = t(form.disambiguation);
  if (t(form.image_url) !== (a.image_url ?? "")) p.image_url = t(form.image_url);
  if (t(form.image_credit) !== (a.image_credit ?? "")) p.image_credit = t(form.image_credit);
  return p;
});
const dirty = computed(() => Object.keys(patch.value).length > 0);
const urlInvalid = computed(() => !!form.image_url.trim() && !/^https:\/\//i.test(form.image_url.trim()));

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
      <span class="ss-muted">{{ loading ? "Loading…" : `${num(total)} artist${total === 1 ? "" : "s"}` }}</span>
      <SsButton
        v-if="filter === 'no_image' && rows.length"
        size="sm"
        variant="outline"
        :loading="queueing.bulk"
        @click="requeue(missingIds, 'bulk')"
      >
        Find images for all missing
      </SsButton>
    </div>

    <SsEmpty v-if="error" title="Couldn't load artists" :body="error">
      <SsButton size="sm" variant="outline" @click="load(true)">Try again</SsButton>
    </SsEmpty>

    <div v-else-if="loading" class="rows">
      <SsSkeleton v-for="i in 5" :key="i" height="76px" radius="var(--ss-radius-md)" />
    </div>

    <SsEmpty v-else-if="!rows.length" title="No artists match" body="Try another search or filter." />

    <ul v-else class="rows">
      <li v-for="a in rows" :key="a.id" class="row">
        <SsArt :src="a.image_url" :seed="a.name" :alt="a.name" class="row__img" />
        <div class="row__body">
          <RouterLink :to="`/app/artists/${a.id}`" class="row__name">{{ a.name }}</RouterLink>
          <div v-if="a.disambiguation" class="row__sub">{{ a.disambiguation }}</div>
          <div class="row__tags">
            <SsTag :tone="a.source === 'manual' ? 'lavender' : 'teal'">{{ a.source === "manual" ? "ADDED BY USER" : "SETLIST.FM" }}</SsTag>
            <SsTag v-if="a.genre" tone="dark">{{ a.genre }}</SsTag>
            <SsTag :tone="a.image_url ? 'outline' : 'butter'">{{ a.image_url ? (a.image_source ?? "image") : (a.image_checked_at ? "NO IMAGE" : "LOOKING…") }}</SsTag>
          </div>
          <div class="row__stats">{{ num(a.shows) }} show{{ a.shows === 1 ? "" : "s" }} · {{ num(a.fans) }} fan{{ a.fans === 1 ? "" : "s" }}</div>
        </div>
        <div class="row__actions">
          <SsButton size="sm" variant="outline" @click="startEdit(a)">Edit</SsButton>
          <SsButton size="sm" variant="ghost" :loading="queueing[a.id]" @click="requeue([a.id], a.id)">Find image again</SsButton>
          <SsButton size="sm" variant="ghost" @click="startMerge(a)">Merge</SsButton>
        </div>
      </li>
    </ul>

    <SsButton v-if="!loading && rows.length < total" variant="outline" class="more" :loading="loadingMore" @click="load(false)">
      Load more
    </SsButton>

    <!-- Edit -->
    <SsSheet v-model="editOpen" label="Edit artist" :width="520">
      <form v-if="editing" class="edit" @submit.prevent="save">
        <h2 class="ss-h2">Edit {{ editing.name }}</h2>
        <SsField label="Name"><SsInput v-model="form.name" /></SsField>
        <div class="two">
          <SsField label="Genre"><SsInput v-model="form.genre" placeholder="e.g. Bluegrass" /></SsField>
          <SsField label="Disambiguation" hint="Tells same-named artists apart"><SsInput v-model="form.disambiguation" /></SsField>
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
