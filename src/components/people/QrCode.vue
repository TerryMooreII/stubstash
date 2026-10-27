<script setup lang="ts">
// Real, scannable QR code rendered as inline SVG.
import { ref, watchEffect } from "vue";
import QRCode from "qrcode";

const props = withDefaults(defineProps<{ value: string; size?: number; label?: string }>(), { size: 132 });
const svg = ref("");

watchEffect(async () => {
  if (!props.value) return;
  svg.value = await QRCode.toString(props.value, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0a090cff", light: "#ffffffff" },
  });
});
</script>

<template>
  <div class="qr" :style="{ width: size + 'px', height: size + 'px' }" role="img" :aria-label="label ?? `QR code for ${value}`">
    <div class="qr__svg" v-html="svg" />
  </div>
</template>

<style scoped>
.qr {
  flex-shrink: 0;
  padding: 8px;
  border-radius: 12px;
  background: #fff;
}
.qr__svg,
.qr__svg :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
