<script setup lang="ts">
// Round avatar: photo if available, else initial on a stable color
// (or the yellow→teal gradient for "me", as in the design).
import { computed } from "vue";
import { avatarColor } from "@/lib/color";
import { initials } from "@/lib/format";
import { avatarUrl } from "@/lib/media";

const props = withDefaults(
  defineProps<{ name?: string | null; path?: string | null; src?: string | null; size?: number; me?: boolean; ring?: boolean }>(),
  { size: 40 },
);
const url = computed(() => props.src ?? avatarUrl(props.path));
const bg = computed(() => (props.me ? "linear-gradient(135deg, var(--ss-yellow), var(--ss-teal))" : avatarColor(props.name ?? "?")));
</script>

<template>
  <span
    class="ss-avatar"
    :class="{ 'ss-avatar--ring': ring }"
    :style="{ width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.42) + 'px', background: url ? undefined : bg }"
    :aria-label="name ?? undefined"
    role="img"
  >
    <img v-if="url" :src="url" alt="" loading="lazy" />
    <template v-else>{{ initials(name) }}</template>
  </span>
</template>

<style scoped>
.ss-avatar {
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ss-on-accent);
  font-weight: 900;
  overflow: hidden;
  background: var(--ss-surface-2);
}
.ss-avatar--ring {
  border: 2px solid var(--ss-surface-1);
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
