# Stubstash

Every show. Every song. Every mile. Stubstash is a PWA for logging the concerts you've been to. It pulls setlists from setlist.fm (read-only), lets you add shows that aren't listed, and turns your history into stats, a venue map, badges and share cards.

- **Frontend:** Vue 3 + TypeScript + Vite, Vue Router, Pinia, vite-plugin-pwa, Leaflet (CARTO dark tiles)
- **Backend:** Supabase (Postgres + RLS, Auth, Storage, Edge Functions, pg_cron). Everything is in [`supabase/`](supabase/README.md).
- **Design:** from Claude Design. Reference copies are in `design/`.

## Getting started

```sh
npm install
cp .env.example .env.local   # fill in the Supabase URL, publishable key and VAPID public key
npm run dev                  # http://localhost:5173
```

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server (service worker disabled in dev) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build (service worker on) |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `vue-tsc` only |
| `npm run db:types` | Regenerate Supabase types (needs `supabase login`) |

## Layout

```
src/
  design-system/        Tokens, base styles and Ss* components (the design system)
    styles/             tokens.css, base.css, utilities.css
    components/         SsButton, SsCard, SsStatCard, SsTicketRow, SsArt, SsSheet, ...
  lib/                  api.ts (all Supabase calls), types.ts, format.ts, color.ts,
                        media.ts (uploads), offline.ts (IndexedDB cache + outbox), pwa.ts
  stores/               auth, log (shows + stats), ui (toast, install, online)
  layouts/AppShell.vue  Sidebar on desktop, top bar + tab bar on phones
  views/                MarketingView, auth/*, app/* screens
  components/           Feature components (map, share cards, forms, people, ...)
  sw.ts                 Service worker: precache, offline navigation, image cache, web push
supabase/               Migrations, edge functions, config (see supabase/README.md)
design/                 Claude Design reference files
```

## Routes

| Path | Screen |
| --- | --- |
| `/` | Marketing page |
| `/login`, `/signup`, `/forgot` | Email + password auth |
| `/app/welcome` | Onboarding: import from setlist.fm, set home base |
| `/app` | Dashboard |
| `/app/shows`, `/app/shows/:id`, `/app/shows/:id/edit` | Show list, show detail, edit |
| `/app/log`, `/app/log/manual` | Search setlist.fm, add a show by hand |
| `/app/artists/:id`, `/app/venues/:id` | Artist and venue pages |
| `/app/map` | Venue map |
| `/app/me`, `/app/friends`, `/app/settings` | Profile, friends, settings |
| `/u/:handle` | Public profile (if public, or you're friends) |
| `/add/:handle`, `/invite/:token` | Friend link and "you were there" invites |

## Hosting

The build is a static SPA. Any static host works; configure it to serve `index.html` for unknown paths (SPA fallback), and add the deployed URL to Supabase Auth's Site URL and Redirect URLs (`/app/auth/callback`, `/app/reset-password`).

## Credits

Setlists from [setlist.fm](https://www.setlist.fm). Images from Wikimedia Commons, fanart.tv and TheAudioDB. Map data © OpenStreetMap contributors, tiles © CARTO. Stubstash isn't affiliated with setlist.fm.
