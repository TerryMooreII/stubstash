<script setup lang="ts">
// The show's generated gig poster, full size. "Another design" re-rolls the
// art; "Save poster" shares or downloads it as a PNG.
import { ref, watch } from "vue";
import { SsButton, SsIcon, SsSheet } from "@/design-system";
import GigPoster from "./GigPoster.vue";
import { shareElementAsPng, slugFile } from "@/lib/shareImage";
import { useUi } from "@/stores/ui";

const open = defineModel<boolean>({ default: false });
const props = defineProps<{
  seed: string;
  artist: string;
  venue: string;
  place?: string | null;
  date: string;
  number?: number | null;
  tour?: string | null;
}>();

const ui = useUi();
const take = ref(0);
watch(() => props.seed, () => (take.value = 0));
const posterEl = ref<HTMLElement>();
const busy = ref(false);

async function save() {
  if (!posterEl.value) return;
  busy.value = true;
  try {
    const res = await shareElementAsPng(posterEl.value, slugFile("poster", `${props.artist} ${props.date}`));
    if (res === "saved") ui.flash("Poster saved");
  } catch {
    ui.error("Couldn't make the image. Try again.");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SsSheet v-model="open" label="Gig poster" bare :width="400">
    <div ref="posterEl" class="frame">
      <GigPoster
        :seed="take ? `${seed}:${take}` : seed"
        :artist="artist"
        :venue="venue"
        :place="place"
        :date="date"
        :number="number"
        :tour="tour"
      />
    </div>
    <div class="actions">
      <SsButton variant="outline" size="sm" class="actions__dark" @click="take++">
        <SsIcon name="refresh" :size="16" />Another design
      </SsButton>
      <SsButton variant="light" size="sm" :loading="busy" @click="save">
        <SsIcon name="share" :size="16" />Save poster
      </SsButton>
      <button type="button" class="close" aria-label="Close" @click="open = false"><SsIcon name="close" :size="18" /></button>
    </div>
  </SsSheet>
</template>

<style scoped>
.frame {
  width: min(340px, 100%);
  flex-shrink: 0;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  border-radius: 4px;
  overflow: hidden;
}
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; }
.actions__dark { background: var(--ss-surface-2); }
.close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--ss-line-strong);
  background: var(--ss-surface-2);
  color: var(--ss-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
