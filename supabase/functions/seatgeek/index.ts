// SeatGeek gateway for upcoming shows. Requires a signed-in user.
//
// POST { action: "search", q?, artist?, venue?, lat?, lng?, range?, from?, to?, seen_only?, page? }
//        -> { results: PlanItem[], total, page, pages, near }
//        Without lat/lng it searches around your home (if set). range: 25 | 50 | 100 | 250 | "any" (miles).
// POST { action: "event", seatgeek_id }            -> PlanItem
// POST { action: "plan", seatgeek_id, status }     -> PlanItem   (status: going | interested | cant | null to clear)
//
// PlanItem = { event, status, note, invited_by, crew, seen } (see public._plan_item).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError, json, serve } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { sgGet, slugify, toEventRow, type SgEvent, type SgEventsPage } from "../_shared/seatgeek.ts";

const PER_PAGE = 25;
const RANGES = new Set(["25", "50", "100", "250", "any"]);
const STATUSES = new Set(["going", "interested", "cant"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type EventRow = ReturnType<typeof toEventRow>;

function clean(v: unknown, max = 120): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function seatgeekId(v: unknown): number {
  const n = num(v);
  if (!n || !Number.isInteger(n) || n <= 0) throw new HttpError(400, "Missing event id.");
  return n;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Times you've seen each artist, keyed by lower-cased name. */
async function seenCounts(db: SupabaseClient, userId: string, names: string[]): Promise<Map<string, number>> {
  if (!names.length) return new Map();
  const { data, error } = await db.rpc("_artist_seen_counts", { p_user: userId, p_names: [...new Set(names)] });
  if (error) throw error;
  return new Map((data ?? []).map((r: { name: string; shows: number }) => [r.name, r.shows]));
}

async function planItem(db: SupabaseClient, userId: string, eventId: string) {
  const { data, error } = await db.rpc("_plan_item", { p_viewer: userId, p_event: eventId });
  if (error) throw error;
  if (!data) throw new HttpError(404, "That show isn't available anymore.");
  const seen = await seenCounts(db, userId, [data.event.artist]);
  return { ...data, seen: seen.get(String(data.event.artist).toLowerCase()) ?? 0 };
}

/** Saves (or refreshes) an event from SeatGeek and returns our id for it. */
async function saveEvent(db: SupabaseClient, sgId: number, maxAgeMinutes: number): Promise<string> {
  const { data: have } = await db.from("upcoming_events").select("id, fetched_at").eq("seatgeek_id", sgId).maybeSingle();
  if (have && Date.now() - new Date(have.fetched_at).getTime() < maxAgeMinutes * 60_000) return have.id;

  const ev = await sgGet<SgEvent>(db, `/events/${sgId}`, 30);
  if (!ev) {
    if (have) return have.id; // gone from SeatGeek (often after the show); keep what we have
    throw new HttpError(404, "That show isn't on SeatGeek anymore.");
  }
  const row = toEventRow(ev);
  if (!row.local_date) throw new HttpError(404, "That show doesn't have a date yet.");
  const { data, error } = await db.from("upcoming_events")
    .upsert({ ...row, fetched_at: new Date().toISOString() }, { onConflict: "seatgeek_id" })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

serve(async (req) => {
  const userId = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  switch (body.action) {
    case "search": {
      const page = Math.max(1, Math.min(20, Number(body.page) || 1));
      const today = new Date().toISOString().slice(0, 10);
      const from = clean(body.from, 10) ?? today;
      const to = clean(body.to, 10) ?? addDays(today, 183);
      if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) throw new HttpError(400, "Dates look like 2026-12-31.");
      if (to < from) throw new HttpError(400, "The end date is before the start date.");
      const range = String(body.range ?? "50");
      if (!RANGES.has(range)) throw new HttpError(400, "Pick a distance of 25, 50, 100 or 250 miles, or anywhere.");

      const p = new URLSearchParams({
        "taxonomies.name": "concert",
        "datetime_local.gte": `${from < today ? today : from}T00:00:00`,
        "datetime_local.lte": `${to}T23:59:59`,
        sort: "datetime_local.asc",
        per_page: String(PER_PAGE),
        page: String(page),
      });
      const words = [clean(body.q), clean(body.artist), clean(body.venue)].filter(Boolean).join(" ");
      if (words) p.set("q", words);

      // Where: the place picked in the search, else your home.
      let near: string | null = null;
      if (range !== "any") {
        let lat = num(body.lat), lng = num(body.lng);
        if (lat !== undefined && lng !== undefined) {
          near = clean(body.place_label) ?? null;
        } else {
          const { data: me } = await db.from("profiles").select("home_city, home_lat, home_lng").eq("id", userId).single();
          if (me?.home_lat != null && me?.home_lng != null) {
            lat = me.home_lat; lng = me.home_lng; near = me.home_city ?? null;
          }
        }
        if (lat !== undefined && lng !== undefined) {
          if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, "That location doesn't look right.");
          p.set("lat", lat.toFixed(3));
          p.set("lon", lng.toFixed(3));
          p.set("range", `${range}mi`);
        }
      }

      // "Artists you've seen": SeatGeek matches performers by slug, so we guess slugs from names.
      if (body.seen_only) {
        const { data: names, error } = await db.rpc("_top_artist_names", { p_user: userId, p_limit: 40 });
        if (error) throw error;
        const slugs = [...new Set((names ?? []).map((n: string) => slugify(n)).filter(Boolean))];
        if (!slugs.length) return json({ results: [], total: 0, page, pages: 0, near });
        p.delete("q");
        for (const s of slugs) p.append("performers.slug", s);
      }

      const res = await sgGet<SgEventsPage>(db, `/events?${p.toString()}`, 15);
      const rows: EventRow[] = (res?.events ?? []).map(toEventRow).filter((r) => r.local_date);

      const [plans, seen] = await Promise.all([
        rows.length
          ? db.rpc("_plan_items_by_seatgeek", { p_viewer: userId, p_ids: rows.map((r) => r.seatgeek_id) })
          : Promise.resolve({ data: [], error: null }),
        seenCounts(db, userId, rows.map((r) => r.artist)),
      ]);
      if (plans.error) throw plans.error;
      const known = new Map((plans.data ?? []).map((x: { seatgeek_id: number; item: any }) => [Number(x.seatgeek_id), x.item]));

      const results = rows.map((row) => {
        const item = known.get(row.seatgeek_id);
        return {
          // Fresh SeatGeek data, with our id when someone has opened the event before.
          event: { ...row, id: item?.event?.id ?? null },
          status: item?.status ?? null,
          note: item?.note ?? null,
          invited_by: item?.invited_by ?? null,
          crew: item?.crew ?? [],
          seen: seen.get(row.artist.toLowerCase()) ?? 0,
        };
      });
      const total = res?.meta?.total ?? 0;
      return json({ results, total, page, pages: Math.ceil(total / PER_PAGE), near });
    }

    case "event": {
      const id = await saveEvent(db, seatgeekId(body.seatgeek_id), 30);
      return json(await planItem(db, userId, id));
    }

    case "plan": {
      const status = body.status === null ? null : String(body.status);
      if (status !== null && !STATUSES.has(status)) throw new HttpError(400, "Pick going, interested or can't go.");
      const eventId = await saveEvent(db, seatgeekId(body.seatgeek_id), 6 * 60);

      const { data: ev } = await db.from("upcoming_events").select("local_date").eq("id", eventId).single();
      const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
      if (ev && ev.local_date < yesterday) throw new HttpError(400, "That show has already happened. Log it instead.");

      if (status === null) {
        const { error } = await db.from("event_plans").delete().eq("event_id", eventId).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await db.from("event_plans")
          .upsert({ event_id: eventId, user_id: userId, status }, { onConflict: "event_id,user_id" });
        if (error) throw error;
      }
      return json(await planItem(db, userId, eventId));
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
});
