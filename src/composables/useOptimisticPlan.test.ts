import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanItem } from "@/lib/types";

const setPlan = vi.fn();
const error = vi.fn();
vi.mock("@/lib/api", () => ({ upcoming: { setPlan: (...a: unknown[]) => setPlan(...a) } }));
vi.mock("@/lib/supabase", () => ({ errorMessage: (e: Error, fallback?: string) => e.message || fallback }));
vi.mock("@/stores/ui", () => ({ useUi: () => ({ error }) }));

import { useOptimisticPlan } from "./useOptimisticPlan";

const item = (status: PlanItem["status"], id: string | null = null) =>
  ({ event: { seatgeek_id: 7, id }, status, crew: [] }) as unknown as PlanItem;

/** A promise settled by hand, to hold the "server" open. */
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useOptimisticPlan", () => {
  beforeEach(() => { setPlan.mockReset(); error.mockReset(); });

  it("shows the new status before the server answers, then the server's copy", async () => {
    const d = deferred<PlanItem>();
    setPlan.mockReturnValue(d.promise);
    const seen: PlanItem[] = [];
    const saved = vi.fn();
    const { setPlan: set } = useOptimisticPlan({ apply: (i) => seen.push(i), saved });

    const done = set(item(null), "going");
    expect(seen.map((i) => i.status)).toEqual(["going"]);
    expect(saved).not.toHaveBeenCalled();

    d.resolve(item("going", "saved-id"));
    await done;
    expect(seen.at(-1)!.event.id).toBe("saved-id");
    expect(saved).toHaveBeenCalledOnce();
  });

  it("puts the old state back and says so when saving fails", async () => {
    setPlan.mockRejectedValue(new Error("offline"));
    const seen: PlanItem[] = [];
    const { setPlan: set } = useOptimisticPlan({ apply: (i) => seen.push(i) });

    await set(item("interested"), "going");
    expect(seen.map((i) => i.status)).toEqual(["going", "interested"]);
    expect(error).toHaveBeenCalledWith("offline");
  });

  it("lets the last of several quick taps win, and skips ones that were overtaken", async () => {
    const first = deferred<PlanItem>();
    setPlan.mockReturnValueOnce(first.promise).mockResolvedValueOnce(item(null));
    const seen: PlanItem[] = [];
    const { setPlan: set } = useOptimisticPlan({ apply: (i) => seen.push(i) });

    const a = set(item(null), "interested");
    await Promise.resolve();
    const b = set(seen.at(-1)!, "going");
    const c = set(seen.at(-1)!, null);
    first.resolve(item("interested"));
    await Promise.all([a, b, c]);

    // "going" never went to the server; the stale "interested" reply wasn't shown.
    expect(setPlan.mock.calls.map((x) => x[1])).toEqual(["interested", null]);
    expect(seen.map((i) => i.status)).toEqual(["interested", "going", null, null]);
  });

  it("falls back to the last state the server confirmed when a later tap fails", async () => {
    setPlan.mockResolvedValueOnce(item("interested", "saved-id")).mockRejectedValueOnce(new Error("nope"));
    const seen: PlanItem[] = [];
    const { setPlan: set } = useOptimisticPlan({ apply: (i) => seen.push(i) });

    const a = set(item(null), "interested");
    await Promise.resolve();
    const b = set(seen.at(-1)!, "going");
    await Promise.all([a, b]);
    expect(seen.at(-1)!.status).toBe("interested");
    expect(seen.at(-1)!.event.id).toBe("saved-id");
  });
});
