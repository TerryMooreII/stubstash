<script setup lang="ts">
// Admin edit sheets: image URL with a live preview, plus the credit line.
import { computed, ref, watch } from "vue";
import { SsField, SsInput } from "@/design-system";
import { imageUrlInvalid } from "./catalog";

const url = defineModel<string>("url", { required: true });
const credit = defineModel<string>("credit", { required: true });

const invalid = computed(() => imageUrlInvalid(url.value));
const previewFailed = ref(false);
watch(url, () => (previewFailed.value = false));
</script>

<template>
  <SsField label="Image URL" :error="invalid ? 'Use an https:// link' : null" hint="Leave empty to remove the image">
    <SsInput v-model="url" placeholder="https://…" inputmode="url" :invalid="invalid" />
  </SsField>
  <div class="preview">
    <img
      v-if="url.trim() && !invalid && !previewFailed"
      :src="url.trim()"
      alt="Preview"
      referrerpolicy="no-referrer"
      @error="previewFailed = true"
    />
    <span v-else class="ss-muted">{{ previewFailed ? "That image didn't load." : "No image" }}</span>
  </div>
  <SsField label="Image credit"><SsInput v-model="credit" placeholder="e.g. Wikimedia Commons: File.jpg" /></SsField>
</template>

<style scoped>
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
</style>
