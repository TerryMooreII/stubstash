-- Notification kind for show anniversaries. Kept in its own migration because
-- new enum values can't be used in the transaction that adds them.
alter type public.notification_kind add value if not exists 'on_this_day';  -- a show you went to on this date in an earlier year
