<script setup lang="ts">
// One person in a list: avatar, name + @handle, a "why" line, and an action button
// whose label follows the friendship state (Add / Requested / Friends / Accept).
import { computed } from "vue";
import { SsAvatar, SsButton } from "@/design-system";
import type { FriendshipState } from "@/lib/types";

const props = defineProps<{
  name: string;
  handle: string;
  avatarPath?: string | null;
  why?: string | null;
  state?: FriendshipState;
  busy?: boolean;
  hideAction?: boolean;
}>();
const emit = defineEmits<{ add: [] }>();

const label = computed(() =>
  props.state === "friends" ? "Friends" : props.state === "sent" ? "Requested" : props.state === "received" ? "Accept" : "Add",
);
const done = computed(() => props.state === "friends" || props.state === "sent");
</script>

<template>
  <div class="person">
    <RouterLink :to="`/u/${handle}`" class="person__who">
      <SsAvatar :name="name || handle" :path="avatarPath" :size="44" />
      <div class="person__text">
        <div class="person__name ss-truncate">
          {{ name || handle }} <span class="person__handle">@{{ handle }}</span>
        </div>
        <div v-if="why" class="person__why">{{ why }}</div>
      </div>
    </RouterLink>
    <slot name="action">
      <SsButton
        v-if="!hideAction"
        size="sm"
        :variant="done ? 'outline' : 'primary'"
        :disabled="done"
        :loading="busy"
        @click="emit('add')"
      >
        {{ label }}
      </SsButton>
    </slot>
  </div>
</template>

<style scoped>
.person {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--ss-line-soft);
}
.person__who {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ss-text);
  text-decoration: none;
}
.person__who:hover {
  text-decoration: none;
  color: var(--ss-text);
}
.person__text {
  min-width: 0;
}
.person__name {
  font-weight: 700;
}
.person__handle {
  color: var(--ss-text-faint);
  font-weight: 600;
}
.person__why {
  font-size: 13px;
  color: var(--ss-text-muted);
}
</style>
