<script setup lang="ts">
// Admin: health overview, users, and catalog cleanup (artists, venues).
// The route is admin-only; every call is also checked on the server.
import { useQueryTab } from "@/composables/useQueryTab";
import { SsPageHeader, SsTabs } from "@/design-system";
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

const { tab, go, model: tabModel } = useQueryTab<Tab>("tab", () => TABS.map((x) => x.key), "overview");
</script>

<template>
  <div class="ss-page admin">
    <SsPageHeader kicker="Admin" title="Run the place" />

    <SsTabs v-model="tabModel" label="Admin sections" :tabs="TABS" />

    <KeepAlive>
      <AdminOverview v-if="tab === 'overview'" @go="go" />
      <AdminUsers v-else-if="tab === 'users'" />
      <AdminArtists v-else-if="tab === 'artists'" />
      <AdminVenues v-else />
    </KeepAlive>
  </div>
</template>
