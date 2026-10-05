# COPAK Crew

A mobile-first app for the COPAK 2026 media team (23–25 Oct). Volunteers open a link, pick their name, and see their schedule. They tap **I'm here** to check in. The admin assigns people to role slots and watches a live check-in board.

- **Crew:** `https://copak-crew.<your-subdomain>.workers.dev/`
- **Admin:** `https://copak-crew.<your-subdomain>.workers.dev/admin`

Stack: React (Vite) + Tailwind, Supabase (Postgres + Auth), Cloudflare. See [PLAN.md](PLAN.md) for the build plan.

## 1. Supabase setup
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in all of [`supabase/schema.sql`](supabase/schema.sql) and run it. This creates the tables, the RLS rules, the crew functions, the `photos` storage bucket, and realtime updates for check-ins.
3. **Seed the data:** paste in [`supabase/seed.sql`](supabase/seed.sql) and run it. This adds the 5 sessions, the 4 pods with their 25 roles, and an empty ("Unassigned") slot for every role in every session.
   - Times are stored as **Europe/London**. If the venue is in another time zone, find-and-replace `Europe/London` (for example with `Africa/Lagos`) before you run the seed. The zone is only used to work out which session is "now/next".

## 2. Create your admin login
1. Supabase → **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, and tick "Auto confirm".
2. Back in the SQL Editor, run:
   ```sql
   insert into admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
3. Turn off public sign-up: **Authentication → Sign In / Providers → Email** → disable "Allow new users to sign up". (Even if someone did sign up, they wouldn't be in `admins`, so they couldn't see or change anything.)

## 3. Environment variables
Find both values in Supabase → **Project Settings → API**.

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL, e.g. `https://abcd.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The **anon / public** key (never use the service-role key) |

For local work: `cp .env.example .env`, fill in both values, then run `npm install && npm run dev`.

## 4. Deploy to Cloudflare
1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → pick **ROTA-App**.
2. Build settings:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy` (the default)
3. **Settings → Variables and Secrets → Build variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. They must be *build* variables, because Vite bakes them in at build time. Then redeploy.
4. `wrangler.jsonc` serves the built `dist/` folder and sends unknown paths (like `/admin`) to the app.

Deploy from your own machine instead: `npm run build && npx wrangler deploy` (with a `.env` file holding the two variables).

## Using it
- **Crew tab:** add volunteers. **Pods tab:** set each pod's lead and deputy, and add or rename roles.
- **Assign tab:** pick a session, pick a person for each slot, and type in the room position and callsign (they save when you tap out of the field). Use **Copy these assignments to…** to copy a finished session to another one, then adjust.
- **Board tab:** live check-ins for each session. Green = here, grey = assigned but missing, dashed = unassigned slot.
- If a volunteer forgets their PIN: **Crew tab → ⋯ → Reset PIN**. They choose a new one the next time they open the app.

## How crew access works (honest version)
Crew don't have accounts. They pick their name and set a 4-digit PIN the first time they open the app. **This identifies people; it is not security.** It stops someone casually checking in a friend, and that's all.
- The anon key cannot read or write any table directly. Every table has RLS with admin-only policies.
- Crew go through 4 database functions (`crew_list`, `crew_set_pin`, `crew_schedule`, `crew_check_in`). Each checks the PIN on every call and returns or writes data for **that volunteer only**. `crew_list` returns names only, with no phone numbers.
- PINs are stored as bcrypt hashes. After 5 wrong tries, that name is locked for 15 minutes.
- The phone remembers the volunteer (name + PIN in local storage) so they don't need to log in again. "Not you?" clears it.
- A 4-digit PIN can still be guessed by someone determined. Don't put anything sensitive in the app.

## Preview without Supabase
`npm run dev:mock` runs the app against made-up sample data (`.mock/`). Screenshots are in [`screenshots/`](screenshots/).
