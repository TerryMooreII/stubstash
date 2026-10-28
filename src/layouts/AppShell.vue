<script setup lang="ts">
// App frame from the design: sidebar on desktop; top bar + tab bar with a
// floating "+" on phones. Also used (signed out) for public profile pages.
import { computed } from "vue";
import { useRoute } from "vue-router";
import { SsAvatar, SsButton, SsIcon, SsLogo, type IconName } from "@/design-system";
import InstallSheet from "@/components/InstallSheet.vue";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";
import { plural } from "@/lib/format";

const auth = useAuth();
const log = useLog();
const ui = useUi();
const route = useRoute();

const active = computed(() => route.meta.nav);
const items: { key: "home" | "shows" | "map" | "profile"; label: string; short: string; icon: IconName; to: string }[] = [
  { key: "home", label: "Dashboard", short: "Home", icon: "home", to: "/app" },
  { key: "shows", label: "My shows", short: "Shows", icon: "ticket", to: "/app/shows" },
  { key: "map", label: "Map", short: "Map", icon: "pin", to: "/app/map" },
  { key: "profile", label: "Profile & badges", short: "Me", icon: "user", to: "/app/me" },
];
</script>

<template>
  <div class="shell" :class="{ 'shell--mobile': ui.isMobile }">
    <!-- Desktop sidebar -->
    <nav v-if="!ui.isMobile" class="side" aria-label="Main">
      <RouterLink :to="auth.signedIn ? '/app' : '/'" class="side__logo"><SsLogo :size="24" /></RouterLink>
      <template v-if="auth.signedIn">
        <SsButton to="/app/log" class="side__log"><SsIcon name="plus" :stroke="2.6" :size="18" />Log a show</SsButton>
        <RouterLink v-for="i in items" :key="i.key" :to="i.to" class="side__item" :class="{ 'is-active': active === i.key }">
          <SsIcon :name="i.icon" />{{ i.label }}
        </RouterLink>
        <RouterLink v-if="auth.isAdmin" to="/app/admin" class="side__item" :class="{ 'is-active': active === 'admin' }">
          <SsIcon name="lock" />Admin
        </RouterLink>
      </template>
      <div class="side__spacer" />
      <div v-if="ui.showInstallNudge" class="side__install">
        <div class="side__install-title">Put Stubstash in your dock</div>
        <div class="side__install-body">Works offline at the venue. No app store.</div>
        <SsButton variant="accent-outline" size="sm" @click="ui.installSheetOpen = true">Install app</SsButton>
      </div>
      <RouterLink v-if="auth.signedIn && auth.profile" to="/app/me" class="side__me">
        <SsAvatar :name="auth.displayName" :path="auth.profile.avatar_path" me :size="36" />
        <div class="ss-truncate">
          <div class="side__me-name ss-truncate">{{ auth.displayName }}</div>
          <div class="side__me-sub">@{{ auth.profile.handle }}<template v-if="log.loaded"> · {{ plural(log.total, "show") }}</template></div>
        </div>
      </RouterLink>
      <div v-else-if="!auth.signedIn" class="side__guest">
        <SsButton to="/signup" block>Start your log</SsButton>
        <SsButton to="/login" variant="ghost" block>Sign in</SsButton>
      </div>
    </nav>

    <div class="main">
      <!-- Mobile top bar -->
      <header v-if="ui.isMobile" class="top">
        <RouterLink :to="auth.signedIn ? '/app' : '/'" aria-label="Home"><SsLogo :size="20" /></RouterLink>
        <div class="top__actions">
          <button v-if="ui.showInstallNudge" class="top__btn" aria-label="Install app" @click="ui.installSheetOpen = true">
            <SsIcon name="download" :size="16" :stroke="2.2" />
          </button>
          <RouterLink v-if="auth.signedIn" to="/app/me" aria-label="Profile">
            <SsAvatar :name="auth.displayName" :path="auth.profile?.avatar_path" me :size="36" />
          </RouterLink>
          <SsButton v-else to="/signup" size="sm">Join</SsButton>
        </div>
      </header>

      <div v-if="!ui.online" class="offline" role="status">You're offline. Showing what's saved on this device.</div>

      <main class="content" :class="{ 'content--full': route.name === 'map' || route.name === 'profile-map' }">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </main>

      <!-- Mobile tab bar -->
      <nav v-if="ui.isMobile && auth.signedIn" class="tabs" aria-label="Main">
        <RouterLink v-for="i in items.slice(0, 2)" :key="i.key" :to="i.to" class="tabs__item" :class="{ 'is-active': active === i.key }">
          <SsIcon :name="i.icon" :size="22" />{{ i.short }}
        </RouterLink>
        <RouterLink to="/app/log" class="tabs__log" aria-label="Log a show"><SsIcon name="plus" :size="24" :stroke="2.8" /></RouterLink>
        <RouterLink v-for="i in items.slice(2)" :key="i.key" :to="i.to" class="tabs__item" :class="{ 'is-active': active === i.key }">
          <SsIcon :name="i.icon" :size="22" />{{ i.short }}
        </RouterLink>
      </nav>
    </div>

    <InstallSheet />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100dvh;
  background: var(--ss-bg);
}

