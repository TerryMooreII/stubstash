// Search-as-you-type: waits for a pause in typing, skips short queries, and
// drops results from requests that a newer keystroke has superseded.
import { onScopeDispose, ref, shallowRef, watch, type Ref, type ShallowRef } from "vue";

interface DebouncedSearchOptions {
  /** Pause before searching, in ms. Default 300. */
  ms?: number;
  /** Queries shorter than this clear the results. Default 2. */
  minChars?: number;
}

export function useDebouncedSearch<T>(
  query: Ref<string>,
  search: (q: string) => Promise<T[]>,
  opts: DebouncedSearchOptions = {},
): { results: ShallowRef<T[]>; searching: Ref<boolean>; run: () => void; clear: () => void } {
  const { ms = 300, minChars = 2 } = opts;
  const results = shallowRef<T[]>([]);
  const searching = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  function clear() {
    clearTimeout(timer);
    seq++;
    results.value = [];
    searching.value = false;
  }

  function run() {
    clearTimeout(timer);
    const q = query.value.trim();
    if (q.length < minChars) return clear();
    searching.value = true;
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        const out = await search(q);
        if (my === seq) results.value = out;
      } catch {
        if (my === seq) results.value = [];
      } finally {
        if (my === seq) searching.value = false;
      }
    }, ms);
  }

  watch(query, run);
  onScopeDispose(() => clearTimeout(timer));
  return { results, searching, run, clear };
}
