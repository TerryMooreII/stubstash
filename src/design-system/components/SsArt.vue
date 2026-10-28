<script setup lang="ts">
// Artist/venue image with the striped gradient placeholder from the design.
// Shows a small credit tag (e.g. "ARTIST IMAGE · WIKIMEDIA COMMONS") when asked.
import { computed, ref, watch } from "vue";
import { placeholderArt } from "@/lib/color";

const props = withDefaults(
  defineProps<{
    src?: string | null;
    seed: string;              // stable key for the placeholder colors (artist/venue name)
    alt?: string;
    shape?: "rect" | "circle";
    credit?: string | null;    // e.g. "Wikimedia Commons: File.jpg"
    creditLabel?: string;      // e.g. "ARTIST IMAGE"
    eager?: boolean;
  }>(),
  { shape: "rect", alt: "" },
);

const emit = defineEmits<{ error: [] }>();
const failed = ref(false);
watch(() => props.src, () => (failed.value = false));
const showImg = computed(() => !!props.src && !failed.value);
const creditText = computed(() => {
  if (!props.credit) return null;
  const source = props.credit.split(":")[0]!.replace(/^Image via /, "");
  return [props.creditLabel, source].filter(Boolean).join(" · ").toUpperCase();
});
</script>

<template>
  <div class="ss-art" :class="`ss-art--${shape}`" :style="{ background: placeholderArt(seed) }">
    <img
      v-if="showImg"
      :src="src!"
      :alt="alt"
      :loading="eager ? 'eager' : 'lazy'"
      referrerpolicy="no-referrer"
      decoding="async"
      @error="failed = true; emit('error')"
    />
    <span v-if="creditText && showImg" class="ss-art__credit" :title="credit ?? undefined">{{ creditText }}</span>
    <slot />
  </div>
</template>

<style scoped>
.ss-art {
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}
.ss-art--circle {
  border-radius: 50%;
}
img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ss-art__credit {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
  padding: 5px 10px;
  border-radius: var(--ss-radius-xs);
  background: rgba(10, 9, 12, 0.7);
  font-family: var(--ss-font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ss-text-2);
  max-width: calc(100% - 28px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ss-art--circle .ss-art__credit {
  top: auto;
  bottom: 20px;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  font-size: 9px;
}
</style>