/* ---- sidebar ---- */
.side {
  position: sticky;
  top: 0;
  height: 100dvh;
  width: var(--ss-nav-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 22px 14px;
  background: var(--ss-surface-0);
  border-right: 1px solid var(--ss-line-soft);
  overflow-y: auto;
}
.side__logo { padding: 0 10px 18px; text-decoration: none; }
.side__log { margin-bottom: 14px; }
.side__item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 42px;
  padding: 0 12px;
  border-radius: var(--ss-radius-sm);
  color: var(--ss-text-3);
  font-weight: 700;
  font-size: 15px;
  text-decoration: none;
}
.side__item:hover { color: var(--ss-text); background: rgba(255, 255, 255, 0.03); text-decoration: none; }
.side__item.is-active { background: var(--ss-accent-soft); color: var(--ss-accent); }
.side__spacer { flex: 1; }
.side__install {
  padding: 14px;
  border-radius: var(--ss-radius-md);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line);
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.side__install-title { font-weight: 900; font-size: 16px; line-height: 1.1; }
.side__install-body { font-size: 13px; color: var(--ss-text-muted); line-height: 1.35; }
.side__me {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 12px;
  color: var(--ss-text);
  text-decoration: none;
  min-width: 0;
}
.side__me:hover { background: rgba(255, 255, 255, 0.03); text-decoration: none; color: var(--ss-text); }
.side__me-name { font-weight: 700; font-size: 14px; }
.side__me-sub { font-size: 12px; color: var(--ss-text-muted); }
.side__guest { display: flex; flex-direction: column; gap: 6px; }

/* ---- main column ---- */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.content {
  flex: 1;
  min-width: 0;
}
.shell--mobile .content {
  padding-bottom: calc(var(--ss-tabbar-h) + var(--ss-safe-bottom) + 8px);
}
.content--full {
  display: flex;
  flex-direction: column;
}

/* ---- mobile top bar ---- */
.top {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--ss-topbar-h);
  padding: var(--ss-safe-top) 16px 0;
  box-sizing: content-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--ss-line-soft);
  background: rgba(10, 9, 12, 0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.top a { text-decoration: none; }
.top__actions { display: flex; gap: 8px; align-items: center; }
.top__btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--ss-line);
  background: var(--ss-surface-1);
  color: var(--ss-text-2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.offline {
  padding: 8px 16px;
  background: var(--ss-surface-2);
  border-bottom: 1px solid var(--ss-line);
  font-size: 13px;
  color: var(--ss-text-3);
  text-align: center;
}

/* ---- mobile tab bar ---- */
.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  height: var(--ss-tabbar-h);
  padding-bottom: var(--ss-safe-bottom);
  box-sizing: content-box;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: var(--ss-surface-0);
  border-top: 1px solid var(--ss-line-soft);
}
.tabs__item {
  width: 64px;
  height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ss-text-faint);
  text-decoration: none;
}
.tabs__item:hover { text-decoration: none; color: var(--ss-text-3); }
.tabs__item.is-active { color: var(--ss-accent); }
.tabs__log {
  width: 58px;
  height: 58px;
  margin-top: -22px;
  border-radius: 50%;
  border: 4px solid var(--ss-bg);
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px var(--ss-accent-glow);
}
.tabs__log:hover { color: var(--ss-on-accent); }
</style>
