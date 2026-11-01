// "Find shows" state for the Upcoming page. Kept at module level so going into
// an event and back keeps your search and results.
import { ref, shallowRef, watch } from "vue";
import { upcoming } from "@/lib/api";
import { errorMessage } from "@/lib/supabase";
import { emptyUpcomingFilters, replaceItem, searchParams, type QuickFilter, type UpcomingFilters } from "@/lib/upcoming";
import type { PlanItem } from "@/lib/types";

const q = ref("");
const quick = ref<QuickFilter>("all");
const filters = ref<UpcomingFilters>(emptyUpcomingFilters());
const results = shallowRef<PlanItem[]>([]);
const page = ref(1);
const pages = ref(0);
const total = ref(0);
const near = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);
/** True once a search has run, so coming back doesn't search again. */
const ran = ref(false);

let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

async function run(reset = true) {
  clearTimeout(timer);
  const my = ++seq;
  const nextPage = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  error.value = null;
  try {
    if (quick.value === "friends") {
      // From Stubstash, not SeatGeek: shows your friends have marked.
      const term = q.value.trim().toLowerCase();
      const all = await upcoming.friendsGoing();
      if (my !== seq) return;
      results.value = term
        ? all.filter((x) => `${x.event.artist} ${x.event.venue_name} ${x.event.city ?? ""}`.toLowerCase().includes(term))
        : all;
      page.value = 1;
      pages.value = 1;
      total.value = results.value.length;
      near.value = null;
    } else {
      const res = await upcoming.search({ ...searchParams(q.value, quick.value, filters.value), page: nextPage });
      if (my !== seq) return;
      results.value = reset ? res.results : [...results.value, ...res.results];
      page.value = res.page;
      pages.value = res.pages;
      total.value = res.total;
      near.value = res.near;
    }
    ran.value = true;
  } catch (e) {
    if (my === seq) error.value = errorMessage(e);
  } finally {
    if (my === seq) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

/** Search after a pause in typing. */
function runSoon() {
  clearTimeout(timer);
  timer = setTimeout(() => run(true), 450);
}

watch(q, runSoon);
watch(quick, () => run(true));

/** Whose results these are; a different signed-in user starts fresh. */
let owner: string | null = null;

function reset() {
  seq++;
  clearTimeout(timer);
  q.value = "";
  quick.value = "all";
  filters.value = emptyUpcomingFilters();
  results.value = [];
  page.value = 1;
  pages.value = 0;
  total.value = 0;
  near.value = null;
  error.value = null;
  ran.value = false;
}

export function useUpcomingSearch(userId: string | null) {
  if (owner !== userId) {
    reset();
    owner = userId;
  }
  return {
    q, quick, filters, results, page, pages, total, near, loading, loadingMore, error, ran,
    search: () => run(true),
    more: () => run(false),
    /** Swap in an updated event after a plan change. */
    update: (item: PlanItem) => (results.value = replaceItem(results.value, item)),
  };
}
