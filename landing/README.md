# teamrota.app landing page

Static site deployed as its own Cloudflare Worker (`teamrota-landing`) from this folder.
The app itself lives at **dashboard.teamrota.app** (Worker `rota-app`, repo root).

- `public/index.html`: the page (no build step)
- `public/config.js`: Supabase URL + publishable key for the early-access form
- `public/_redirects`: forwards old app links (`/admin`) to dashboard.teamrota.app
- Early-access sign-ups go to the `waitlist` table: run `../supabase/migrations/005_waitlist.sql` once.
  Read them in Supabase → Table Editor → waitlist.

Cloudflare: Workers & Pages → Create → Import repository → ROTA-App,
**Root directory** `landing`, **Build command** empty, **Deploy command** `npx wrangler deploy`,
then Settings → Domains & Routes → add `teamrota.app` (and `www.teamrota.app`).
