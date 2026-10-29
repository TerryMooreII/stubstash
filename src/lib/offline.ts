// Offline support:
//  - an IndexedDB cache of every screen's data, so pages you've opened (or
//    saved with "Save for offline") work without signal; see cached()
//  - an outbox of "log this setlist.fm show" actions taken offline, flushed when
//    the connection returns (see flushOutbox, called from App.vue)

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "stubstash";
const VERSION = 1;

export type OutboxItem =
  | { id: string; kind: "log-setlist"; setlistfm_id: string; label: string; created_at: number };

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB(DB_NAME, VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("cache")) d.createObjectStore("cache");
      if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox", { keyPath: "id" });
    },
  });
  return dbp;
}

/** Cache is per signed-in user so switching accounts never shows someone else's data. */
let scope = "anon";
export function setCacheScope(userId: string | null) {
  scope = userId ?? "anon";
}

/** Keys are prefixed with the signed-in user unless `scoped` is false (the key then carries its own owner). */
export async function cacheGet<T>(key: string, scoped = true): Promise<T | null> {
  try {
    return ((await (await db()).get("cache", scoped ? `${scope}:${key}` : key)) as T) ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, scoped = true) {
  try {
    await (await db()).put("cache", JSON.parse(JSON.stringify(value)), scoped ? `${scope}:${key}` : key);
  } catch {
    /* storage full or blocked: caching is best-effort */
  }
}

export async function cacheHas(key: string): Promise<boolean> {
  try {
    return (await (await db()).getKey("cache", `${scope}:${key}`)) !== undefined;
  } catch {
    return false;
  }
}

/** How long to wait on a flaky connection before showing the saved copy instead. */
const SLOW_MS = 8000;
const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Network first, saved copy as the fallback: fetches fresh data and saves it;
 * when offline, on an error, or when the network stalls, returns the last saved
 * copy instead (and throws only if there isn't one).
 */
export async function cached<T>(key: string, fetcher: () => Promise<T>, scoped = true): Promise<T> {
  const saved = () => cacheGet<{ v: T }>(key, scoped);
  if (isOffline()) {
    const c = await saved();
    if (c) return c.v;
  }
  const fresh = fetcher().then(async (v) => {
    await cacheSet(key, { v, at: Date.now() }, scoped);
    return v;
  });
  fresh.catch(() => {}); // handled below; avoids an "unhandled rejection" while we read the saved copy
  try {
    const c = await saved();
    if (!c) return await fresh;
    // There's a saved copy: don't keep people waiting on a stalled connection.
    const slow = new Promise<"slow">((r) => setTimeout(() => r("slow"), SLOW_MS));
    const first = await Promise.race([fresh, slow]);
    if (first === "slow") return c.v;
    return first as T;
  } catch (e) {
    const c = await saved();
    if (c) return c.v;
    throw e;
  }
}

export async function clearCache() {
  try {
    await (await db()).clear("cache");
    await (await db()).clear("outbox");
  } catch {
    /* ignore */
  }
  // The service worker's copy of API responses (see sw.ts).
  try {
    await caches.delete("api");
  } catch {
    /* ignore */
  }
}

export async function outboxAdd(item: Omit<OutboxItem, "id" | "created_at">) {
  const full = { ...item, id: crypto.randomUUID(), created_at: Date.now() } as OutboxItem;
  await (await db()).put("outbox", full);
  return full;
}

export async function outboxList(): Promise<OutboxItem[]> {
  try {
    return ((await (await db()).getAll("outbox")) as OutboxItem[]).sort((a, b) => a.created_at - b.created_at);
  } catch {
    return [];
  }
}

export async function outboxRemove(id: string) {
  await (await db()).delete("outbox", id);
}

/**
 * Replays queued actions. `run` performs one item and throws on failure;
 * items that fail stay queued for next time. Returns how many succeeded.
 */
export async function flushOutbox(run: (item: OutboxItem) => Promise<void>): Promise<number> {
  let done = 0;
  for (const item of await outboxList()) {
    try {
      await run(item);
      await outboxRemove(item.id);
      done++;
    } catch {
      break; // still offline or server unhappy: try later, keep order
    }
  }
  return done;
}
