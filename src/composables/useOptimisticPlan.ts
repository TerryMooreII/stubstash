// Going / Interested / Can't go that feels instant: the new status shows
// straight away and saves in the background. If saving fails the last saved
// state comes back with an error toast. Quick taps on one event are sent in
// order and the last one wins.
import { upcoming } from "@/lib/api";
import { errorMessage } from "@/lib/supabase";
import type { PlanItem, PlanStatus } from "@/lib/types";
import { useUi } from "@/stores/ui";

export type PlanChoice = Exclude<PlanStatus, "invited"> | null;

export function useOptimisticPlan(opts: {
  /** Put this version of the event on screen (the optimistic one, then the server's, or the old one on failure). */
  apply: (item: PlanItem) => void;
  /** After the server has the latest tap. */
  saved?: (item: PlanItem) => void;
}) {
  const ui = useUi();
  /** Per event: the latest tap, the last state the server confirmed, and the queue of saves. */
  const taps = new Map<number, number>();
  const confirmed = new Map<number, PlanItem>();
  const queue = new Map<number, Promise<unknown>>();

  function setPlan(item: PlanItem, status: PlanChoice): Promise<void> {
    const id = item.event.seatgeek_id;
    const tap = (taps.get(id) ?? 0) + 1;
    taps.set(id, tap);
    if (!confirmed.has(id)) confirmed.set(id, item);
    opts.apply({ ...item, status });

    const run = (queue.get(id) ?? Promise.resolve()).then(async () => {
      // A newer tap is already waiting: skip straight to it.
      if (taps.get(id) !== tap) return;
      try {
        const fresh = await upcoming.setPlan(id, status);
        confirmed.set(id, fresh);
        if (taps.get(id) !== tap) return;
        confirmed.delete(id);
        opts.apply(fresh);
        opts.saved?.(fresh);
      } catch (e) {
        if (taps.get(id) !== tap) return;
        const back = confirmed.get(id);
        confirmed.delete(id);
        if (back) opts.apply(back);
        ui.error(errorMessage(e, "Couldn't save that. Try again."));
      }
    });
    queue.set(id, run);
    return run;
  }

  return { setPlan };
}
