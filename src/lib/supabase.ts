import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Fail loudly in dev; a blank screen is harder to debug.
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.");
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

/** Turns a Supabase/PostgREST/edge error into a message we can show people. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  const e = err as { message?: string; error?: string; context?: { error?: string } };
  const msg = e.context?.error ?? e.error ?? e.message;
  if (!msg) return fallback;
  if (/failed to fetch|network/i.test(msg)) return "You're offline. We'll try again when you're back on signal.";
  if (/jwt|not signed in|sign in/i.test(msg)) return "Please sign in again.";
  return msg;
}

/** Unwraps a Supabase response: returns data or throws the error. */
export function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/**
 * Calls an edge function. Non-2xx responses carry our `{ error }` message in
 * the body; supabase-js hides it in `error.context`, so pull it out here.
 */
export async function invokeFn<T>(name: string, body: Record<string, unknown>, fallback?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const payload = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    if (payload?.error) throw new Error(payload.error);
    if (fallback) throw new Error(fallback);
    throw error;
  }
  return data as T;
}
