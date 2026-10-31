// Runs an async action with a busy flag, an optional success toast, and an
// error toast on failure. Replaces the busy/try/catch/finally pattern in views.
import { ref, type Ref } from "vue";
import { errorMessage } from "@/lib/supabase";
import { useUi } from "@/stores/ui";

interface ActionOptions {
  /** Toast shown when the action finishes without throwing. */
  success?: string;
  /** Message used when the error has none of its own. */
  fallback?: string;
}

export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: ActionOptions = {},
): { run: (...args: A) => Promise<R | undefined>; busy: Ref<boolean> } {
  const ui = useUi();
  const busy = ref(false);
  async function run(...args: A): Promise<R | undefined> {
    if (busy.value) return undefined;
    busy.value = true;
    try {
      const out = await fn(...args);
      if (opts.success) ui.flash(opts.success);
      return out;
    } catch (e) {
      ui.error(errorMessage(e, opts.fallback));
      return undefined;
    } finally {
      busy.value = false;
    }
  }
  return { run, busy };
}

/** Same as useAction, but with a busy flag per key (e.g. one per list row). */
export function useKeyedAction<A extends unknown[], R>(
  fn: (key: string, ...args: A) => Promise<R>,
  opts: ActionOptions = {},
): { run: (key: string, ...args: A) => Promise<R | undefined>; busy: Ref<Record<string, boolean>> } {
  const ui = useUi();
  const busy = ref<Record<string, boolean>>({});
  async function run(key: string, ...args: A): Promise<R | undefined> {
    if (busy.value[key]) return undefined;
    busy.value[key] = true;
    try {
      const out = await fn(key, ...args);
      if (opts.success) ui.flash(opts.success);
      return out;
    } catch (e) {
      ui.error(errorMessage(e, opts.fallback));
      return undefined;
    } finally {
      delete busy.value[key];
    }
  }
  return { run, busy };
}
