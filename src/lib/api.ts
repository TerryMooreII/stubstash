// Every call the app makes to Supabase goes through here, so screens stay
// simple and the data shapes live in one place (see ./types.ts).
// Reads go through cached() (lib/offline.ts): fresh when online, the last saved
// copy when offline. Writes always go straight to the server.

import { check, invokeFn, supabase } from "./supabase";
import { cached } from "./offline";
import type {
  ArtistStats, AttendanceDetail, Badge, DashboardStats, Friend, LogEntry, MapVenue,
  PersonCard, Profile, PublicProfile, SetDraft, SetlistSearchParams, SetlistSearchResponse, SetlistSong,
  ShowStats, VenueStats, YearInReview,
  MapHome, MapTrip, PastHome,
} from "./types";

/** RPC arg for "this user, or me when omitted". */
const forUser = (userId?: string) => (userId ? { p_user: userId } : {});
/** Cache key part: the user id, or "me". */
const who = (userId?: string) => userId ?? "me";

/** The signed-in user's id, or null. */
async function currentUserId(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  return u.user?.id ?? null;
}

/** The signed-in user's id; throws when signed out. */
async function myId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error("Please sign in.");
  return id;
}

// ---------------------------------------------------------------- edge functions

const sfm = <T>(body: Record<string, unknown>) => invokeFn<T>("setlistfm", body);

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
  return (await invokeFn<{ sent: number }>("push", { action: "test" })).sent;
}

// ---------------------------------------------------------------- profile

export async function getMyProfile(): Promise<Profile | null> {
  // getSession reads the stored session (works offline); RLS still guards the row.
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) return null;
  return cached(`profile:${id}`, async () =>
    check(await supabase.from("profiles").select("*").eq("id", id).maybeSingle()) as Profile | null, false);
}

export async function updateMyProfile(patch: Partial<Omit<Profile, "id" | "created_at">>): Promise<Profile> {
  return check(await supabase.from("profiles").update(patch).eq("id", await myId()).select("*").single()) as Profile;
}

// ---------------------------------------------------------------- past homes
// Private to the owner (RLS). Stats read them server-side.

export async function listPastHomes(): Promise<PastHome[]> {
  return (check(await supabase.from("past_homes").select("id, city, lat, lng, country_code, moved_in")
    .order("moved_in", { ascending: false, nullsFirst: false })) as PastHome[]) ?? [];
}

export async function addPastHome(h: Omit<PastHome, "id">): Promise<PastHome> {
  return check(await supabase.from("past_homes").insert(h).select("id, city, lat, lng, country_code, moved_in").single()) as PastHome;
}

export async function setPastHomeMovedIn(id: string, movedIn: string | null): Promise<void> {
  check(await supabase.from("past_homes").update({ moved_in: movedIn }).eq("id", id));
}

export async function deletePastHome(id: string): Promise<void> {
  check(await supabase.from("past_homes").delete().eq("id", id));
}

export async function publicProfile(handle: string): Promise<PublicProfile | null> {
  const h = handle.replace(/^@/, "").toLowerCase();
  return cached(`public_profile:${h}`, async () => {
    const rows = check(await supabase.rpc("public_profile", { p_handle: h })) as PublicProfile[];
    return rows?.[0] ?? null;
  });
}

// ---------------------------------------------------------------- log + stats

export async function userLog(userId?: string): Promise<LogEntry[]> {
  // Your own log is saved by the log store; other people's here.
  const get = async () => {
    const rows = check(await supabase.rpc("user_log", forUser(userId))) as LogEntry[];
    return (rows ?? []).sort((a, b) => b.show_number - a.show_number);
  };
  return userId ? cached(`user_log:${userId}`, get) : get();
}

export async function dashboardStats(userId?: string): Promise<DashboardStats | null> {
  return check(await supabase.rpc("dashboard_stats", forUser(userId))) as DashboardStats | null;
}

