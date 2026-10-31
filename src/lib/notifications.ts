// In-app notifications and per-kind preferences (in-app / push).
import { check, supabase } from "./supabase";

export type NotificationKind =
  | "friend_request" | "friend_accepted" | "friend_show" | "same_show"
  | "tagged" | "invite_claimed" | "badge_earned" | "rate_show";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  url: string | null;
  count: number;
  read_at: string | null;
  created_at: string;
  updated_at: string;
  actor_handle: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
}

/** profiles.notification_prefs: a missing value means "on". */
export type NotificationPrefs = Partial<Record<NotificationKind, { inapp?: boolean; push?: boolean }>>;

/** What each kind is, for the settings list (in display order). */
export const NOTIFICATION_KINDS: { kind: NotificationKind; label: string; hint: string }[] = [
  { kind: "friend_request", label: "Friend requests", hint: "Someone wants to be friends" },
  { kind: "friend_accepted", label: "Request accepted", hint: "Someone accepted your request" },
  { kind: "friend_show", label: "Friends' new shows", hint: "A friend logged a show from the last two weeks" },
  { kind: "same_show", label: "You were both there", hint: "A friend logged a show you also logged" },
  { kind: "tagged", label: "Tagged at a show", hint: "A friend said you went with them" },
  { kind: "invite_claimed", label: "Invite accepted", hint: "Someone joined from your \"you were there\" invite" },
  { kind: "badge_earned", label: "Badges", hint: "You unlocked a badge" },
  { kind: "rate_show", label: "Rate last night", hint: "10am the morning after a show you haven't rated" },
];

export function prefOn(prefs: NotificationPrefs | null | undefined, kind: NotificationKind, channel: "inapp" | "push"): boolean {
  return prefs?.[kind]?.[channel] ?? true;
}

export const notificationsApi = {
  list: async (limit = 30, before?: string) =>
    (check(await supabase.rpc("my_notifications", { p_limit: limit, ...(before ? { p_before: before } : {}) })) as AppNotification[]) ?? [],
  unread: async () => (check(await supabase.rpc("unread_notifications")) as number) ?? 0,
  /** Marks these read, or all of them when ids is omitted. */
  markRead: async (ids?: string[]) => {
    check(await supabase.rpc("mark_notifications_read", ids ? { p_ids: ids } : {}));
  },
  remove: async (id: string) => {
    check(await supabase.from("notifications").delete().eq("id", id));
  },
};
