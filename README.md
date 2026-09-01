# DC Ortho Care — Clinic Books & Billing

The complete clinic management app for DC Ortho Care (Thrissur, Kerala): patient queue,
doctor/physiotherapist consultations, billing with GST and discounts, day register (Form 25),
expenses, stock & purchases, assets & depreciation, staff & salary, CA reports, rate card,
and settings/backup — now running as a multi-user, centrally-stored web app.

**Live:** https://dc-ortho-care-production.up.railway.app

---

## What it is

The entire user interface and workflow is the **original single-file HTML app** (the clinic's
own software, kept in `legacy/`), served byte-for-byte with only small, machine-applied
patches. Nothing was redesigned or reimplemented — the app you use is the app you had.

What was added *underneath* it:

| Layer | What it does |
|---|---|
| **PostgreSQL** (Railway) | The app's whole working state (patients, bills, stock, expenses…) is one JSON document stored centrally — every device sees the same books. |
| **NextAuth** | Server-side sign-in with per-user accounts (bcrypt-hashed passwords, roles: Admin / Doctor / Physio / Front desk). The app auto-signs-in the matching in-app account. |
| **Sync bridge** | Every save in the app is mirrored to the server (debounced, retried when offline, flushed on tab close via `sendBeacon`). On load, the server copy wins. Sidebar footer shows live sync status. |

### Additions built on top of the original app
- **Billing discounts in % or ₹** — toggle in the bill cart, discount reason still required, GST recomputed after discount.
- **Purchase entry creates new items inline** — pick "＋ New item — type the name below"; stock, cost and expense are posted together. Purchased items immediately appear in the prescription medicine list.
- **Stock guards** — the consultation screen shows live stock per medicine, refuses out-of-stock items, caps quantities to stock, and billing can never issue more than exists. No more negative stock from dispensing.
- **Pharmacy & stock P&L** — third tab in Stock & Purchases: purchases, sales, cost of sales, P&L, wastage and closing value by item and period (month / FY / all time).
- **Admin dashboard** (`/admin`, owner-only link in the sidebar) — total revenue, collected, pending dues, discounts, GST, cash share; per doctor / per physiotherapist; by day, week, month, FY or any custom range; payment modes, categories, top services.
- **Owner delete powers** — bills (✕ cancel, law-correct: marked CANCELLED, stock restored), stock movement entries (✕ in Movement), payments (✕ in Collect). Everything is logged in Staff Activity.
- **Server-side sign-out** — the sidebar "Sign out" ends the NextAuth session properly.

## Default sign-in

| Account | Password | Role |
|---|---|---|
| `DCORTHO` | `DC@1234` | Owner/administrator — full access |

**Change it** in *Users & Roles* after first login. Doctor, physiotherapist and front-desk
accounts are created by the owner (gate accounts here in *Users & Roles*; in-app logins in
*Doctors & Physios* / *Staff & Salary* — use the same username so sign-in maps automatically).

## Architecture

```
browser ──> /clinic          the original app (clinic-app.html, auth-gated)
        └─> /api/state       GET/PUT/POST the whole state document (JSON)
             │
             └─> PostgreSQL  AppState("clinic")  — single source of truth

/login    NextAuth credentials sign-in (same look as the original lock screen)
/admin    server-rendered analytics, computed from the live app document
/users    NextAuth account management (admin only)
```

- **Stack:** Next.js 15 (App Router) · NextAuth v5 (credentials + JWT) · Prisma · PostgreSQL · Railway.
- **State model:** the original app keeps everything in one in-memory `DB` object. The port
  syncs that document to the `AppState` table on every save (`save`/`saveNow`) and pulls it on
  boot. localStorage is kept as an offline cache; if the server can't be reached the app keeps
  working and syncs automatically when it can. Writes are **last-write-wins** — avoid two people
  editing at the exact same moment; the newest save replaces the older one.
- **Timezone:** all day/week/FY boundaries are computed in IST (`lib/format.ts`, `lib/period.ts`),
  independent of the server's timezone.

## The porting pipeline (important)

`legacy/DC_Ortho_Care_v4.1_original.html` is the source of truth for the UI.

```
legacy/DC_Ortho_Care_v4.1_original.html
        │  node scripts/port.js      (12+ assertion-checked string patches:
        ▼                             sync bridge, NextAuth auto-login, sign-out,
clinic-app.html                       % discount, purchase inline item, stock guards,
                                      P&L tab, owner deletes, credential-hint removal)
        └─> served at /clinic by app/clinic/route.ts (injects the signed-in username)
```

**Never edit `clinic-app.html` directly** — it is generated. To change the clinic app:
1. Edit `scripts/port.js` (each patch is a `rep(old, new, expectedCount)` that **fails the build**
   if the anchor doesn't match exactly once) or edit `legacy/` for genuine original-file fixes.
2. `node scripts/port.js`
3. Syntax-check the patched script:
   ```bash
   node -e "const fs=require('fs');const m=fs.readFileSync('clinic-app.html','utf8').match(/<script>([\s\S]*)<\/script>/);fs.writeFileSync('appscript_check.js',m[1]);" && node --check appscript_check.js && rm appscript_check.js
   ```

## Local development

```bash
npm install
# .env
# DATABASE_URL=postgresql://…   (local Postgres, or a tunnel to Railway, see below)
# AUTH_SECRET=<random 32+ chars>
# AUTH_TRUST_HOST=true

npx prisma db push        # create tables
npm run db:seed           # NextAuth gate accounts (DCORTHO, doctors, physio, front desk)
npm run build
npm start                 # http://localhost:3000
```

**Tunnel to the production database** (for read/write testing against Railway Postgres):

```bash
railway connect Postgres --tunnel-only -P 54329
# then DATABASE_URL=postgresql://…@127.0.0.1:54329/railway
```

⚠️ The local server then shares the **live clinic database**. Never experiment with real
data through it; test with obviously-fake names and clean up.

## Deployment (Railway)

```bash
railway up              # deploy from this directory
```

Services: **dc-ortho-care** (Next.js) and **Postgres**. Variables on the web service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference) |
| `AUTH_SECRET` | long random string |
| `AUTH_TRUST_HOST` | `true` |

Public domain: `dc-ortho-care-production.up.railway.app`. Schema changes: `npx prisma db push`
against the tunnelled `DATABASE_URL` (or from any machine that can reach the DB).

## Backups

Data now lives centrally, but keep the habit: **Settings → Download backup** every Friday and
drop the file into Google Drive. The download is the app's native JSON — it can be restored via
Settings → Restore.

## Repo layout

| Path | What |
|---|---|
| `legacy/DC_Ortho_Care_v4.1_original.html` | Original single-file app — UI source of truth |
| `scripts/port.js` | The patch pipeline that produces `clinic-app.html` |
| `clinic-app.html` | Generated — do not edit by hand |
| `app/clinic/route.ts` | Serves the app behind NextAuth, injects the signed-in username |
| `app/api/state/route.ts` | GET/PUT/POST the state document |
| `app/api/auth/…` | NextAuth handlers |
| `app/login/` | Sign-in page (same design language) |
| `app/(app)/admin/` | Admin revenue dashboard (reads the live document) |
| `app/(app)/users/` | NextAuth account management |
| `lib/` | auth, prisma, formatting & IST period helpers |
| `prisma/` | schema + seed |
