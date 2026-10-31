<script setup lang="ts" generic="T extends { id: string }">
// The list part of an admin tab: error, loading skeletons, empty state, rows
// (each slot renders its own <li>) and "Load more".
import { SsButton, SsEmpty, SsSkeleton } from "@/design-system";

withDefaults(
  defineProps<{
    rows: T[];
    total: number;
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    errorTitle: string;
    emptyTitle: string;
    emptyBody?: string;
    skeletonHeight?: string;
  }>(),
  { emptyBody: undefined, skeletonHeight: "76px" },
);
defineEmits<{ retry: []; more: [] }>();
defineSlots<{ default(p: { item: T }): unknown; more?(): unknown }>();
</script>

<template>
  <SsEmpty v-if="error" :title="errorTitle" :body="error">
    <SsButton size="sm" variant="outline" @click="$emit('retry')">Try again</SsButton>
  </SsEmpty>

  <div v-else-if="loading" class="rows">
    <SsSkeleton v-for="i in 5" :key="i" :height="skeletonHeight" radius="var(--ss-radius-md)" />
  </div>

  <SsEmpty v-else-if="!rows.length" :title="emptyTitle" :body="emptyBody" />

  <ul v-else class="rows ss-list">
    <template v-for="item in rows" :key="item.id"><slot :item="item" /></template>
  </ul>

  <SsButton v-if="!loading && rows.length < total" variant="outline" class="more" :loading="loadingMore" @click="$emit('more')">
    <slot name="more">Load more</slot>
  </SsButton>
</template>

<style scoped>
.rows { display: flex; flex-direction: column; gap: 8px; }
.more { align-self: center; }
</style>
