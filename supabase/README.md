# Stubstash backend (Supabase)

Everything needed to recreate the backend lives in this folder.

| Path | What it is |
| --- | --- |
| `migrations/` | Database schema, security rules, stats functions, storage buckets, cron jobs. Applied in filename order. |
| `functions/setlistfm` | setlist.fm gateway: search, log a show, import a user's history, refresh a setlist. Needs a signed-in user. |
| `functions/enrich` | Background job (every 2 min): artist images and genres, venue coordinates, photos and capacity. |
| `functions/push` | Web push: morning-after "rate the show" nudges (hourly) and a test send. |
| `functions/admin` | Admin-only user actions that need the Auth admin API: suspend, unsuspend, delete (with their uploaded files). |
| `functions/_shared` | Code shared by the functions (HTTP helpers, Supabase clients, setlist.fm client). |
| `config.toml` | Supabase CLI config (local auth settings, per-function JWT settings). |
| `.secrets.local` | Generated VAPID keys. Git-ignored; keep a copy somewhere safe. |

Hosted project: **Stub Stash**, ref `mkwexvexzxdbgjkqfoac` (us-east-1).

## How the data fits together

- **Catalog** (shared by everyone): `artists`, `venues`, `shows`, `setlist_songs`. Rows from setlist.fm are written only by the `setlistfm` edge function. Manual shows are created with the `create_manual_show` RPC and are visible only to the creator and people who can see their log.
- **Personal log:** `attendances` (one row per user per show, with rating, seat, price, merch, notes and stub photo), plus `attendance_companions`, `attendance_photos` and `user_venue_pins` (your own fix for a venue's location).
- **Social:** `friendships` (mutual requests) and `show_invites` (tag someone not on Stubstash; they claim the show when they join).
- **Stats** are SQL functions (`dashboard_stats`, `show_setlist`, `artist_stats`, `venue_stats`, `map_venues`, `year_in_review`, `user_badges`). They compute only from the user's own log, and return nothing unless the caller may see that user (self, friend, or public profile).

## Recreating from scratch

1. Create a Supabase project and install the CLI (`brew install supabase/tap/supabase`).
2. `supabase login` then `supabase link --project-ref <new-ref>`.
3. `supabase db push` applies everything in `migrations/`.
   - The last migration creates two Vault secrets: `cron_secret` (random) and `project_url`. **Update `project_url` for the new project:**
     ```sql
     select vault.update_secret((select id from vault.secrets where name = 'project_url'), 'https://<new-ref>.supabase.co');
     ```
4. Deploy the functions:
   ```sh
   supabase functions deploy setlistfm
   supabase functions deploy enrich --no-verify-jwt
   supabase functions deploy push --no-verify-jwt
   supabase functions deploy admin
   ```
5. Set function secrets (`supabase secrets set NAME=value` or Dashboard → Edge Functions → Secrets):

   | Secret | Required | Notes |
   | --- | --- | --- |
   | `SETLISTFM_API_KEY` | yes | From https://www.setlist.fm/settings/api |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | for push | From `.secrets.local`, or generate new ones with `npx web-push generate-vapid-keys`. The public key also goes in the app's `VITE_VAPID_PUBLIC_KEY`. |
   | `FANART_API_KEY` | optional | Free personal key from https://fanart.tv/get-an-api-key/ for better artist photos |
   | `THEAUDIODB_API_KEY` | optional | Defaults to TheAudioDB's free test key `123` |
   | `CONTACT_EMAIL` | recommended | Sent in the User-Agent to OpenStreetMap/Wikidata, as their usage policies ask |

6. Auth settings in the dashboard (Authentication → Providers / URL Configuration):
   - Email provider on, **Confirm email** on, minimum password length 8.
   - Site URL = your app URL; add `<app-url>/app/auth/callback` and `<app-url>/app/reset-password` to Redirect URLs.

7. Make yourself an admin (there's no way to do this from the app):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = '<your email>';
   ```

## Admin

`public.admins` lists admin user ids. It has row-level security on and no policies, so the app can't read or change it; add or remove admins with SQL only. `is_admin()` checks the caller, and every `admin_*` function calls it first:

| Function | Does |
| --- | --- |
| `admin_overview()` | Totals, 12-week signups and shows logged, catalog health, cron job status, recent job HTTP failures |
| `admin_users(q, limit, offset)` | Users with email, sign-in times, suspension, show counts |
| `admin_artists` / `admin_venues(q, filter, limit, offset)` | Catalog search with filters (`no_image`, `no_pin`, `manual`, `unused`) and usage counts |
| `admin_update_artist` / `admin_update_venue(id, patch)` | Edit names, images, genre, capacity, place, map pin (a pin set here is kept by the lookup job) |
| `admin_requeue(kind, ids)` | Re-run the image/pin lookup for artists or venues |
| `admin_merge_artists` / `admin_merge_venues(from, into)` | Move every show (and personal pins) onto the kept row, fill its gaps, delete the duplicate |
| `admin_prune_unused()` | Delete artists and venues no show uses |

Suspending, unsuspending and deleting users go through the `admin` edge function. Admins can't suspend or delete themselves or other admins. A suspended user can't sign in or refresh; an access token they already hold works until it expires (up to an hour).

## Background jobs (pg_cron)

| Job | Schedule | Does |
| --- | --- | --- |
| `enrich-catalog` | every 2 min | Calls `enrich` for up to 8 artists and 6 venues |
| `rating-nudges` | hourly at :15 | Calls `push` to nudge users at 10am local time the day after a show |
| `prune-api-cache` | daily 04:30 UTC | Deletes setlist.fm cache rows older than 2 days |

Check recent job calls with `select * from net._http_response order by created desc limit 10;`.

## Image and data credits

Setlists from setlist.fm. Artist images: Deezer first, then fanart.tv, TheAudioDB and Wikimedia Commons (MusicBrainz fills in missing artist ids). Venue locations: Wikidata coordinates, then Photon and Nominatim (OpenStreetMap), with Open-Meteo for city centres; venue photos and capacities from Wikidata/Wikipedia/Wikimedia Commons. The app shows `image_credit` wherever an image appears.
