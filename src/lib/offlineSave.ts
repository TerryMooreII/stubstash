// "Save for offline": downloads every show page (plus artists, venues, map,
// badges and year in review) into the offline cache, so the whole log opens
// without signal. Images are warmed through the service worker's image cache.
import {
  artistStats, badges, getArtist, getAttendance, getVenue, mapHome, mapVenues, showSetlist, showStats,
  venueStats, yearInReview,
} from "./api";
import { cacheHas } from "./offline";
import type { LogEntry } from "./types";

const AUTO_KEY = "ss.offlineAuto";
const LAST_KEY = "ss.offlineSavedAt";

/** Keep new shows saved automatically (default on). Stored per device. */
export function offlineAutoEnabled(): boolean {
  try { return localStorage.getItem(AUTO_KEY) !== "0"; } catch { return true; }
}
export function setOfflineAuto(on: boolean) {
  try { localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}
export function lastOfflineSave(): number | null {
  try { return Number(localStorage.getItem(LAST_KEY)) || null; } catch { return null; }
}

/** Runs tasks with a small concurrency limit; failures are counted, not thrown. */
async function pool(tasks: (() => Promise<unknown>)[], limit: number, onDone: () => void): Promise<number> {
  let next = 0, failed = 0;
  async function worker() {
    while (next < tasks.length) {
      const t = tasks[next++]!;
      try { await t(); } catch { failed++; }
      onDone();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return failed;
}

/** Fetching an image as an <img> lets the service worker cache it (fetch() wouldn't match its image route). */
function warmImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

export interface SaveProgress { done: number; total: number }

/**
 * Saves the log for offline use: every show, artist and venue page, the map,
 * badges and each year in review.
 *  full: refresh everything (the Settings button)
 *  missing only: just what isn't on this device yet (the automatic background run)
 * Returns how many items failed.
 */
export async function saveForOffline(
  entries: LogEntry[],
  opts: { full: boolean; onProgress?: (p: SaveProgress) => void },
): Promise<number> {
  // [cache key that proves it's saved, task]
  const jobs: [string, () => Promise<unknown>][] = [];
  for (const e of entries) {
    jobs.push([`attendance:${e.attendance_id}`, () =>
      Promise.all([getAttendance(e.attendance_id), showSetlist(e.attendance_id), showStats(e.attendance_id)])]);
  }
  for (const id of new Set(entries.map((e) => e.artist_id))) {
    jobs.push([`artist_stats:${id}:me`, () => Promise.all([getArtist(id), artistStats(id)])]);
  }
  for (const id of new Set(entries.map((e) => e.venue_id))) {
    jobs.push([`venue_stats:${id}:me`, () => Promise.all([getVenue(id), venueStats(id)])]);
  }
  for (const y of new Set(entries.map((e) => Number(e.event_date.slice(0, 4))))) {
    jobs.push([`year_in_review:${y}:me`, () => yearInReview(y)]);
  }
  jobs.push(["badges:me", () => Promise.all([mapVenues(), mapHome(), badges()])]);

  const todo = opts.full
    ? jobs
    : (await Promise.all(jobs.map(async (j) => ((await cacheHas(j[0])) ? null : j)))).filter((j): j is [string, () => Promise<unknown>] => !!j);
  const tasks = todo.map((j) => j[1]);
  if (opts.full) {
    const images = [...new Set(entries.map((e) => e.artist_image).filter((u): u is string => !!u))];
    for (const url of images) tasks.push(() => warmImage(url));
  }

  let done = 0;
  const total = tasks.length;
  opts.onProgress?.({ done, total });
  const failed = await pool(tasks, 3, () => opts.onProgress?.({ done: ++done, total }));
  if (opts.full && !failed) {
    try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* private mode */ }
  }
  return failed;
}
