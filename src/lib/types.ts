// App-level types for the data our RPCs and edge functions return.
// Mirrors the SQL in supabase/migrations (see 20261027003542_stats.sql etc.).

export type DataSource = "setlistfm" | "manual";
export type GeoSource = "nominatim" | "wikidata" | "photon" | "city" | "user" | "none";
export type FriendshipState = "friends" | "sent" | "received" | null;

export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  avatar_path: string | null;
  home_city: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_country_code: string | null;
  /** When they moved to the current home (YYYY-MM-DD); null = always, unless past homes say otherwise. */
  home_since: string | null;
  is_public: boolean;
  setlistfm_username: string | null;
  onboarded_at: string | null;
  timezone: string;
  /** Per-kind notification switches; missing = on. See lib/notifications.ts. */
  notification_prefs: import("./notifications").NotificationPrefs;
  /** Bundled concert photo (1..16) for the profile header; null = automatic. */
  header_photo: number | null;
  created_at: string;
}

/** One row of user_log(): an attended show with everything a card needs. */
export interface LogEntry {
  attendance_id: string;
  show_id: string;
  show_number: number;
  event_date: string; // YYYY-MM-DD
  artist_id: string;
  artist_name: string;
  artist_image: string | null;
  venue_id: string;
  venue_name: string;
  city: string | null;
  state_code: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  tour_name: string | null;
  is_festival: boolean;
  source: DataSource;
  setlistfm_id: string | null;
  rating: number | null;
  song_count: number;
  has_stub: boolean;
  photo_count: number;
  created_at: string;
  /** Your name for the festival (only when it's marked as one). */
  festival_name: string | null;
  /** You picked this act as the headliner of that show (see lib/shows.ts). */
  headliner: boolean | null;
}

export interface SongRef {
  song: string;
  artist: string;
  date: string;
  attendance_id: string;
}

export interface DashboardStats {
  totals: {
    /** Shows = one venue on one date (headliner + openers). */
    shows: number;
    /** Every act you've logged (what badges count). */
    sets: number;
    artists: number;
    artists_multi: number;
    venues: number;
    songs: number;
    unique_songs: number;
    cities: number;
    countries: number;
    festivals: number;
    miles: number;
    first_show: string | null;
    last_show: string | null;
    rated: number;
    avg_rating: number | null;
  };
  home: { city: string | null; has_coords: boolean; past_homes?: number };
  per_year: { year: number; n: number }[];
  top_artists: { id: string; name: string; image_url: string | null; n: number; first: string; last: string }[];
  top_venues: { id: string; name: string; city: string | null; n: number }[];
  top_songs: { name: string; artist: string; artist_id: string; n: number }[];
  first_hears: SongRef[];
  one_timers: SongRef[];
  first_hear_total: number;
  streak: { current: number; longest: number; longest_year: number | null; last12: boolean[] | null };
}

export interface SetlistSong {
  set_index: number;
  set_name: string;
  is_encore: boolean;
  position: number;
  name: string;
  info: string | null;
  is_cover: boolean;
  cover_artist: string | null;
  is_tape: boolean;
  first_hear: boolean;
  times_heard: number;
  only_here: boolean;
}

export interface ShowStats {
  show_number: number;
  songs: number;
  first_hears: number;
  artist_ordinal: number;
  artist_total: number;
}

export interface ArtistStats {
  seen: number;
  first: string | null;
  last: string | null;
  unique_songs: number;
  songs_heard: number;
  heard_most: { name: string; n: number }[];
  heard_once: { name: string; date: string }[];
  venues: number;
  avg_rating: number | null;
}

export interface VenueStats {
  visits: number;
  first: string | null;
  last: string | null;
  rank: number | null;
  artists: number;
  /** Distance from where they live now. */
  miles_from_home: number | null;
  /** Round trips here, each from wherever they lived at the time. */
  miles_traveled: number | null;
}

/** An earlier home. Shows on or after moved_in (until the next home) are measured from here. */
export interface PastHome {
  id: string;
  city: string;
  lat: number;
  lng: number;
  country_code: string | null;
  /** YYYY-MM-DD; null = the oldest home, covering everything before the next one. */
  moved_in: string | null;
}

