// Copy a link to the clipboard, or hand it to the phone's share sheet.
import { useUi } from "@/stores/ui";

export function useShareLink() {
  const ui = useUi();
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy(url: string, done = "Link copied") {
    try {
      await navigator.clipboard.writeText(url);
      ui.flash(done);
    } catch {
      ui.error("Couldn't copy. Press and hold the link to copy it.");
    }
  }

  async function share(data: ShareData) {
    try {
      await navigator.share(data);
    } catch {
      /* cancelled */
    }
  }

  return { canShare, copy, share };
}
