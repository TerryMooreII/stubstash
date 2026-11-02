// A tab kept in the query string (?tab=users), so refresh and back keep it.
// The fallback tab leaves the query empty.
import { computed, type ComputedRef, type WritableComputedRef } from "vue";
import { useRoute, useRouter } from "vue-router";

export function useQueryTab<T extends string>(
  param: string,
  keys: () => readonly T[],
  fallback: T,
): { tab: ComputedRef<T>; go: (t: T) => void; model: WritableComputedRef<T> } {
  const route = useRoute();
  const router = useRouter();
  const tab = computed<T>(() => {
    const q = route.query[param];
    return keys().includes(q as T) ? (q as T) : fallback;
  });
  function go(t: T) {
    router.replace({ query: t === fallback ? {} : { [param]: t } });
  }
  /** For v-model (e.g. SsTabs). */
  const model = computed({ get: () => tab.value, set: go });
  return { tab, go, model };
}
