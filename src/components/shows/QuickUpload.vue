<script setup lang="ts">
// Placeholder tiles on the show page for adding photos and a ticket stub.
// Files upload and save right away (no Edit/Save step).
import { ref } from "vue";
import { SsSpinner } from "@/design-system";
import { updateAttendance } from "@/lib/api";
import { plural } from "@/lib/format";
import { addShowPhoto, upload } from "@/lib/media";
import { errorMessage } from "@/lib/supabase";
import { useUi } from "@/stores/ui";

type SavedPhoto = Awaited<ReturnType<typeof addShowPhoto>>;

const props = defineProps<{ attendanceId: string; hasStub: boolean }>();
const emit = defineEmits<{ "photo-added": [photo: SavedPhoto]; "stub-set": [path: string]; done: [] }>();

const ui = useUi();
const photoInput = ref<HTMLInputElement>();
const stubInput = ref<HTMLInputElement>();
const photoProgress = ref<{ done: number; total: number } | null>(null);
const stubBusy = ref(false);

function pick(input: HTMLInputElement | undefined) {
  if (!ui.online) return ui.error("You're offline. Add photos when you're back on signal.");
  input?.click();
}

async function onPhotos(e: Event) {
  const el = e.target as HTMLInputElement;
  const files = Array.from(el.files ?? []).filter((f) => f.type.startsWith("image/")).slice(0, 30);
  el.value = "";
  if (!files.length || photoProgress.value) return;
  photoProgress.value = { done: 0, total: files.length };
  let failed = 0;
  let lastError: unknown;
  for (const f of files) {
    try {
      emit("photo-added", await addShowPhoto(props.attendanceId, f));
    } catch (err) {
      failed++;
      lastError = err;
    }
    photoProgress.value = { done: photoProgress.value.done + 1, total: files.length };
  }
  photoProgress.value = null;
  const saved = files.length - failed;
  if (failed) ui.error(saved ? `${plural(failed, "photo")} didn't upload. Try adding them again.` : errorMessage(lastError));
  else ui.flash(saved === 1 ? "Photo saved" : `${plural(saved, "photo")} saved`);
  if (saved) emit("done");
}

async function onStub(e: Event) {
  const el = e.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = "";
  if (!file || stubBusy.value) return;
  stubBusy.value = true;
  try {
    const path = await upload("stubs", file, props.attendanceId);
    await updateAttendance(props.attendanceId, { stub_path: path });
    emit("stub-set", path);
    emit("done");
    ui.flash("Ticket stub saved");
  } catch (err) {
    ui.error(errorMessage(err));
  } finally {
    stubBusy.value = false;
  }
}
</script>

<template>
  <button type="button" class="qu" :disabled="!!photoProgress" @click="pick(photoInput)">
    <template v-if="photoProgress">
      <SsSpinner :size="20" />
      <span class="qu__label">Uploading {{ photoProgress.done + 1 }} of {{ photoProgress.total }}</span>
    </template>
    <template v-else>
      <span class="qu__plus" aria-hidden="true">+</span>
      <span class="qu__label">Add photos</span>
    </template>
  </button>
  <button v-if="!hasStub" type="button" class="qu" :disabled="stubBusy" @click="pick(stubInput)">
    <SsSpinner v-if="stubBusy" :size="20" />
    <span v-else class="qu__tag" aria-hidden="true">STUB</span>
    <span class="qu__label">{{ stubBusy ? "Uploading" : "Add ticket stub" }}</span>
  </button>
  <input ref="photoInput" type="file" accept="image/*" multiple hidden @change="onPhotos" />
  <input ref="stubInput" type="file" accept="image/*" capture="environment" hidden @change="onStub" />
</template>

<style scoped>
.qu {
  aspect-ratio: 1;
  border-radius: 8px;
  border: 2px dashed var(--ss-line-strong);
  background: var(--ss-surface-0);
  color: var(--ss-text-2);
  font-weight: 700;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 6px;
  text-align: center;
  cursor: pointer;
}
.qu:hover:not(:disabled) { border-color: var(--ss-text-faint); color: var(--ss-text); }
.qu:disabled { cursor: progress; }
.qu__plus { font-size: 24px; font-weight: 900; color: var(--ss-accent); line-height: 1; }
.qu__tag { font-family: var(--ss-font-mono); font-size: 12px; letter-spacing: 0.12em; color: var(--ss-teal); }
.qu__label { line-height: 1.2; }
</style>