/** A home on the map. Other viewers only get the current one, without dates. */
export interface MapHome {
  city: string | null;
  lat: number;
  lng: number;
  moved_in: string | null;
  /** When the next home started; null = still there. */
  moved_out: string | null;
  is_current: boolean;
}

/** Shows at one venue traveled to from one home. */
export interface MapTrip {
  venue_id: string;
  home_city: string | null;
  home_lat: number;
  home_lng: number;
  years: number[];
  visits: number;
  miles: number | null;
}

export interface MapVenue {
  venue_id: string;
  name: string;
  city: string | null;
  state_code: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  visits: number;
  first_year: number;
  last_year: number;
  recent_artists: string[];
  miles_from_home: number | null;
  geo_source: GeoSource;
}

export interface YearInReview {
  year: number;
  shows: number;
  artists: number;
  venues: number;
  songs: number;
  first_hears: number;
  miles: number;
  new_artists: number;
  top_artist: string | null;
  top_artist_n: number | null;
  top_venue: string | null;
  top_venue_n: number | null;
  best_show: { attendance_id: string; artist: string; venue: string; date: string; rating: number | null } | null;
}

export type BadgeColor = "yellow" | "orange" | "teal" | "slate" | "mint" | "gold";

export interface Badge {
  key: string;
  name: string;
  description: string;
  color: BadgeColor | string;
  target: number;
  progress: number;
  earned: boolean;
  sort_order: number;
}

export interface PersonCard {
  id: string;
  handle: string;
  display_name: string;
  avatar_path: string | null;
  is_public?: boolean;
  friendship?: FriendshipState;
  show_count?: number | null;
}

export interface Friend extends PersonCard {
  show_count: number;
  shared_count: number;
  since: string;
}

export interface PublicProfile extends PersonCard {
  home_city: string | null;
  is_public: boolean;
  can_view: boolean;
  is_self: boolean;
  header_photo: number | null;
}

/** A setlist.fm search result (from the setlistfm edge function). */
export interface SetlistResult {
  setlistfm_id: string;
  date: string;
  artist: string;
  artist_mbid: string | null;
  venue: string;
  city: string | null;
  state_code: string | null;
  country_code: string | null;
  tour: string | null;
  songs: number;
  url: string | null;
  /** setlist.fm's notes for the night (guests, debuts, weather...). */
  info?: string | null;
  sets?: { name: string; encore: boolean; songs: { name: string; cover: string | null; info: string | null; tape: boolean }[] }[];
  attendance_id: string | null;
}

/** setlist.fm search filters. Dates are YYYY-MM-DD; state and country are codes ("CO", "US"). */
export interface SetlistSearchParams {
  q?: string;
  artist?: string;
  artist_mbid?: string;
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
  tour?: string;
  date?: string;
  year?: string;
  page?: number;
}

export interface SetlistSearchResponse {
  results: SetlistResult[];
  total: number;
  page: number;
  pages: number;
  matched_by: string | null;
}

/** Full attendance row joined with its show/artist/venue, for the show page. */
export interface AttendanceDetail {
  id: string;
  user_id: string;
  rating: number | null;
  seat: string | null;
  price_cents: number | null;
  currency: string;
  merch: string | null;
  notes: string | null;
  is_festival: boolean | null;
  festival_name: string | null;
  headliner: boolean | null;
  stub_path: string | null;
  created_at: string;
  show: {
    id: string;
    event_date: string;
    tour_name: string | null;
    info: string | null;
    is_festival: boolean;
    source: DataSource;
    created_by: string | null;
    setlistfm_url: string | null;
    setlistfm_id: string | null;
    artist: { id: string; name: string; image_url: string | null; image_credit: string | null; image_source: string | null; genre: string | null; source: DataSource };
    venue: {
      id: string; name: string; city: string | null; state_code: string | null; country_code: string | null;
      image_url: string | null; image_credit: string | null; capacity: number | null; source: DataSource;
    };
  };
  companions: { id: string; name: string; companion_user_id: string | null }[];
  photos: { id: string; storage_path: string; created_at: string }[];
}

/** Sets for the manual add/edit form and create_manual_show RPC. */
export interface SetDraft {
  name: string;
  encore: boolean;
  songs: string[];
}
