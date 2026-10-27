// Small HTTP helpers shared by all edge functions.

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** An error whose message is safe to show the user. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a handler with CORS preflight and consistent error responses. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "Something went wrong. Try again in a moment." }, 500);
    }
  });
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** True when the request carries the pg_cron shared secret (checked against Vault). */
export async function isCron(
  req: Request,
  db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> },
): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  const { data } = await db.rpc("_verify_cron_secret", { p_secret: secret });
  return data === true;
}
