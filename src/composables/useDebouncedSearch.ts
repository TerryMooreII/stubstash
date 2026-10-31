// Search-as-you-type: waits for a pause in typing, skips short queries, and
// drops results from requests that a newer keystroke has superseded.
import { onScopeDispose, ref, shallowRef, watch, type Ref, type ShallowRef } from "vue";

interface DebouncedSearchOptions {
  /** Pause before searching, in ms. Default 300. */
  ms?: number;
  /** Queries shorter than this clear the results. Default 2. */
  minChars?: number;
  /** Search when the query changes. Default true; set false to call run() yourself. */
  auto?: boolean;
  /** Handle a failed search yourself; the old results stay. By default they're cleared. */
  onError?: (e: unknown) => void;
}

export function useDebouncedSearch<T>(
  query: Ref<string>,
  search: (q: string) => Promise<T[]>,
  opts: DebouncedSearchOptions = {},
): { results: ShallowRef<T[]>; searching: Ref<boolean>; run: () => void; now: () => void; clear: () => void } {
  const { ms = 300, minChars = 2, auto = true, onError } = opts;
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

  async function go(q: string) {
    const my = ++seq;
    try {
      const out = await search(q);
      if (my === seq) results.value = out;
    } catch (e) {
      if (my !== seq) return;
      if (onError) onError(e);
      else results.value = [];
    } finally {
      if (my === seq) searching.value = false;
    }
  }

  function start(delay: number) {
    clearTimeout(timer);
    const q = (query.value ?? "").trim();
    if (q.length < minChars) return clear();
    searching.value = true;
    if (delay) timer = setTimeout(() => go(q), delay);
    else void go(q);
  }

  /** Search after the pause. */
  const run = () => start(ms);
  /** Search straight away. */
  const now = () => start(0);

  if (auto) watch(query, run);
  onScopeDispose(() => clearTimeout(timer));
  return { results, searching, run, now, clear };
}
