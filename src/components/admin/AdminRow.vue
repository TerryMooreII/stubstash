<script setup lang="ts">
// One artist or venue row in the admin lists.
import { SsArt } from "@/design-system";

defineProps<{ name: string; image: string | null; to: string; sub?: string | null }>();
</script>

<template>
  <li class="row ss-tile">
    <SsArt :src="image" :seed="name" :alt="name" class="row__img" />
    <div class="row__body">
      <RouterLink :to="to" class="row__name">{{ name }}</RouterLink>
      <div v-if="sub" class="row__sub">{{ sub }}</div>
      <div class="row__tags"><slot name="tags" /></div>
      <div class="row__stats"><slot name="stats" /></div>
    </div>
    <div class="row__actions"><slot name="actions" /></div>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 14px;
  min-width: 0;
}
.row__img { width: 56px; height: 56px; border-radius: var(--ss-radius-sm); }
.row__body { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.row__name { font-weight: 900; font-size: 17px; color: var(--ss-text); overflow-wrap: anywhere; }
.row__sub { font-size: 13px; color: var(--ss-text-muted); overflow-wrap: anywhere; }
.row__tags { display: flex; gap: 6px; flex-wrap: wrap; }
.row__stats { font-size: 13px; color: var(--ss-text-faint); }
.row__actions { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; }
</style>
