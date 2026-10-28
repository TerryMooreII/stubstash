-- Trigger and internal helper functions aren't API endpoints. (Trigger
-- functions can't run outside a trigger anyway; this keeps the API surface tidy.)
revoke execute on function
  public._on_friendship_change(), public._on_attendance_insert(), public._on_notification_grouped(),
  public._on_companion_tagged(), public._on_invite_claimed(), public._require_admin()
  from public, anon, authenticated;
