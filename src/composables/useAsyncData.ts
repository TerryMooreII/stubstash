// Loads data for a page: loading/error state, reloads when a source changes,
// and ignores responses that arrive after a newer load started.
import { ref, shallowRef, watch, type Ref, type ShallowRef, type WatchSource } from "vue";
import { errorMessage } from "@/lib/supabase";

interface AsyncDataOptions {
  /** Reload whenever this changes (e.g. () => route.params.id). */
  watch?: WatchSource;
  /** Load straight away. Default true. */
  immediate?: boolean;
}

export function useAsyncData<T>(
  loader: () => Promise<T>,
  opts: AsyncDataOptions = {},
): { data: ShallowRef<T | null>; loading: Ref<boolean>; error: Ref<string | null>; reload: () => Promise<void> } {
  const data = shallowRef<T | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let seq = 0;

  async function reload() {
    const my = ++seq;
    loading.value = true;
    error.value = null;
    try {
      const out = await loader();
      if (my === seq) data.value = out;
    } catch (e) {
      if (my === seq) error.value = errorMessage(e);
    } finally {
      if (my === seq) loading.value = false;
    }
  }

  if (opts.watch) watch(opts.watch, reload, { immediate: opts.immediate ?? true });
  else if (opts.immediate ?? true) void reload();

  return { data, loading, error, reload };
}
