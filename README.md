# TeamRota

Rotas for every church department.

| Address | What | Code | Cloudflare Worker |
|---|---|---|---|
| https://teamrota.app | Landing page + early-access form | `landing/` | `teamrota-landing` |
| https://dashboard.teamrota.app | The app (church admins, heads, volunteers) | repo root | `rota-app` |

Both use one Supabase project. The old single-church COPAK app was retired on 29 Oct 2026.

## Database (Supabase SQL Editor)
- `supabase/000_remove_old_app.sql`: one-off, removes the old COPAK tables. **Permanent.**
- `supabase/001_foundation.sql`: churches, departments, units, roles, people, leaders, invites, events, with Row Level Security.
- `supabase/002_rota.sql`: rota slots (draft vs published), replies, availability, check-ins, volunteer-link functions.
- `supabase/003_swaps_messages.sql`: swap requests, message queue (filled on Publish), text credits.
- `supabase/functions/send-messages`: sends queued messages: Twilio text if credits, else Resend email. Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `RESEND_API_KEY`, `EMAIL_FROM`.
- `landing/supabase/waitlist.sql`: early-access sign-ups (already run).

Authentication → URL Configuration: Site URL `https://dashboard.teamrota.app`, Redirect URLs `https://dashboard.teamrota.app/**`.

## Environment
Cloudflare build variables (and `.env` locally): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`).

## Develop
`npm install`, then `npm run dev`, or `npm run dev:mock` to click through with an in-memory stand-in (example data, nothing saved).

## Status
- **Phase 1 (done):** church sign-up with department templates; departments → units → roles; people with spreadsheet import; leader invites (admin, head/assistant of department, unit head/assistant), claimed when that email signs up.
- **Phase 2 (done):** services (with weekly repeat), rota with drafts and Publish, volunteer link `dashboard.teamrota.app/c/<church>` with name + PIN, accept/decline, availability, check-in on the day only, live Today board with undo, PIN reset.
- **Phase 3a (done):** swaps (volunteer asks, unit head approves, goes out on next Publish); one message per person on Publish; texts with credits, email fallback, message log with retry.
- **Next:** Stripe billing (plans, text top-ups), invite emails, reports.
- **Phase 3:** texts with credits (Twilio), emails (Resend), Stripe billing and plan limits.
