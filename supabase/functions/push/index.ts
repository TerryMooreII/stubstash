// Web push.
//   { action: "nudges" }  (pg_cron, hourly) -> morning-after "rate the show" reminders
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

  if (body.action === "nudges") {
    if (!(await isCron(req, db))) throw new HttpError(401, "Not allowed.");
    const { data: due, error } = await db.rpc("due_rating_nudges");
    if (error) throw error;
    let sent = 0;
    for (const n of due ?? []) {
      sent += await sendToUser(db, n.user_id, {
        title: `How was ${n.artist}?`,
        body: `Rate last night at ${n.venue} while it's fresh.`,
        url: `/app/shows/${n.attendance_id}?rate=1`,
        tag: `rate-${n.attendance_id}`,
      });
      await db.from("attendances").update({ rating_nudged_at: new Date().toISOString() }).eq("id", n.attendance_id);
    }
    return json({ due: due?.length ?? 0, sent });
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
