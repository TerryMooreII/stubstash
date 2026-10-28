// Every call the app makes to Supabase goes through here, so screens stay
// simple and the data shapes live in one place (see ./types.ts).

import { supabase } from "./supabase";
import type {
  ArtistStats, AttendanceDetail, Badge, DashboardStats, Friend, LogEntry, MapVenue,
  PersonCard, Profile, PublicProfile, SetDraft, SetlistSearchParams, SetlistSearchResponse, SetlistSong,
  ShowStats, VenueStats, YearInReview,
} from "./types";

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// ---------------------------------------------------------------- edge functions

async function sfm<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("setlistfm", { body });
  if (error) {
    // supabase-js wraps non-2xx responses; pull our { error } message out of the body.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  return data as T;
}

export const setlistfm = {
  search: (params: SetlistSearchParams) => sfm<SetlistSearchResponse>({ action: "search", ...params }),
  /** Artist suggestions (with MusicBrainz ids) for the advanced search. */
  artists: (q: string) =>
    sfm<{ artists: { mbid: string; name: string; disambiguation: string | null }[] }>({ action: "artists", q }),
  log: (setlistfmId: string) =>
    sfm<{ attendance_id: string; show_id: string; created: boolean }>({ action: "log", setlistfm_id: setlistfmId }),
  previewUser: (username: string) =>
    sfm<{ total: number; pages: number; earliest: { artist: string; venue: string; date: string } | null; sample_artists?: string[] }>(
      { action: "preview_user", username },
    ),
  importPage: (username: string, page: number) =>
    sfm<{ page: number; pages: number; total: number; imported: number; skipped: number }>({ action: "import_user", username, page }),
  refresh: (showId: string) => sfm<{ show_id: string }>({ action: "refresh", show_id: showId }),
};

export async function sendTestPush(): Promise<number> {
  const { data, error } = await supabase.functions.invoke("push", { body: { action: "test" } });
  if (error) throw error;
  return (data as { sent: number }).sent;
}

// ---------------------------------------------------------------- profile

export async function getMyProfile(): Promise<Profile | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  return check(await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle()) as Profile | null;
}

export async function updateMyProfile(patch: Partial<Omit<Profile, "id" | "created_at">>): Promise<Profile> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Please sign in.");
  return check(await supabase.from("profiles").update(patch).eq("id", u.user.id).select("*").single()) as Profile;
}

export async function publicProfile(handle: string): Promise<PublicProfile | null> {
  const rows = check(await supabase.rpc("public_profile", { p_handle: handle.replace(/^@/, "") })) as PublicProfile[];
  return rows?.[0] ?? null;
}

// ---------------------------------------------------------------- log + stats

export async function userLog(userId?: string): Promise<LogEntry[]> {
  const rows = check(await supabase.rpc("user_log", userId ? { p_user: userId } : {})) as LogEntry[];
  return (rows ?? []).sort((a, b) => b.show_number - a.show_number);
}

export async function dashboardStats(userId?: string): Promise<DashboardStats | null> {
  return check(await supabase.rpc("dashboard_stats", userId ? { p_user: userId } : {})) as DashboardStats | null;
}

export async function showSetlist(attendanceId: string): Promise<SetlistSong[]> {
  return (check(await supabase.rpc("show_setlist", { p_attendance: attendanceId })) as SetlistSong[]) ?? [];
}

export async function showStats(attendanceId: string): Promise<ShowStats | null> {
  return check(await supabase.rpc("show_stats", { p_attendance: attendanceId })) as ShowStats | null;
}

export async function artistStats(artistId: string, userId?: string): Promise<ArtistStats> {
  return check(await supabase.rpc("artist_stats", { p_artist: artistId, ...(userId ? { p_user: userId } : {}) })) as ArtistStats;
}

export async function venueStats(venueId: string, userId?: string): Promise<VenueStats> {
  return check(await supabase.rpc("venue_stats", { p_venue: venueId, ...(userId ? { p_user: userId } : {}) })) as VenueStats;
}

export async function mapVenues(userId?: string): Promise<MapVenue[]> {
  return (check(await supabase.rpc("map_venues", userId ? { p_user: userId } : {})) as MapVenue[]) ?? [];
}

export async function mapHome(userId?: string): Promise<{ city: string | null; lat: number | null; lng: number | null } | null> {
  const rows = check(await supabase.rpc("map_home", userId ? { p_user: userId } : {})) as { city: string; lat: number; lng: number }[];
  return rows?.[0] ?? null;
}

export async function yearInReview(year: number, userId?: string): Promise<YearInReview> {
  return check(await supabase.rpc("year_in_review", { p_year: year, ...(userId ? { p_user: userId } : {}) })) as YearInReview;
}

export async function badges(userId?: string): Promise<Badge[]> {
  return (check(await supabase.rpc("user_badges", userId ? { p_user: userId } : {})) as Badge[]) ?? [];
}

// ---------------------------------------------------------------- catalog

export async function getArtist(id: string) {
  return check(await supabase.from("artists")
    .select("id, name, mbid, genre, image_url, image_source, image_credit, setlistfm_url, source, created_by")
    .eq("id", id).maybeSingle());
}

export async function getVenue(id: string) {
  return check(await supabase.from("venues")
    .select("id, name, city, state, state_code, country_code, country_name, lat, lng, city_lat, city_lng, geo_source, capacity, image_url, image_source, image_credit, source, created_by")
    .eq("id", id).maybeSingle());
}

export async function searchCatalogArtists(q: string) {
  return (check(await supabase.rpc("search_catalog_artists", { q })) as { id: string; name: string; image_url: string | null; source: string }[]) ?? [];
}

