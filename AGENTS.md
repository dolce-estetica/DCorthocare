# AGENTS.md — guidance for coding agents working on this repo

Read this before changing anything. This is production software running a real clinic
(https://dc-ortho-care-production.up.railway.app) with real money entries in the database.

## The one rule that matters most

**The UI is a verbatim port of the clinic's own single-file HTML app. Do not redesign,
re-implement, or "improve" it.** The user has explicitly asked for the original appearance,
colour palette, icons and behaviour to be preserved exactly.

- `legacy/DC_Ortho_Care_v4.1_original.html` — the original app. Source of truth for the UI.
- `scripts/port.js` — the ONLY supported way to modify the app. It applies string patches
  (`rep(old, new, expectedCount)`) to the legacy file and writes `clinic-app.html`.
- `clinic-app.html` — **generated output. Never edit by hand.**

### Workflow for any UI change
1. Add/modify a `rep()` in `scripts/port.js`. Every patch asserts an occurrence count —
   if the anchor isn't found exactly `expectedCount` times the script exits non-zero.
   That's intentional: a silent no-op patch is a shipped bug.
2. Run `node scripts/port.js`.
3. Syntax-check the patched inline script:
   ```bash
   node -e "const fs=require('fs');const m=fs.readFileSync('clinic-app.html','utf8').match(/<script>([\s\S]*)<\/script>/);fs.writeFileSync('appscript_check.js',m[1]);" && node --check appscript_check.js && rm appscript_check.js
   ```
4. `npm run build`, restart the server (`app/clinic/route.ts` caches the file per process —
   a regenerating `clinic-app.html` is NOT picked up by a running server), then test in a browser.

Patches already in place (don't duplicate them): Postgres sync bridge (`cloudPush`/`pullCloud`,
debounced 900 ms, retry every 5 s while offline, `sendBeacon` flush on unload/hidden, sync-status
in the sidebar footer), NextAuth auto-login (`window.__NA_USER__` injected per request by
`app/clinic/route.ts`), server-side sign-out, ₹/% discount toggle in the cart, inline new-item
creation in Purchase entry, stock guards in the prescription flow, Pharmacy & stock P&L tab,
owner-only delete for stock movements and payments, removal of the default-credential hints.

## Architecture

- Next.js 15 App Router + NextAuth v5 (credentials, JWT sessions, bcrypt) + Prisma + PostgreSQL.
- The clinic app keeps its **entire state as one JSON document** in `AppState(id="clinic")`.
  `app/api/state/route.ts` exposes GET/PUT/POST (POST exists because `navigator.sendBeacon`
  can only POST). No normalized tables are used for clinic data — the legacy Bill/Patient
  models in `prisma/schema.prisma` are unused leftovers; `User` (NextAuth gate accounts) and
  `AppState` are the live ones.
- `app/(app)/admin/page.tsx` computes analytics **from the state document** — one source of truth.
- All date/week/FY math is IST-anchored (`lib/format.ts`, `lib/period.ts`). The Railway server
  runs UTC; never use `new Date().getDay()`-style local logic for clinic-day boundaries.
- Boot flow: `boot()` → `load()` (localStorage cache) → `pullCloud()` (server doc wins,
  re-render if already signed in) → NextAuth user auto-maps to an in-app account by username
  (`allUsers()`), else falls back to the original lock screen.

## Environment & commands

```bash
npm install            # postinstall runs prisma generate
npx prisma db push     # schema changes
npm run db:seed        # seeds NextAuth gate users only (DCORTHO/DC@1234 admin, etc.)
npm run build && npm start
railway connect Postgres --tunnel-only -P 54329   # tunnel prod DB for local runs
railway up --detach    # deploy
```

`.env` needs `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`.

## Things that have bitten us before — do not re-learn them

1. **The local dev server shares the production database** (through the SSH tunnel). Browser
   tests through it write to the clinic's real books. Use obviously-fake names, clean up after
   (read-modify-write via Prisma, immediately), and prefer read-only verification on live.
2. **Last-write-wins sync:** any `save()` pushes the whole document. Two open editors = the
   later save silently replaces the earlier. Never leave a test browser sitting on the app
   while working on the DB.
3. **Port cache:** regenerating `clinic-app.html` requires a server restart to be served.
4. **sendBeacon is POST**, not PUT — keep the POST export on `/api/state`.
5. **User reports are the spec.** When the owner asks for a change, keep the diff surgical and
   list in the summary exactly what changed and what deliberately didn't ("don't change
   anything else" means it).
6. After every deploy, verify on the live URL (sign-in, the changed flow, console errors) —
   and re-verify anything that touches money (bill totals, GST, discount, P&L) with real numbers.

## Testing checklist (minimum before deploy)

- Build passes; patched inline script passes `node --check`.
- Sign-in → lands on `/clinic` with all sidebar modules and owner auto-login.
- Save something small → sidebar footer shows "Saved to server · HH:MM" → GET `/api/state`
  confirms the change reached Postgres → reload → change survived.
- Billing math: subtotal, ₹/% discount (GST recomputes on the discounted amount), payable.
- If stock/P&L/prescription changed: full flow — purchase (incl. inline new item), prescribe
  with stock caps, bill, check the P&L tab numbers.
- Sign-out ends the session (visit `/clinic` afterwards → bounces to `/login`).
