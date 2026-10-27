# Stubstash backend (Supabase)

Everything needed to recreate the backend lives in this folder.

| Path | What it is |
| --- | --- |
| `migrations/` | Database schema, security rules, stats functions, storage buckets, cron jobs. Applied in filename order. |
| `functions/setlistfm` | setlist.fm gateway: search, log a show, import a user's history, refresh a setlist. Needs a signed-in user. |
| `functions/enrich` | Background job (every 2 min): artist images and genres, venue coordinates, photos and capacity. |
| `functions/push` | Web push: morning-after "rate the show" nudges (hourly) and a test send. |
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

## Background jobs (pg_cron)

| Job | Schedule | Does |
| --- | --- | --- |
| `enrich-catalog` | every 2 min | Calls `enrich` for up to 8 artists and 12 venues |
| `rating-nudges` | hourly at :15 | Calls `push` to nudge users at 10am local time the day after a show |
| `prune-api-cache` | daily 04:30 UTC | Deletes setlist.fm cache rows older than 2 days |

Check recent job calls with `select * from net._http_response order by created desc limit 10;`.

## Image and data credits

Setlists from setlist.fm. Artist images from fanart.tv, TheAudioDB and Wikimedia Commons. Venue locations from OpenStreetMap (Nominatim); venue photos and capacities from Wikidata/Wikimedia Commons. The app shows `image_credit` wherever an image appears.