export async function showSetlist(attendanceId: string): Promise<SetlistSong[]> {
  return cached(`show_setlist:${attendanceId}`, async () =>
    (check(await supabase.rpc("show_setlist", { p_attendance: attendanceId })) as SetlistSong[]) ?? []);
}

export async function showStats(attendanceId: string): Promise<ShowStats | null> {
  return cached(`show_stats:${attendanceId}`, async () =>
    check(await supabase.rpc("show_stats", { p_attendance: attendanceId })) as ShowStats | null);
}

export async function artistStats(artistId: string, userId?: string): Promise<ArtistStats> {
  return cached(`artist_stats:${artistId}:${who(userId)}`, async () =>
    check(await supabase.rpc("artist_stats", { p_artist: artistId, ...forUser(userId) })) as ArtistStats);
}

export async function venueStats(venueId: string, userId?: string): Promise<VenueStats> {
  return cached(`venue_stats:${venueId}:${who(userId)}`, async () =>
    check(await supabase.rpc("venue_stats", { p_venue: venueId, ...forUser(userId) })) as VenueStats);
}

export async function mapVenues(userId?: string): Promise<MapVenue[]> {
  return cached(`map_venues:${who(userId)}`, async () =>
    (check(await supabase.rpc("map_venues", forUser(userId))) as MapVenue[]) ?? []);
}

export async function mapHomes(userId?: string): Promise<MapHome[]> {
  return cached(`map_homes:${who(userId)}`, async () =>
    (check(await supabase.rpc("map_homes", forUser(userId))) as MapHome[]) ?? []);
}

export async function mapTrips(userId?: string): Promise<MapTrip[]> {
  return cached(`map_trips:${who(userId)}`, async () =>
    (check(await supabase.rpc("map_trips", forUser(userId))) as MapTrip[]) ?? []);
}

export async function yearInReview(year: number, userId?: string): Promise<YearInReview> {
  return cached(`year_in_review:${year}:${who(userId)}`, async () =>
    check(await supabase.rpc("year_in_review", { p_year: year, ...forUser(userId) })) as YearInReview);
}

export async function badges(userId?: string): Promise<Badge[]> {
  return cached(`badges:${who(userId)}`, async () =>
    (check(await supabase.rpc("user_badges", forUser(userId))) as Badge[]) ?? []);
}

// ---------------------------------------------------------------- catalog

export async function getArtist(id: string) {
  return cached(`artist:${id}`, async () => check(await supabase.from("artists")
    .select("id, name, mbid, genre, image_url, image_source, image_credit, setlistfm_url, source, created_by")
    .eq("id", id).maybeSingle()));
}

