<script setup lang="ts">
import { SITE_HOST } from "@/lib/url";
// Stories-sized (9:16) share card from the design. "Shuffle colors" cycles the
// card palette; "Share" renders a PNG and uses the native share sheet when it
// can, otherwise downloads the image.
import { computed, ref } from "vue";
import { toPng } from "html-to-image";
import { SsButton, SsIcon, SsSheet } from "@/design-system";
import { CARD_COLORS } from "@/lib/color";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";
import type { ShareCard } from "./shareCard";

const open = defineModel<boolean>({ default: false });
const props = defineProps<{ card: ShareCard }>();

const auth = useAuth();
const ui = useUi();
const colorIx = ref(0);
const bg = computed(() => CARD_COLORS[colorIx.value % CARD_COLORS.length]);
const footer = computed(
  () => props.card.footer ?? `${SITE_HOST}/u/${auth.profile?.handle ?? ""} · setlist via setlist.fm`,
);
const cardEl = ref<HTMLElement>();
const busy = ref(false);

function shuffle() {
  colorIx.value++;
}

function fileName() {
  const slug = props.card.big.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";
  return `stubstash-${slug}.png`;
}

async function share() {
  if (!cardEl.value) return;
  busy.value = true;
  try {
    const dataUrl = await toPng(cardEl.value, { pixelRatio: 3, cacheBust: true });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName(), { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Stubstash" });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        throw e;
      }
    } else {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = file.name;
      a.click();
      ui.flash("Card saved. Ready for Stories.");
    }
    open.value = false;
  } catch {
    ui.error("Couldn't make the image. Try again.");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SsSheet v-model="open" label="Share card" bare :width="360">
    <div ref="cardEl" class="card" :style="{ background: bg }">
      <div class="card__top"><span>STUBSTASH</span><span>{{ card.kicker }}</span></div>
      <div class="card__mid">
        <div class="card__pre">{{ card.pre }}</div>
        <div class="card__big">{{ card.big }}</div>
        <div class="card__sub">{{ card.sub }}</div>
      </div>
      <div class="card__stats">
        <div v-for="s in card.stats.slice(0, 3)" :key="s.k">
          <div class="card__v">{{ s.v }}</div>
          <div class="card__k">{{ s.k }}</div>
        </div>
      </div>
      <div class="card__foot">{{ footer }}</div>
    </div>
    <div class="actions">
      <SsButton variant="outline" size="sm" class="actions__dark" @click="shuffle">Shuffle colors</SsButton>
      <SsButton variant="light" size="sm" :loading="busy" @click="share">
        <SsIcon name="share" :size="16" />Share
      </SsButton>
      <button type="button" class="close" aria-label="Close" @click="open = false"><SsIcon name="close" :size="18" /></button>
    </div>
  </SsSheet>
</template>

<style scoped>
.card {
  width: 300px;
  height: 533px;
  max-width: 100%;
  border-radius: 20px;
  overflow: hidden;
  color: var(--ss-on-accent);
  display: flex;
  flex-direction: column;
  padding: 26px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  font-family: var(--ss-font);
  flex-shrink: 0;
}
.card__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--ss-font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  font-weight: 700;
}
.card__mid {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  min-height: 0;
}
.card__pre { font-weight: 900; font-size: 17px; }
.card__big {
  font-weight: 900;
  font-size: 58px;
  line-height: 0.84;
  letter-spacing: -0.045em;
  text-wrap: balance;
  overflow-wrap: anywhere;
}
.card__sub { font-weight: 700; font-size: 16px; line-height: 1.25; }
.card__stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  border-top: 3px solid var(--ss-on-accent);
  padding-top: 12px;
}
.card__v { font-weight: 900; font-size: 26px; line-height: 1; }
.card__k { font-size: 11px; font-weight: 700; }
.card__foot { font-family: var(--ss-font-mono); font-size: 9px; margin-top: 12px; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; }
.actions__dark { background: var(--ss-surface-2); }
.close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--ss-line-strong);
  background: var(--ss-surface-2);
  color: var(--ss-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
