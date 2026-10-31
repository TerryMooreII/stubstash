// A searchable list loaded 50 rows at a time: debounced search box, "load
// more" appends, and stale responses are dropped. Rows carry the full count
// in `total` (the admin RPCs do this).
import { onMounted, onScopeDispose, ref, watch, type Ref, type WatchSource } from "vue";
import { errorMessage } from "@/lib/supabase";

interface PagedSearchOptions {
  /** Rows per page. Default 50. */
  pageSize?: number;
  /** Pause after typing before searching, in ms. Default 300. */
  ms?: number;
  /** Reload from the top when this changes (e.g. a filter chip). */
  watch?: WatchSource;
}

export function usePagedSearch<T extends { total: number }>(
  fetchPage: (q: string, limit: number, offset: number) => Promise<T[]>,
  opts: PagedSearchOptions = {},
): {
  q: Ref<string>;
  rows: Ref<T[]>;
  total: Ref<number>;
  loading: Ref<boolean>;
  loadingMore: Ref<boolean>;
  error: Ref<string | null>;
  load: (reset?: boolean) => Promise<void>;
} {
  const { pageSize = 50, ms = 300 } = opts;
  const q = ref("");
  const rows = ref<T[]>([]) as Ref<T[]>;
  const total = ref(0);
  const loading = ref(true);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function load(reset = true) {
    const mine = ++seq;
    if (reset) loading.value = true; else loadingMore.value = true;
    error.value = null;
    try {
      const list = await fetchPage(q.value.trim(), pageSize, reset ? 0 : rows.value.length);
      if (mine !== seq) return;
      rows.value = reset ? list : [...rows.value, ...list];
      total.value = list[0]?.total ?? (reset ? 0 : total.value);
    } catch (e) {
      if (mine === seq) error.value = errorMessage(e);
    } finally {
      if (mine === seq) { loading.value = false; loadingMore.value = false; }
    }
  }

  watch(q, () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(true), ms);
  });
  if (opts.watch) watch(opts.watch, () => load(true));
  onMounted(() => load(true));
  onScopeDispose(() => clearTimeout(timer));

  return { q, rows, total, loading, loadingMore, error, load };
}