export async function getVenue(id: string) {
  return cached(`venue:${id}`, async () => check(await supabase.from("venues")
    .select("id, name, city, state, state_code, country_code, country_name, lat, lng, city_lat, city_lng, geo_source, capacity, image_url, image_source, image_credit, source, created_by")
    .eq("id", id).maybeSingle()));
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
  id, user_id, rating, seat, price_cents, currency, merch, notes, is_festival, festival_name, headliner, stub_path, created_at,
  show:shows!inner (
    id, event_date, tour_name, info, is_festival, source, created_by, setlistfm_url, setlistfm_id,
    artist:artists!inner ( id, name, image_url, image_credit, image_source, genre, source ),
    venue:venues!inner ( id, name, city, state_code, country_code, image_url, image_credit, capacity, source )
  ),
  companions:attendance_companions ( id, name, companion_user_id ),
  photos:attendance_photos ( id, storage_path, created_at )
`;

export async function getAttendance(id: string): Promise<AttendanceDetail | null> {
  return cached(`attendance:${id}`, async () =>
    check(await supabase.from("attendances").select(ATTENDANCE_SELECT).eq("id", id).maybeSingle()) as unknown as AttendanceDetail | null);
}

/** Everything in your log for the CSV export (no photos, stubs or setlists). Paged past the 1000-row API limit. */
export async function exportAttendances(): Promise<import("./exportCsv").ExportAttendance[]> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error("Please sign in.");
  const out: import("./exportCsv").ExportAttendance[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await supabase.from("attendances").select(`
      id, rating, seat, price_cents, currency, merch, notes, is_festival, created_at,
      show:shows!inner ( event_date, tour_name, info, is_festival, source, setlistfm_url,
        artist:artists!inner ( name ),
        venue:venues!inner ( name, city, state_code, country_code ) ),
      companions:attendance_companions ( name )
    `).eq("user_id", me).order("id").range(from, from + 999)) as unknown as import("./exportCsv").ExportAttendance[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/** Festival name suggestions from everyone's names (most used first). */
export async function festivalNames(q: string): Promise<{ name: string; uses: number }[]> {
  return (check(await supabase.rpc("festival_names", { q })) as { name: string; uses: number }[]) ?? [];
}

/** Marks (or unmarks) several of your shows as a festival. Returns how many changed. */
export async function setFestival(attendanceIds: string[], on: boolean, name?: string | null): Promise<number> {
  return check(await supabase.rpc("set_festival", { p_ids: attendanceIds, p_on: on, p_name: name ?? null })) as number;
}

/** Makes this act the headliner of its show (same venue and date). */
export async function setHeadliner(attendanceId: string) {
  check(await supabase.rpc("set_headliner", { p_attendance: attendanceId }));
}

export interface AttendancePatch {
  rating?: number | null;
  seat?: string | null;
  price_cents?: number | null;
  currency?: string;
  merch?: string | null;
  notes?: string | null;
  is_festival?: boolean | null;
  festival_name?: string | null;
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
  check(await supabase.from("user_venue_pins").upsert({ user_id: await myId(), venue_id: venueId, lat, lng, updated_at: new Date().toISOString() }));
}

// ---------------------------------------------------------------- social

export const social = {
  search: async (q: string) => (check(await supabase.rpc("search_people", { q })) as PersonCard[]) ?? [],
  suggested: async () =>
    (check(await supabase.rpc("suggested_people")) as (PersonCard & { shared_count: number; example: string | null })[]) ?? [],
  friends: async () => cached("my_friends", async () => (check(await supabase.rpc("my_friends")) as Friend[]) ?? []),
  incoming: async () =>
    (check(await supabase.rpc("incoming_friend_requests")) as
      { requester_id: string; handle: string; display_name: string; avatar_path: string | null; created_at: string; shared_example: string | null }[]) ?? [],
  request: async (handle: string) => check(await supabase.rpc("send_friend_request", { p_handle: handle })) as "sent" | "friends",
  respond: async (requesterId: string, accept: boolean) => {
    const me = await myId();
    check(await supabase.from("friendships")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("requester_id", requesterId).eq("addressee_id", me));
  },
  remove: async (otherId: string) => {
    const me = await myId();
    check(await supabase.from("friendships").delete()
      .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me})`));
  },
  sharedShows: async (otherId: string) =>
    (check(await supabase.rpc("shared_shows", { p_other: otherId })) as
      { attendance_id: string; event_date: string; artist_name: string; venue_name: string; city: string | null }[]) ?? [],
  createInvite: async (attendanceId: string, companionId: string | null) => {
    const me = await myId();
    return check(await supabase.from("show_invites")
      .insert({ inviter_id: me, attendance_id: attendanceId, companion_id: companionId })
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
  const me = await currentUserId();
  if (!me) return;
  const j = sub.toJSON();
  check(await supabase.from("push_subscriptions").upsert({
    user_id: me, endpoint: j.endpoint!, p256dh: j.keys!.p256dh!, auth: j.keys!.auth!,
    user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: "endpoint" }));
}

export async function removePushSubscription(endpoint: string) {
  check(await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint));
}
