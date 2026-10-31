// Turns an element into a PNG and shares it (or downloads it where sharing
// isn't available), with a busy flag and the usual toasts.
import { ref, type Ref } from "vue";
import { shareElementAsPng, slugFile } from "@/lib/shareImage";
import { useUi } from "@/stores/ui";

export function useShareImage(el: Ref<HTMLElement | undefined>) {
  const ui = useUi();
  const busy = ref(false);

  /** Returns how it went, or null when it failed (an error toast was shown). */
  async function share(prefix: string, name: string, savedMessage: string) {
    if (!el.value) return null;
    busy.value = true;
    try {
      const res = await shareElementAsPng(el.value, slugFile(prefix, name));
      if (res === "saved") ui.flash(savedMessage);
      return res;
    } catch {
      ui.error("Couldn't make the image. Try again.");
      return null;
    } finally {
      busy.value = false;
    }
  }

  return { share, busy };
}
