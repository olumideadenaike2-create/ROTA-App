# TeamRota (public, multi-church app)

Separate from the COPAK app at the repo root, which keeps running unchanged.
Uses its **own** Supabase project.

## Setup
1. New Supabase project (London region) → SQL Editor → run `supabase/001_foundation.sql`.
2. Authentication → URL Configuration: Site URL = where this app is hosted; add `<that URL>/**` to Redirect URLs.
3. Environment (Cloudflare build variables, or `app/.env` locally):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`)
4. Cloudflare: Workers & Pages → Create → Import ROTA-App, **Root directory `app`**,
   build `npm run build`, deploy `npx wrangler deploy` (Worker name `teamrota-app`).

`npm run dev:mock` runs the app with an in-memory stand-in for Supabase (example data, nothing saved).

## Phase 1 (this release)
- Church sign-up with department templates; 14-day trial
- Departments → units → roles editor; each level editable by whoever leads it
- People: add, import from a spreadsheet paste, put in units, filter
- Leaders: invite church admins, heads / assistant heads of department, unit heads / assistants;
  invites are claimed when that email signs up
- Every table is locked to its church by Row Level Security (see `supabase/001_foundation.sql`)

## Next
Phase 2: events, rota grid with drafts and Publish, accept/decline, availability, crew link + PIN, check-in.
Phase 3: texts (credits, top-ups), billing (Stripe), reports.
