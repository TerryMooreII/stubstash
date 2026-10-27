// Service worker registration and web push subscription.
import { registerSW } from "virtual:pwa-register";
import { removePushSubscription, savePushSubscription } from "./api";

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
export const pwaState = { needRefresh: false };

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pwaState.needRefresh = true;
      // New version available: apply on next navigation-free moment.
      window.dispatchEvent(new CustomEvent("ss:update-available"));
    },
  });
}

export function applyUpdate() {
  return updateSW?.(true);
}

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks permission, subscribes this device and saves it. Returns true on success. */
export async function enablePush(): Promise<boolean> {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!pushSupported() || !key) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  await savePushSubscription(sub);
  return true;
}

export async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await removePushSubscription(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
