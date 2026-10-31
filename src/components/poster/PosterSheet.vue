<script setup lang="ts">
// The show's generated gig poster, full size. "Another design" re-rolls the
// art; "Save poster" shares or downloads it as a PNG.
import { ref, watch } from "vue";
import { SsButton, SsIcon, SsSheet } from "@/design-system";
import GigPoster from "./GigPoster.vue";
import ImageSheetActions from "@/components/share/ImageSheetActions.vue";
import { useShareImage } from "@/composables/useShareImage";

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

const take = ref(0);
watch(() => props.seed, () => (take.value = 0));
const posterEl = ref<HTMLElement>();
const { share, busy } = useShareImage(posterEl);
const save = () => share("poster", `${props.artist} ${props.date}`, "Poster saved");
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
    <ImageSheetActions @close="open = false">
      <SsButton variant="outline" size="sm" class="actions__dark" @click="take++">
        <SsIcon name="refresh" :size="16" />Another design
      </SsButton>
      <SsButton variant="light" size="sm" :loading="busy" @click="save">
        <SsIcon name="share" :size="16" />Save poster
      </SsButton>
    </ImageSheetActions>
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
</style>
