// Admin actions that need the Auth admin API. Caller must be in public.admins.
//
// POST { action: "suspend", user_id }    -> blocks sign-in and token refresh
// POST { action: "unsuspend", user_id }
// POST { action: "delete", user_id }     -> deletes the account, its log and its uploaded files

import { HttpError, json, serve } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

const BUCKETS = ["avatars", "photos", "stubs"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller's user id, if they're in public.admins. */
async function requireAdmin(req: Request, db: ReturnType<typeof adminClient>): Promise<string> {
  const userId = await requireUser(req);
  const { data } = await db.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(403, "Admins only.");
  return userId;
}

async function removeFiles(db: ReturnType<typeof adminClient>, userId: string) {
  let removed = 0;
  for (const bucket of BUCKETS) {
    // Files live under "<user id>/..."; walk every subfolder, a page at a time.
    const PAGE = 1000;
    const stack = [userId];
    const paths: string[] = [];
    while (stack.length) {
      const dir = stack.pop()!;
      for (let offset = 0; ; offset += PAGE) {
        const { data } = await db.storage.from(bucket).list(dir, { limit: PAGE, offset });
        for (const f of data ?? []) {
          const p = `${dir}/${f.name}`;
          if (f.id === null) stack.push(p); // folder
          else paths.push(p);
        }
        if (!data || data.length < PAGE) break;
      }
    }
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (!error) removed += Math.min(100, paths.length - i);
    }
  }
  return removed;
}

serve(async (req) => {
  const db = adminClient();
  const me = await requireAdmin(req, db);
  const body = await req.json().catch(() => ({}));
  const target = String(body.user_id ?? "");
  if (!UUID.test(target)) throw new HttpError(400, "Missing user id.");
  if (target === me) throw new HttpError(400, "You can't do that to your own account.");

  const { data: isTargetAdmin } = await db.from("admins").select("user_id").eq("user_id", target).maybeSingle();
  if (isTargetAdmin) throw new HttpError(400, "That user is an admin. Remove their admin role in SQL first.");

  switch (body.action) {
    case "suspend": {
      const { error } = await db.auth.admin.updateUserById(target, { ban_duration: "876000h" }); // ~100 years
      if (error) throw new HttpError(400, error.message);
      // Their current access token keeps working until it expires (up to an hour); refreshes are refused.
      return json({ ok: true });
    }
    case "unsuspend": {
      const { error } = await db.auth.admin.updateUserById(target, { ban_duration: "none" });
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }
    case "delete": {
      const files = await removeFiles(db, target);
      const { error } = await db.auth.admin.deleteUser(target);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true, files_removed: files });
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
});
