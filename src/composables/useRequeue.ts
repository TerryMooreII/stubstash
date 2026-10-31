// Admin: queue artists or venues for the image/pin lookup job, with a busy
// flag per key (a row id, or "bulk").
import { admin } from "@/lib/admin";
import { num } from "@/lib/format";
import { useUi } from "@/stores/ui";
import { useKeyedAction } from "./useAction";

export function useRequeue(kind: "artist" | "venue") {
  const ui = useUi();
  const { run, busy } = useKeyedAction(async (_key, ids: string[]) => {
    const n = await admin.requeue(kind, ids);
    ui.flash(n > 1 ? `Queued ${num(n)} ${kind}s. The lookup runs every 2 minutes.` : "Queued. The lookup runs every 2 minutes.");
  });
  return { requeue: run, queueing: busy };
}
