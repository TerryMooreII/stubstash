// "Find shows" state for the Upcoming page. Kept at module level so going into
// an event and back keeps your search and results.
//
// Changing the filters or the show filter (via set / setShow) searches straight
// away; typed text searches when the page calls search() (on Enter).
import { ref, shallowRef } from "vue";
import { upcoming } from "@/lib/api";
import { errorMessage } from "@/lib/supabase";
import {
  emptyUpcomingFilters, replaceItem, searchParams, type ShowFilter, type UpcomingFilters, type UpcomingSearchState,
} from "@/lib/upcoming";
import type { PlanItem } from "@/lib/types";

const q = ref("");
const show = ref<ShowFilter>("all");
const filters = ref<UpcomingFilters>(emptyUpcomingFilters());
const results = shallowRef<PlanItem[]>([]);
const page = ref(1);
const pages = ref(0);
const total = ref(0);
const near = ref<string | null>(null);
const elsewhere = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);
/** True once a search has run, so coming back doesn't search again. */
const ran = ref(false);
/** The search last run (what the page keeps in the URL). Typed text only counts once searched. */
const committed = shallowRef<UpcomingSearchState>({ q: "", show: "all", filters: emptyUpcomingFilters() });

let seq = 0;

async function run(reset = true) {
  const my = ++seq;
  const nextPage = reset ? 1 : page.value + 1;
  if (reset) committed.value = { q: q.value, show: show.value, filters: filters.value };
  if (reset) loading.value = true;
  else loadingMore.value = true;
  error.value = null;
  try {
    if (show.value === "friends") {
      // From Stubstash, not SeatGeek: shows your friends have marked.
      const pick = filters.value.pick;
      const term = (pick ? pick.name : q.value).trim().toLowerCase();
      const all = await upcoming.friendsGoing();
      if (my !== seq) return;
      results.value = term
        ? all.filter((x) => `${x.event.artist} ${x.event.venue_name} ${x.event.city ?? ""}`.toLowerCase().includes(term))
        : all;
      page.value = 1;
      pages.value = 1;
      total.value = results.value.length;
      near.value = null;
      elsewhere.value = 0;
    } else {
      const res = await upcoming.search({ ...searchParams(q.value, show.value, filters.value), page: nextPage });
      if (my !== seq) return;
      results.value = reset ? res.results : [...results.value, ...res.results];
      page.value = res.page;
      pages.value = res.pages;
      total.value = res.total;
      near.value = res.near;
      elsewhere.value = res.elsewhere ?? 0;
      if (res.pending_images?.length) void fillImages(res.pending_images);
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

/**
 * Fetches photos for artists the search hadn't looked up yet and drops them into
 * the results. Patched by artist name, so it's safe after a newer search too.
 */
async function fillImages(names: string[]) {
  try {
    const { images } = await upcoming.images(names);
    if (!Object.keys(images).length) return;
    results.value = results.value.map((x) => {
      const img = x.event.image_url ? null : images[x.event.artist.toLowerCase()];
      return img ? { ...x, event: { ...x.event, image_url: img.url, image_credit: img.credit } } : x;
    });
  } catch {
    // No photo is fine; the placeholder art stays.
  }
}

/** Whose results these are; a different signed-in user starts fresh. */
let owner: string | null = null;

function reset() {
  seq++;
  q.value = "";
  show.value = "all";
  filters.value = emptyUpcomingFilters();
  results.value = [];
  page.value = 1;
  pages.value = 0;
  total.value = 0;
  near.value = null;
  elsewhere.value = 0;
  error.value = null;
  ran.value = false;
  committed.value = { q: "", show: "all", filters: emptyUpcomingFilters() };
}

export function useUpcomingSearch(userId: string | null) {
  if (owner !== userId) {
    reset();
    owner = userId;
  }
  return {
    q, show, filters, results, page, pages, total, near, elsewhere, loading, loadingMore, error, ran, committed,
    search: () => run(true),
    /** Replaces the whole search (e.g. from the URL) and runs it. */
    apply: (state: UpcomingSearchState) => {
      q.value = state.q;
      show.value = state.show;
      filters.value = state.filters;
      return run(true);
    },
    more: () => run(false),
    /** Changes some filters and searches again. */
    set: (patch: Partial<UpcomingFilters>) => {
      filters.value = { ...filters.value, ...patch };
      return run(true);
    },
    setShow: (v: ShowFilter) => {
      show.value = v;
      return run(true);
    },
    /** Swap in an updated event after a plan change. */
    update: (item: PlanItem) => (results.value = replaceItem(results.value, item)),
  };
}
