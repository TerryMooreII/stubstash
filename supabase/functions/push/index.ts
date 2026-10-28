// Web push.
//   { action: "deliver", id } (pg_net, from public._notify) -> pushes one notification to the user's devices
//   { action: "test" }    (signed-in user)  -> sends a test notification to your devices

import webpush from "npm:web-push@3.6.7";
import { HttpError, isCron, json, serve } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

function configure() {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) throw new HttpError(503, "Push isn't configured yet.");
  webpush.setVapidDetails(Deno.env.get("CONTACT_EMAIL") ? `mailto:${Deno.env.get("CONTACT_EMAIL")}` : "https://stubstash.terrymooreii.dev", pub, priv);
}

interface Payload { title: string; body: string; url: string; tag?: string }

/** Sends to every device the user registered. Removes subscriptions the browser has revoked. */
async function sendToUser(db: ReturnType<typeof adminClient>, userId: string, payload: Payload): Promise<number> {
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 6 },
      );
      sent++;
      await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await db.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        console.error("push failed", err?.statusCode, err?.body);
      }
    }
  }
  return sent;
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const db = adminClient();
  configure();

  if (body.action === "deliver") {
    // Queued by public._notify() through pg_net when a notification is created.
    if (!(await isCron(req, db))) throw new HttpError(401, "Not allowed.");
    const id = String(body.id ?? "");
    const { data: n } = await db.from("notifications")
      .select("id, user_id, title, body, url, group_key, pushed_at").eq("id", id).maybeSingle();
    if (!n || n.pushed_at) return json({ sent: 0 });
    const sent = await sendToUser(db, n.user_id, {
      title: n.title,
      body: n.body ?? "",
      url: n.url ?? "/app/notifications",
      // Same tag replaces the earlier banner on the device (e.g. grouped friend shows).
      tag: n.group_key ?? n.id,
    });
    await db.from("notifications").update({ pushed_at: new Date().toISOString() }).eq("id", n.id);
    return json({ sent });
  }

  if (body.action === "test") {
    const userId = await requireUser(req);
    const sent = await sendToUser(db, userId, {
      title: "Stubstash is on",
      body: "You'll get a nudge the morning after a show to rate it.",
      url: "/app",
    });
    return json({ sent });
  }

  throw new HttpError(400, "Unknown action.");
});
