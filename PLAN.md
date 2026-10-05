# COPAK Crew — Build Plan

## Goal
A mobile-first web app that runs in a phone browser. The admin assigns ~30 volunteers to role slots across 5 sessions (Rig, S1–S4). Volunteers see their own schedule and check in.

## Architecture
- **Front end:** Vite + React + Tailwind v3 + react-router. One single-page app with two areas: `/` for crew and `/admin` for the admin. Deployed on Cloudflare Workers (static assets, SPA mode) via `wrangler.jsonc`.
- **Back end:** Supabase Postgres, with RLS turned on for every table.
  - **Admin:** Supabase email/password auth. Who counts as admin is decided by the `admins` table (user_id), checked by `is_admin()`.
  - **Crew:** no Supabase auth. Crew talk to the database only through `SECURITY DEFINER` RPC functions that check the volunteer's PIN on every call:
    - `crew_list()` returns only id and name, so phone numbers and PIN hashes never reach the client
    - `crew_set_pin(vid, pin)` sets a PIN, but only if none is set yet
    - `crew_schedule(vid, pin)` returns only that volunteer's assignments
    - `crew_check_in(vid, pin, session_id)` writes only that volunteer's check-in
  - The anon role gets **no** direct table access. PINs are hashed with pgcrypto bcrypt.
  - Honest framing: the name + PIN is identification, not real security. Someone could guess a 4-digit PIN. A simple lockout (5 failed attempts → 15-minute lock) makes guessing harder.

## Data model
`pods`, `roles(sort_order)`, `volunteers(pin_hash, failed_pins, locked_until)`, `sessions(starts_at, ends_at, crew_call_at as timestamptz + display text)`, `assignments(unique session_id+role_id)`, `check_ins(unique session_id+volunteer_id)`, `admins`.
The spec lists Live Production's sub-groups (Broadcast, Record & Media, After Show). These are stored as `roles.section`, so the spec's structure is kept without nesting pods.

## Screens
Crew: Name picker → PIN (set/enter) → Home (current/next session card + big "I'm here" button, then the full schedule list).
Admin: Login → tabs: **Board** (per-session check-in board: green present / grey missing, with counts), **Assign** (per-session slot list grouped by pod, volunteer dropdown, position/callsign fields, "Copy to session…"), **Volunteers** (CRUD), **Pods** (CRUD pods/roles, lead/deputy).

## Build order
1. Write the SQL: schema, RLS, RPCs, seed data
2. Scaffold Vite/Tailwind, Supabase client
3. Crew flow
4. Admin pages
5. README, run `npm run build` to check it compiles, push to a new repo
