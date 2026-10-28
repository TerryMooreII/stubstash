// Admin-only data and actions. Every RPC here checks is_admin() on the server;
// the UI hides the admin page for everyone else, but the server is the guard.
import { supabase } from "./supabase";

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export interface AdminJob {
  name: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_status: string | null;
  last_message: string | null;
  failures_24h: number;
}

export interface AdminOverview {
  totals: {
    users: number; users_7d: number; users_30d: number; active_7d: number; suspended: number; unconfirmed: number;
    public: number; attendances: number; attendances_7d: number; shows: number; manual_shows: number;
    artists: number; venues: number; songs: number; photos: number; friendships: number; push_devices: number;
  };
  /** Last 12 weeks, oldest first. `week` is the Monday, YYYY-MM-DD. */
  weekly: { week: string; signups: number; logged: number }[];
  catalog: {
    artists_pending: number; artists_no_image: number; venues_pending: number; venues_city_only: number;
    venues_no_image: number; unused_artists: number; unused_venues: number; api_cache_rows: number; api_cache_bytes: number;
  };
  jobs: AdminJob[];
  http: { ok: number; failed: number; recent_failures: { created: string; status_code: number | null; message: string | null }[] };
}

export interface AdminUser {
  id: string;
  email: string;
  handle: string | null;
  display_name: string | null;
  home_city: string | null;
  is_public: boolean;
  is_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  /** Set when suspended. */
  banned_until: string | null;
  onboarded: boolean;
  show_count: number;
  last_logged_at: string | null;
  total: number;
}

export type ArtistFilter = "all" | "no_image" | "manual" | "unused";
export type VenueFilter = "all" | "no_image" | "no_pin" | "manual" | "unused";

export interface AdminArtist {
  id: string; name: string; mbid: string | null; disambiguation: string | null; genre: string | null;
  source: "setlistfm" | "manual"; image_url: string | null; image_source: string | null; image_credit: string | null;
  image_checked_at: string | null; shows: number; fans: number; created_at: string; total: number;
}

export interface AdminVenue {
  id: string; name: string; city: string | null; state_code: string | null; country_code: string | null;
  lat: number | null; lng: number | null; city_lat: number | null; city_lng: number | null;
  geo_source: string; wikidata_id: string | null; capacity: number | null; source: "setlistfm" | "manual";
  image_url: string | null; image_source: string | null; image_credit: string | null; image_checked_at: string | null;
  shows: number; fans: number; created_at: string; total: number;
}

export interface ArtistPatch { name?: string; genre?: string; disambiguation?: string; image_url?: string; image_credit?: string }
export interface VenuePatch {
  name?: string; city?: string; state_code?: string; country_code?: string; capacity?: number | "";
  image_url?: string; image_credit?: string; lat?: number; lng?: number;
}

const page = (limit = 50, offset = 0) => ({ p_limit: limit, p_offset: offset });

export const admin = {
  isAdmin: async () => (check(await supabase.rpc("is_admin")) as boolean) === true,
  overview: async () => check(await supabase.rpc("admin_overview")) as AdminOverview,

  users: async (q = "", limit = 50, offset = 0) =>
    (check(await supabase.rpc("admin_users", { q, ...page(limit, offset) })) as AdminUser[]) ?? [],
  artists: async (q = "", filter: ArtistFilter = "all", limit = 50, offset = 0) =>
    (check(await supabase.rpc("admin_artists", { q, p_filter: filter, ...page(limit, offset) })) as AdminArtist[]) ?? [],
  venues: async (q = "", filter: VenueFilter = "all", limit = 50, offset = 0) =>
    (check(await supabase.rpc("admin_venues", { q, p_filter: filter, ...page(limit, offset) })) as AdminVenue[]) ?? [],

  updateArtist: async (id: string, patch: ArtistPatch) => { check(await supabase.rpc("admin_update_artist", { p_id: id, patch })); },
  updateVenue: async (id: string, patch: VenuePatch) => { check(await supabase.rpc("admin_update_venue", { p_id: id, patch })); },
  /** Queue for the image/pin lookup job (runs every 2 minutes). */
  requeue: async (kind: "artist" | "venue", ids: string[]) => check(await supabase.rpc("admin_requeue", { p_kind: kind, p_ids: ids })) as number,
  /** Moves shows from `from` onto `into`, then deletes `from`. Returns shows moved. */
  mergeArtists: async (from: string, into: string) => check(await supabase.rpc("admin_merge_artists", { p_from: from, p_into: into })) as number,
  mergeVenues: async (from: string, into: string) => check(await supabase.rpc("admin_merge_venues", { p_from: from, p_into: into })) as number,
  /** Deletes artists and venues no show uses. */
  pruneUnused: async () => check(await supabase.rpc("admin_prune_unused")) as { artists: number; venues: number },

  // Auth actions go through the "admin" edge function (needs the service role).
  suspend: (userId: string) => userAction("suspend", userId),
  unsuspend: (userId: string) => userAction("unsuspend", userId),
  deleteUser: (userId: string) => userAction("delete", userId),
};

async function userAction(action: "suspend" | "unsuspend" | "delete", userId: string) {
  const { data, error } = await supabase.functions.invoke("admin", { body: { action, user_id: userId } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const payload = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error(payload?.error ?? "That didn't work. Try again.");
  }
  return data as { ok: true; files_removed?: number };
}
