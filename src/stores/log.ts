// The signed-in user's show log + dashboard stats, cached so screens can
// share them and refresh after a show is logged or edited.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { dashboardStats, setlistfm, userLog } from "@/lib/api";
import type { DashboardStats, LogEntry } from "@/lib/types";
import { cacheGet, cacheSet } from "@/lib/offline";
import { groupShows } from "@/lib/shows";

export const useLog = defineStore("log", () => {
  const entries = ref<LogEntry[]>([]);
  const stats = ref<DashboardStats | null>(null);
  const loading = ref(false);
  const loaded = ref(false);
  const error = ref<string | null>(null);

  /** Shows (one venue, one date) and the acts within them; see lib/shows.ts. */
  const shows = computed(() => groupShows(entries.value));
  const total = computed(() => shows.value.length);
  const sets = computed(() => entries.value.length);
  /** setlist.fm ids already in the log, for "In your log" buttons. */
  const loggedSetlistIds = computed(() => new Map(entries.value.filter((e) => e.setlistfm_id).map((e) => [e.setlistfm_id!, e.attendance_id])));

  async function load(force = false) {
    if (loading.value || (loaded.value && !force)) return;
    loading.value = true;
    error.value = null;
    // Show cached data instantly (and offline), then refresh.
    if (!loaded.value) {
      const cached = await cacheGet<{ entries: LogEntry[]; stats: DashboardStats | null }>("log");
      if (cached) { entries.value = cached.entries; stats.value = cached.stats; }
    }
    try {
      const [e, s] = await Promise.all([userLog(), dashboardStats()]);
      entries.value = e;
      stats.value = s;
      loaded.value = true;
      await cacheSet("log", { entries: e, stats: s });
    } catch (err) {
      error.value = (err as Error).message;
      if (entries.value.length) loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  const refresh = () => load(true);

  /** Logs a setlist.fm show and refreshes. Returns the attendance id and show number. */
  async function logSetlist(setlistfmId: string) {
    const res = await setlistfm.log(setlistfmId);
    await refresh();
    const entry = entries.value.find((e) => e.attendance_id === res.attendance_id);
    return { ...res, show_number: entry?.show_number ?? null };
  }

  function reset() {
    entries.value = [];
    stats.value = null;
    loaded.value = false;
  }

  return { entries, shows, stats, loading, loaded, error, total, sets, loggedSetlistIds, load, refresh, logSetlist, reset };
});
