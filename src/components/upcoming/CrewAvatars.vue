<script setup lang="ts">
// Overlapping friend avatars. Friends who aren't going yet are faded.
import { computed } from "vue";
import { SsAvatar } from "@/design-system";
import type { CrewMember } from "@/lib/types";

const props = withDefaults(defineProps<{ crew: CrewMember[]; max?: number; size?: number }>(), { max: 4, size: 28 });
const shown = computed(() => props.crew.filter((c) => c.status !== "cant").slice(0, props.max));
</script>

<template>
  <div v-if="shown.length" class="crew-av" :style="{ '--sz': `${size}px` }">
    <span
      v-for="c in shown"
      :key="c.user_id"
      class="crew-av__one"
      :class="{ 'is-pending': c.status !== 'going' }"
      :title="`${c.display_name || '@' + c.handle}: ${c.status}`"
    >
      <SsAvatar :name="c.display_name || c.handle" :path="c.avatar_path" :size="size" />
    </span>
  </div>
</template>

<style scoped>
.crew-av { display: flex; }
.crew-av__one {
  margin-right: calc(var(--sz) * -0.25);
  border: 2px solid var(--ss-surface-1);
  border-radius: 50%;
  display: inline-flex;
}
.crew-av__one.is-pending { opacity: 0.45; }
</style>
