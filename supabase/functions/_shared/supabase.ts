import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError } from "./http.ts";

let admin: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS, so only use it for catalog writes and jobs. One per isolate. */
export function adminClient(): SupabaseClient {
  admin ??= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/**
 * Returns the signed-in user's id from the request's JWT, or throws 401.
 * By default the JWT is checked locally against the project's signing keys
 * (cached), with no call to the Auth server. Pass { fresh: true } to ask the
 * Auth server too, which also catches users deleted or banned since the token
 * was issued (use it for admin actions).
 */
export async function requireUser(req: Request, opts: { fresh?: boolean } = {}): Promise<string> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in.");
  if (opts.fresh) {
    const { data, error } = await adminClient().auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, "Please sign in again.");
    return data.user.id;
  }
  const { data, error } = await adminClient().auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub || data?.claims?.role !== "authenticated") throw new HttpError(401, "Please sign in again.");
  return sub;
}
