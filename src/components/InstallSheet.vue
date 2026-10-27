<script setup lang="ts">
// "Install Stubstash" sheet. Uses the browser's install prompt where it exists
// (Chrome/Edge/Android); on iPhone shows the Share → Add to Home Screen steps.
import { SsButton, SsSheet } from "@/design-system";
import { useUi } from "@/stores/ui";

const ui = useUi();

async function install() {
  if (ui.canPromptInstall) {
    const ok = await ui.install();
    if (ok) ui.installSheetOpen = false;
  } else {
    ui.installSheetOpen = false;
    ui.flash(ui.isIos ? "Tap Share, then Add to Home Screen" : "Use your browser menu: Install app", "info", 4000);
  }
}
function notNow() {
  ui.installSheetOpen = false;
  ui.dismissInstall();
}
</script>

<template>
  <SsSheet v-model="ui.installSheetOpen" label="Install Stubstash">
    <div class="head">
      <div class="icon" aria-hidden="true">S</div>
      <div>
        <div class="title">Install Stubstash</div>
        <div class="sub">Free · works offline · no app store</div>
      </div>
    </div>
    <ul class="perks">
      <li><b>✓</b>Log shows offline. They sync when you're back on signal.</li>
      <li><b>✓</b>Full screen, launches from your home screen.</li>
      <li><b>✓</b>A nudge the morning after to rate the show.</li>
    </ul>
    <div v-if="ui.isIos" class="ios">
      On iPhone: tap <b>Share</b> <span class="share-glyph" aria-hidden="true">↑</span> then <b>Add to Home Screen</b>.
    </div>
    <div class="actions">
      <SsButton variant="outline" @click="notNow">Not now</SsButton>
      <SsButton v-if="!ui.isIos" @click="install">Install</SsButton>
    </div>
  </SsSheet>
</template>

<style scoped>
.head { display: flex; gap: 14px; align-items: center; }
.icon {
  width: 64px; height: 64px; border-radius: 16px; flex-shrink: 0;
  background: var(--ss-accent); color: var(--ss-on-accent);
  font-weight: 900; font-size: 30px; display: flex; align-items: center; justify-content: center;
}
.title { font-weight: 900; font-size: 22px; line-height: 1.05; }
.sub { font-size: 14px; color: var(--ss-text-muted); }
.perks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 15px; }
.perks li { display: flex; gap: 10px; }
.perks b { color: var(--ss-accent); }
.ios {
  padding: 14px; border-radius: 12px; background: var(--ss-surface-1);
  font-size: 14px; line-height: 1.5; color: var(--ss-text-2);
}
.share-glyph {
  display: inline-flex; width: 20px; height: 20px; border: 1.5px solid var(--ss-text-2); border-radius: 4px;
  align-items: center; justify-content: center; font-size: 12px; vertical-align: middle;
}
.actions { display: flex; gap: 10px; }
.actions > * { flex: 1; }
</style>
