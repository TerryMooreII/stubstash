<script setup lang="ts">
// Badges by group (Milestones, Travel & places, ...), earned first within each,
// as big cards with progress. Used on the Badges page and other people's profiles.
import { computed } from "vue";
import { SsBadgeTile, SsSkeleton } from "@/design-system";
import { badgeNumbers, groupBadges } from "@/lib/badgeArt";
import type { Badge } from "@/lib/types";

const props = defineProps<{ badges: Badge[]; loading?: boolean }>();
const groups = computed(() => groupBadges(props.badges));
const badgeNo = computed(() => badgeNumbers(props.badges));
</script>

<template>
  <div v-if="loading && !badges.length" class="badges">
    <SsSkeleton v-for="i in 4" :key="i" height="230px" radius="18px" />
  </div>
  <div v-else class="groups">
    <section v-for="g in groups" :key="g.key" class="badge-group" :aria-label="g.label">
      <h3 class="badge-group__title">
        {{ g.label }}
        <span class="badge-group__n">{{ g.badges.filter((b) => b.earned).length }}/{{ g.badges.length }}</span>
      </h3>
      <div class="badges">
        <SsBadgeTile
          v-for="b in g.badges"
          :key="b.key"
          layout="card"
          :badge-key="b.key"
          :index="badgeNo.get(b.key) ?? 0"
          :name="b.name"
          :description="b.description"
          :color="b.color"
          :earned="b.earned"
          :progress="b.progress"
          :target="b.target"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.badge-group + .badge-group { margin-top: 26px; }
.badge-group__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 12px;
  font-family: var(--ss-font-mono);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: var(--ss-tracking-mono, 0.14em);
  text-transform: uppercase;
  color: var(--ss-accent);
}
.badge-group__n { color: var(--ss-text-faint); }
.badges {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
  gap: 14px;
}
</style>
