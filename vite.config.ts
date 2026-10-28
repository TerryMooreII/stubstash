/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

// Sub-path the app is served from. GitHub Pages project sites use "/<repo>/";
// the deploy workflow sets BASE_PATH. Local dev and custom domains use "/".
const base = (process.env.BASE_PATH ?? "/").replace(/\/?$/, "/");

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      // Custom service worker (src/sw.ts) so we can handle push notifications.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/favicon-16.png"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
      },
      manifest: {
        name: "Stubstash",
        short_name: "Stubstash",
        description: "Every show. Every song. Every mile. Your concert log, stats and map.",
        id: `${base}app`,
        start_url: `${base}app`,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#0a090c",
        theme_color: "#0a090c",
        categories: ["music", "lifestyle", "entertainment"],
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
          // Android crops these to its own shape (circle, squircle...); the mark sits in the safe zone.
          { src: `${base}icons/icon-maskable-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: `${base}icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Log a show", short_name: "Log", url: `${base}app/log` },
          { name: "My map", short_name: "Map", url: `${base}app/map` },
        ],
      },
      devOptions: { enabled: false, type: "module" },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