export async function searchCatalogVenues(q: string) {
  return (check(await supabase.rpc("search_catalog_venues", { q })) as
    { id: string; name: string; city: string | null; state_code: string | null; country_code: string | null; source: string }[]) ?? [];
}

// ---------------------------------------------------------------- attendances

const ATTENDANCE_SELECT = `
  id, user_id, rating, seat, price_cents, currency, merch, notes, is_festival, stub_path, created_at,
  show:shows!inner (
    id, event_date, tour_name, info, is_festival, source, created_by, setlistfm_url, setlistfm_id,
    artist:artists!inner ( id, name, image_url, image_credit, image_source, genre, source ),
    venue:venues!inner ( id, name, city, state_code, country_code, image_url, image_credit, capacity, source )
  ),
  companions:attendance_companions ( id, name, companion_user_id ),
  photos:attendance_photos ( id, storage_path, created_at )
`;

export async function getAttendance(id: string): Promise<AttendanceDetail | null> {
  return check(await supabase.from("attendances").select(ATTENDANCE_SELECT).eq("id", id).maybeSingle()) as unknown as AttendanceDetail | null;
}

export interface AttendancePatch {
  rating?: number | null;
  seat?: string | null;
  price_cents?: number | null;
  currency?: string;
  merch?: string | null;
  notes?: string | null;
  is_festival?: boolean | null;
  stub_path?: string | null;
}

export async function updateAttendance(id: string, patch: AttendancePatch) {
  return check(await supabase.from("attendances").update(patch).eq("id", id).select("id").single());
}

export async function deleteAttendance(id: string) {
  check(await supabase.from("attendances").delete().eq("id", id));
}

export interface ManualShowInput extends AttendancePatch {
  artist_id?: string | null;
  artist_name?: string;
  venue_id?: string | null;
  venue_name?: string;
  city?: string;
  state_code?: string;
  country_code?: string;
  event_date: string;
  tour_name?: string;
  is_festival?: boolean;
  sets?: SetDraft[];
}

/** Creates a show that isn't on setlist.fm and logs it. Returns the attendance id. */
export async function createManualShow(input: ManualShowInput): Promise<string> {
  return check(await supabase.rpc("create_manual_show", { p: input })) as string;
}

export async function updateManualShow(showId: string, patch: Partial<ManualShowInput>) {
  check(await supabase.rpc("update_manual_show", { p_show: showId, p: patch }));
}

/** Replaces the companion list ("who was there") for an attendance. */
export async function setCompanions(attendanceId: string, people: { name: string; user_id?: string | null }[]) {
  check(await supabase.from("attendance_companions").delete().eq("attendance_id", attendanceId));
  if (!people.length) return [];
  return check(await supabase.from("attendance_companions")
    .insert(people.map((p) => ({ attendance_id: attendanceId, name: p.name.slice(0, 60), companion_user_id: p.user_id ?? null })))
    .select("id, name, companion_user_id")) as { id: string; name: string; companion_user_id: string | null }[];
}

export async function setVenuePin(venueId: string, lat: number, lng: number) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Please sign in.");
  check(await supabase.from("user_venue_pins").upsert({ user_id: u.user.id, venue_id: venueId, lat, lng, updated_at: new Date().toISOString() }));
}

// ---------------------------------------------------------------- social

export const social = {
  search: async (q: string) => (check(await supabase.rpc("search_people", { q })) as PersonCard[]) ?? [],
  suggested: async () =>
    (check(await supabase.rpc("suggested_people")) as (PersonCard & { shared_count: number; example: string | null })[]) ?? [],
  friends: async () => (check(await supabase.rpc("my_friends")) as Friend[]) ?? [],
  incoming: async () =>
    (check(await supabase.rpc("incoming_friend_requests")) as
      { requester_id: string; handle: string; display_name: string; avatar_path: string | null; created_at: string; shared_example: string | null }[]) ?? [],
  request: async (handle: string) => check(await supabase.rpc("send_friend_request", { p_handle: handle })) as "sent" | "friends",
  respond: async (requesterId: string, accept: boolean) => {
    const { data: u } = await supabase.auth.getUser();
    check(await supabase.from("friendships")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("requester_id", requesterId).eq("addressee_id", u.user!.id));
  },
  remove: async (otherId: string) => {
    const { data: u } = await supabase.auth.getUser();
    const me = u.user!.id;
    check(await supabase.from("friendships").delete()
      .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me})`));
  },
  sharedShows: async (otherId: string) =>
    (check(await supabase.rpc("shared_shows", { p_other: otherId })) as
      { attendance_id: string; event_date: string; artist_name: string; venue_name: string; city: string | null }[]) ?? [],
  createInvite: async (attendanceId: string, companionId: string | null) => {
    const { data: u } = await supabase.auth.getUser();
    return check(await supabase.from("show_invites")
      .insert({ inviter_id: u.user!.id, attendance_id: attendanceId, companion_id: companionId })
      .select("token").single()) as { token: string };
  },
  peekInvite: async (token: string) => {
    const rows = check(await supabase.rpc("peek_show_invite", { p_token: token })) as
      { inviter_handle: string; inviter_name: string; artist: string; venue: string; city: string | null; event_date: string; claimed: boolean }[];
    return rows?.[0] ?? null;
  },
  claimInvite: async (token: string) => check(await supabase.rpc("claim_show_invite", { p_token: token })) as string,
};

// ---------------------------------------------------------------- push

export async function savePushSubscription(sub: PushSubscription) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const j = sub.toJSON();
  check(await supabase.from("push_subscriptions").upsert({
    user_id: u.user.id, endpoint: j.endpoint!, p256dh: j.keys!.p256dh!, auth: j.keys!.auth!,
    user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: "endpoint" }));
}

export async function removePushSubscription(endpoint: string) {
  check(await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint));
}
