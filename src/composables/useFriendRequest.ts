// Sends a friend request (or accepts theirs, if they already asked) and says
// which happened. Busy per handle, so a list can show a spinner per row.
import { social } from "@/lib/api";
import type { FriendshipState } from "@/lib/types";
import { useUi } from "@/stores/ui";
import { useKeyedAction } from "./useAction";

export function useFriendRequest(opts: { onDone?: (handle: string, res: FriendshipState) => unknown } = {}) {
  const ui = useUi();
  const { run, busy } = useKeyedAction(async (handle: string, name: string) => {
    const res = await social.request(handle);
    ui.flash(res === "friends" ? `You and ${name} are now friends` : `Request sent to ${name}`);
    await opts.onDone?.(handle, res);
    return res;
  });
  /** `name` is what the toast calls them. */
  return { request: run, busy };
}
