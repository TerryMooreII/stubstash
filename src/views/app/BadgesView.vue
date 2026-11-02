<script setup lang="ts">
// All your badges, grouped, with progress toward the ones you haven't earned.
import { computed } from "vue";
import { SsBackLink, SsButton, SsEmpty, SsPageHeader } from "@/design-system";
import BadgeGroups from "@/components/people/BadgeGroups.vue";
import { badges as loadBadges } from "@/lib/api";
import { useAsyncData } from "@/composables/useAsyncData";

const { data, loading, error, reload } = useAsyncData(() => loadBadges());
const list = computed(() => data.value ?? []);
const earned = computed(() => list.value.filter((b) => b.earned).length);
const kicker = computed(() => (list.value.length ? `${earned.value} of ${list.value.length} earned` : "Your badges"));
</script>

<template>
  <div class="ss-page">
    <SsBackLink fallback="/app/me" label="Profile" />
    <SsPageHeader :kicker="kicker" title="Badges" />
    <SsEmpty v-if="error && !list.length" title="Couldn’t load your badges" :body="error">
      <SsButton variant="outline" size="sm" @click="reload">Try again</SsButton>
    </SsEmpty>
    <BadgeGroups v-else :badges="list" :loading="loading" />
  </div>
</template>
