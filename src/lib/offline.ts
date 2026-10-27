// Offline support:
//  - a small IndexedDB cache so the dashboard and show list open without signal
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

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return ((await (await db()).get("cache", `${scope}:${key}`)) as T) ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown) {
  try {
    await (await db()).put("cache", JSON.parse(JSON.stringify(value)), `${scope}:${key}`);
  } catch {
    /* storage full or blocked: caching is best-effort */
  }
}

export async function clearCache() {
  try {
    await (await db()).clear("cache");
    await (await db()).clear("outbox");
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
