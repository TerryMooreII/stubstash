<script setup lang="ts">
import { SsCard } from "@/design-system";
import type { DashboardStats } from "@/lib/types";

defineProps<{ songs: DashboardStats["top_songs"] }>();
</script>

<template>
  <SsCard title="Songs you’ve heard most">
    <ol v-if="songs.length" class="list">
      <li v-for="(s, i) in songs.slice(0, 6)" :key="s.artist_id + s.name" class="row">
        <span class="row__rank">{{ String(i + 1).padStart(2, "0") }}</span>
        <div class="row__body">
          <div class="row__title">{{ s.name }}</div>
          <RouterLink :to="`/app/artists/${s.artist_id}`" class="row__artist">{{ s.artist }}</RouterLink>
        </div>
        <div class="row__n ss-num">{{ s.n }}<span> live</span></div>
      </li>
    </ol>
    <p v-else class="ss-muted">Hear a song twice and it lands here.</p>
  </SsCard>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--ss-line-soft); }
.row__rank { font-family: var(--ss-font-mono); font-size: 11px; color: var(--ss-text-faint); width: 20px; }
.row__body { flex: 1; min-width: 0; }
.row__title { font-weight: 700; font-size: 15px; overflow-wrap: anywhere; }
.row__artist { font-size: 12px; color: var(--ss-text-muted); }
.row__n { font-weight: 900; font-size: 20px; white-space: nowrap; }
.row__n span { font-size: 12px; color: var(--ss-text-muted); font-weight: 600; }
</style>
