<script setup lang="ts">
// "Memories" tiles: add photos (queued until save) and a ticket stub photo.
// Also lists photos already saved on the show, with delete.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { SsIcon } from "@/design-system";

export interface SavedPhoto { id: string; storage_path: string; url: string | null }

const photos = defineModel<File[]>("photos", { default: () => [] });
const stub = defineModel<File | null>("stub", { default: null });
const props = defineProps<{ saved?: SavedPhoto[]; savedStubUrl?: string | null; stubRemoved?: boolean }>();
const emit = defineEmits<{ "delete-saved": [photo: SavedPhoto]; "remove-stub": [] }>();

const photoInput = ref<HTMLInputElement>();
const stubInput = ref<HTMLInputElement>();

// Object URLs for previews, revoked when files change.
const previews = ref<string[]>([]);
const stubPreview = ref<string | null>(null);
watch(photos, (files) => {
  previews.value.forEach(URL.revokeObjectURL);
  previews.value = files.map((f) => URL.createObjectURL(f));
}, { immediate: true });
watch(stub, (f) => {
  if (stubPreview.value) URL.revokeObjectURL(stubPreview.value);
  stubPreview.value = f ? URL.createObjectURL(f) : null;
}, { immediate: true });
onBeforeUnmount(() => {
  previews.value.forEach(URL.revokeObjectURL);
  if (stubPreview.value) URL.revokeObjectURL(stubPreview.value);
});

function onPhotos(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []).filter((f) => f.type.startsWith("image/"));
  photos.value = [...photos.value, ...files].slice(0, 30);
  (e.target as HTMLInputElement).value = "";
}
function onStub(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) stub.value = f;
  (e.target as HTMLInputElement).value = "";
}
function dropPhoto(i: number) {
  photos.value = photos.value.filter((_, j) => j !== i);
}

const photoCount = computed(() => photos.value.length + (props.saved?.length ?? 0));
const hasStub = computed(() => !!stub.value || (!!props.savedStubUrl && !props.stubRemoved));
const stubSrc = computed(() => stubPreview.value ?? (props.stubRemoved ? null : props.savedStubUrl ?? null));
</script>

<template>
  <div class="pp">
    <div class="pp__tiles">
      <button type="button" class="pp__tile" @click="photoInput?.click()">
        <span class="pp__plus">+</span>
        {{ photoCount ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : "Add photos" }}
      </button>
      <button type="button" class="pp__tile" :class="{ 'is-done': hasStub }" @click="stubInput?.click()">
        <span class="pp__tag">{{ hasStub ? "STUB ✓" : "CAMERA" }}</span>
        {{ hasStub ? "Replace stub" : "Ticket stub photo" }}
      </button>
    </div>
    <input ref="photoInput" type="file" accept="image/*" multiple hidden @change="onPhotos" />
    <input ref="stubInput" type="file" accept="image/*" capture="environment" hidden @change="onStub" />

    <div v-if="stubSrc" class="pp__stub">
      <img :src="stubSrc" alt="Ticket stub" />
      <button type="button" class="pp__del" aria-label="Remove ticket stub" @click="stub ? (stub = null) : emit('remove-stub')">
        <SsIcon name="close" :size="14" />
      </button>
    </div>

    <div v-if="photoCount" class="pp__grid">
      <div v-for="p in saved ?? []" :key="p.id" class="pp__thumb">
        <img v-if="p.url" :src="p.url" alt="" loading="lazy" />
        <button type="button" class="pp__del" aria-label="Delete photo" @click="emit('delete-saved', p)"><SsIcon name="trash" :size="14" /></button>
      </div>
      <div v-for="(src, i) in previews" :key="src" class="pp__thumb is-new">
        <img :src="src" alt="" />
        <button type="button" class="pp__del" aria-label="Remove photo" @click="dropPhoto(i)"><SsIcon name="close" :size="14" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; gap: 10px; }
.pp__tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pp__tile {
  height: 96px;
  border-radius: 12px;
  border: 2px dashed var(--ss-line-strong);
  background: var(--ss-surface-0);
  color: var(--ss-text-2);
  font-weight: 700;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-align: center;
  padding: 0 8px;
}
.pp__tile:hover { border-color: var(--ss-text-faint); }
.pp__tile.is-done { border-color: var(--ss-teal); }
.pp__plus { font-size: 24px; font-weight: 900; color: var(--ss-accent); line-height: 1; }
.pp__tag { font-family: var(--ss-font-mono); font-size: 13px; letter-spacing: 0.12em; color: var(--ss-teal); }
.pp__stub { position: relative; border-radius: 10px; overflow: hidden; max-height: 160px; }
.pp__stub img { width: 100%; height: 160px; object-fit: cover; }
.pp__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; }
.pp__thumb { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: var(--ss-surface-2); }
.pp__thumb img { width: 100%; height: 100%; object-fit: cover; }
.pp__thumb.is-new { outline: 2px solid var(--ss-accent-soft); }
.pp__del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 0;
  background: rgba(10, 9, 12, 0.75);
  color: var(--ss-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
