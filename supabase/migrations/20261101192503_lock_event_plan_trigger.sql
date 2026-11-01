-- Trigger functions aren't meant to be called over the API.
revoke execute on function public._on_event_plan_change() from public, anon, authenticated;
