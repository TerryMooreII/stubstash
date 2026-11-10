// Events we already have on screen (search results, plans, invites), kept so the
// event page can draw straight away and refresh from the server behind the scenes.
import type { PlanItem } from "./types";

const seeds = new Map<number, PlanItem>();
const MAX = 50;

/** Remember an event the user is about to open. */
export function rememberEvent(item: PlanItem): void {
  const id = item.event.seatgeek_id;
  seeds.delete(id);
  seeds.set(id, item);
  if (seeds.size > MAX) seeds.delete(seeds.keys().next().value!);
}

/** What we already know about an event, if anything. */
export function seededEvent(seatgeekId: number): PlanItem | null {
  return seeds.get(seatgeekId) ?? null;
}

/**
 * The server's copy, keeping the photos we already showed when the server
 * hasn't saved them yet (some are looked up after the first reply).
 */
export function mergeFresh(fresh: PlanItem, seed: PlanItem | null): PlanItem {
  if (!seed) return fresh;
  const e = { ...fresh.event };
  if (!e.image_url && seed.event.image_url) Object.assign(e, { image_url: seed.event.image_url, image_credit: seed.event.image_credit });
  if (!e.venue_image_url && seed.event.venue_image_url) {
    Object.assign(e, { venue_image_url: seed.event.venue_image_url, venue_image_credit: seed.event.venue_image_credit });
  }
  return { ...fresh, event: e, seen: fresh.seen ?? seed.seen };
}
