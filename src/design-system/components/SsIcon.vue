<script setup lang="ts">
// Line icons from the design (20x20 grid, currentColor stroke).
export type IconName =
  | "home" | "ticket" | "pin" | "user" | "plus" | "search" | "download" | "close" | "back"
  | "share" | "camera" | "edit" | "check" | "chevron" | "logout" | "bell" | "users" | "settings"
  | "trash" | "star" | "image" | "globe" | "lock" | "music" | "calendar" | "refresh" | "external" | "qr";

withDefaults(defineProps<{ name: IconName; size?: number; stroke?: number; label?: string }>(), {
  size: 20,
  stroke: 2,
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    class="ss-icon"
  >
    <template v-if="name === 'home'"><path d="M3 9.5L10 3.5l7 6V17h-4.5v-4.5h-5V17H3z" /></template>
    <template v-else-if="name === 'ticket'"><rect x="2" y="5" width="16" height="10" rx="2" /><path d="M7 5v10" stroke-dasharray="2 2" /></template>
    <template v-else-if="name === 'pin'"><path d="M10 18s6-5.5 6-10a6 6 0 10-12 0c0 4.5 6 10 6 10z" /><circle cx="10" cy="8" r="2" /></template>
    <template v-else-if="name === 'user'"><circle cx="10" cy="7" r="3.5" /><path d="M3 18c1-4 4-5.5 7-5.5s6 1.5 7 5.5" /></template>
    <template v-else-if="name === 'plus'"><path d="M10 4v12M4 10h12" /></template>
    <template v-else-if="name === 'search'"><circle cx="9" cy="9" r="5.5" /><path d="M13 13l4 4" /></template>
    <template v-else-if="name === 'download'"><path d="M10 3v10M6 9l4 4 4-4M4 17h12" /></template>
    <template v-else-if="name === 'close'"><path d="M5 5l10 10M15 5L5 15" /></template>
    <template v-else-if="name === 'back'"><path d="M12 4l-6 6 6 6" /></template>
    <template v-else-if="name === 'chevron'"><path d="M8 4l6 6-6 6" /></template>
    <template v-else-if="name === 'share'"><path d="M10 13V3M6 7l4-4 4 4M4 11v5h12v-5" /></template>
    <template v-else-if="name === 'camera'"><path d="M3 7h3l1.5-2h5L14 7h3v9H3z" /><circle cx="10" cy="11.5" r="3" /></template>
    <template v-else-if="name === 'edit'"><path d="M13.5 3.5l3 3L7 16H4v-3z" /></template>
    <template v-else-if="name === 'check'"><path d="M4 10.5l4 4 8-9" /></template>
    <template v-else-if="name === 'logout'"><path d="M8 4H4v12h4M12 6l4 4-4 4M16 10H8" /></template>
    <template v-else-if="name === 'bell'"><path d="M5 14V9a5 5 0 0110 0v5l1.5 2h-13zM8.5 18h3" /></template>
    <template v-else-if="name === 'users'"><circle cx="7.5" cy="7" r="3" /><path d="M2 17c.8-3.2 3-4.5 5.5-4.5S12.2 13.8 13 17" /><path d="M13 4.2a3 3 0 010 5.6M15 12.8c1.4.6 2.4 1.9 3 4.2" /></template>
    <template v-else-if="name === 'settings'"><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></template>
    <template v-else-if="name === 'trash'"><path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10h7.4l.8-10" /></template>
    <template v-else-if="name === 'star'"><path d="M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z" /></template>
    <template v-else-if="name === 'image'"><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="7.5" cy="8.5" r="1.5" /><path d="M17 13l-4-4-7 7" /></template>
    <template v-else-if="name === 'globe'"><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2 2.2 3 4.5 3 7s-1 4.8-3 7c-2-2.2-3-4.5-3-7s1-4.8 3-7z" /></template>
    <template v-else-if="name === 'lock'"><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 016 0V9" /></template>
    <template v-else-if="name === 'music'"><path d="M8 15V4l9-1.5V13" /><circle cx="5.5" cy="15" r="2.5" /><circle cx="14.5" cy="13" r="2.5" /></template>
    <template v-else-if="name === 'calendar'"><rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14M7 2.5v4M13 2.5v4" /></template>
    <template v-else-if="name === 'refresh'"><path d="M16 4v4h-4M4 16v-4h4" /><path d="M15.5 8A6 6 0 005 6.5M4.5 12A6 6 0 0015 13.5" /></template>
    <template v-else-if="name === 'external'"><path d="M11 3h6v6M17 3l-8 8M8 5H3v12h12v-5" /></template>
    <template v-else-if="name === 'qr'"><rect x="3" y="3" width="5" height="5" /><rect x="12" y="3" width="5" height="5" /><rect x="3" y="12" width="5" height="5" /><path d="M12 12h2v2M17 12v5h-3M12 16v1" /></template>
  </svg>
</template>

<style scoped>
.ss-icon {
  flex-shrink: 0;
  display: inline-block;
  vertical-align: middle;
}
</style>
