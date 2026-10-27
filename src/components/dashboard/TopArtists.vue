<script setup lang="ts">
import { computed } from "vue";
import { SsArt, SsCard } from "@/design-system";
import { accentFor } from "@/lib/color";
import type { DashboardStats } from "@/lib/types";

const props = defineProps<{ artists: DashboardStats["top_artists"] }>();
const max = computed(() => Math.max(1, ...props.artists.map((a) => a.n)));
</script>

<template>
  <SsCard title="Most-seen artists">
    <div class="list">
      <RouterLink v-for="a in artists.slice(0, 5)" :key="a.id" :to="`/app/artists/${a.id}`" class="row">
        <SsArt :src="a.image_url" :seed="a.name" shape="circle" class="row__img" />
        <div class="row__body">
          <div class="row__top"><span class="ss-truncate">{{ a.name }}</span><span class="row__n">{{ a.n }}×</span></div>
          <div class="row__track"><div class="row__bar" :style="{ width: (a.n / max) * 100 + '%', background: accentFor(a.name) }" /></div>
        </div>
      </RouterLink>
      <p v-if="!artists.length" class="ss-muted">Your most-seen artists show up here.</p>
    </div>
  </SsCard>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; align-items: center; gap: 12px; color: var(--ss-text); text-decoration: none; }
.row:hover { text-decoration: none; color: var(--ss-text); }
.row:hover .row__top span:first-child { color: var(--ss-accent); }
.row__img { width: 44px; height: 44px; }
.row__body { flex: 1; min-width: 0; }
.row__top { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-size: 15px; }
.row__n { font-weight: 900; color: var(--ss-accent); }
.row__track { height: 6px; border-radius: 6px; background: var(--ss-surface-2); margin-top: 6px; }
.row__bar { height: 100%; border-radius: 6px; transition: width 600ms var(--ss-ease); }
</style>
