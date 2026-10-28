<script setup lang="ts">
// Admin: health overview, users, and catalog cleanup (artists, venues).
// The route is admin-only; every call is also checked on the server.
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { SsPageHeader } from "@/design-system";
import AdminOverview from "@/components/admin/AdminOverview.vue";
import AdminUsers from "@/components/admin/AdminUsers.vue";
import AdminArtists from "@/components/admin/AdminArtists.vue";
import AdminVenues from "@/components/admin/AdminVenues.vue";

type Tab = "overview" | "users" | "artists" | "venues";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "artists", label: "Artists" },
  { key: "venues", label: "Venues" },
];

const route = useRoute();
const router = useRouter();
const tab = computed<Tab>(() => {
  const t = route.query.tab;
  return TABS.some((x) => x.key === t) ? (t as Tab) : "overview";
});
function go(t: Tab) {
  router.replace({ query: t === "overview" ? {} : { tab: t } });
}
</script>

<template>
  <div class="ss-page admin">
    <SsPageHeader kicker="Admin" title="Run the place" />

    <div class="tabs" role="tablist" aria-label="Admin sections">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        role="tab"
        class="tab"
        :class="{ on: tab === t.key }"
        :aria-selected="tab === t.key"
        @click="go(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <KeepAlive>
      <AdminOverview v-if="tab === 'overview'" @go="go" />
      <AdminUsers v-else-if="tab === 'users'" />
      <AdminArtists v-else-if="tab === 'artists'" />
      <AdminVenues v-else />
    </KeepAlive>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  align-self: flex-start;
  max-width: 100%;
  overflow-x: auto;
}
.tab {
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--ss-radius-pill);
  background: transparent;
  color: var(--ss-text-3);
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
}
.tab:hover { color: var(--ss-text); }
.tab.on { background: var(--ss-accent); color: var(--ss-on-accent); }
</style>
