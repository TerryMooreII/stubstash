// A tab kept in the query string (?tab=users), so refresh and back keep it.
// The fallback tab leaves the query empty.
import { computed, type ComputedRef } from "vue";
import { useRoute, useRouter } from "vue-router";

export function useQueryTab<T extends string>(
  param: string,
  keys: () => readonly T[],
  fallback: T,
): { tab: ComputedRef<T>; go: (t: T) => void } {
  const route = useRoute();
  const router = useRouter();
  const tab = computed<T>(() => {
    const q = route.query[param];
    return keys().includes(q as T) ? (q as T) : fallback;
  });
  function go(t: T) {
    router.replace({ query: t === fallback ? {} : { [param]: t } });
  }
  return { tab, go };
}
