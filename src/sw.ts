/// <reference lib="webworker" />
// Service worker: precache the app shell, cache images, handle web push.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

// Path the app is served from ("/" or "/stubstash/"), taken from the SW scope.
const BASE = new URL(self.registration.scope).pathname;
/** Resolve an app path like "/app/shows/1" against the base path. */
const appPath = (p: string) => (p.startsWith(BASE) ? p : BASE + p.replace(/^\//, ""));

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA: serve index.html for app routes when offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`)));

// Google Fonts
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
  new StaleWhileRevalidate({ cacheName: "fonts" }),
);

// Artist/venue images and map tiles: cache-first, bounded.
registerRoute(
  ({ request, url }) =>
    request.destination === "image" &&
    !url.pathname.includes("/storage/v1/object/sign/"),
  new CacheFirst({
    cacheName: "images",
    plugins: [new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true })],
  }),
);

// Supabase REST reads (RPC stats etc.): network first, fall back to last copy.
registerRoute(
  ({ url, request }) => request.method === "GET" && url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/"),
  new NetworkFirst({ cacheName: "api", networkTimeoutSeconds: 6 }),
);

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// ---- Web push
self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Stubstash", {
      body: data.body ?? "",
      icon: `${BASE}icons/icon-192.png`,
      badge: `${BASE}icons/badge-72.png`,
      tag: data.tag,
      data: { url: data.url ?? "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(appPath((event.notification.data?.url as string) ?? "/app"), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if ("focus" in w) {
          await (w as WindowClient).navigate(url).catch(() => {});
          return (w as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
