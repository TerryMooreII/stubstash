// UI state shared across screens: toast messages, PWA install prompt, viewport size.
import { defineStore } from "pinia";
import { computed, ref } from "vue";

interface Toast { id: number; message: string; tone: "accent" | "error" | "info" }

// Chrome/Edge/Android fire this; iOS Safari never does (we show instructions instead).
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ss.installDismissed";

function readDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

export const useUi = defineStore("ui", () => {
  const toast = ref<Toast | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flash(message: string, tone: Toast["tone"] = "accent", ms = 2600) {
    toast.value = { id: Date.now(), message, tone };
    clearTimeout(timer);
    timer = setTimeout(() => (toast.value = null), ms);
  }
  const error = (message: string) => flash(message, "error", 4000);

  // ---- viewport
  const width = ref(typeof window === "undefined" ? 1200 : window.innerWidth);
  if (typeof window !== "undefined") window.addEventListener("resize", () => (width.value = window.innerWidth), { passive: true });
  const isMobile = computed(() => width.value < 820);

  // ---- install
  const installEvent = ref<BeforeInstallPromptEvent | null>(null);
  const installSheetOpen = ref(false);
  const installDismissed = ref(readDismissed());
  const isStandalone = ref(
    typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true),
  );
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const canPromptInstall = computed(() => !!installEvent.value);
  const showInstallNudge = computed(() => !isStandalone.value && !installDismissed.value);

  if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      installEvent.value = e as BeforeInstallPromptEvent;
    });
    window.addEventListener("appinstalled", () => {
      isStandalone.value = true;
      installEvent.value = null;
      flash("Installed. Find Stubstash on your home screen.");
    });
  }

  async function install(): Promise<boolean> {
    if (!installEvent.value) return false;
    await installEvent.value.prompt();
    const { outcome } = await installEvent.value.userChoice;
    installEvent.value = null;
    if (outcome === "accepted") dismissInstall();
    return outcome === "accepted";
  }
  function dismissInstall() {
    installDismissed.value = true;
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
  }

  // ---- offline
  const online = ref(typeof navigator === "undefined" ? true : navigator.onLine);
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => (online.value = true));
    window.addEventListener("offline", () => (online.value = false));
  }

  return {
    toast, flash, error,
    width, isMobile,
    installSheetOpen, installEvent, canPromptInstall, showInstallNudge, isStandalone, isIos, install, dismissInstall,
    online,
  };
});
