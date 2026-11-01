-- Notification kinds for upcoming shows. Kept in their own migration because
-- new enum values can't be used in the transaction that adds them.
alter type public.notification_kind add value if not exists 'event_invite';  -- a friend invited you to an upcoming show
alter type public.notification_kind add value if not exists 'event_reply';   -- someone answered your invite
alter type public.notification_kind add value if not exists 'friend_going';  -- a friend is going to a show you're going to or interested in
alter type public.notification_kind add value if not exists 'log_plan';      -- morning after a show you were going to: log it
