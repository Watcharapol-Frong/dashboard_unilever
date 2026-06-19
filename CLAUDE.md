# Claude Code — Project Guide
> Dashboard Unilever · Next.js 15 · CockroachDB · Clerk · Vercel + GitHub Actions

---

## Quick Reference

```bash
npm run dev          # local dev server (http://localhost:3000)
npm run build        # production build (TypeScript check included)
npm run lint         # ESLint
npm run indexes      # source-table indexes + file_hash column (run once after setup)
npm run build-mart   # run mart build locally (no Vercel, no timeout)
                     # requires DATABASE_URL in env
```

**Active branch:** `main`  
Always develop on this branch. Never push directly to `main` without explicit permission.

---

## Dev Mode (bypass Clerk auth)

Add to `.env.local`:
```
DEV_MODE=true
NEXT_PUBLIC_DEV_MODE=true
```
Bypasses all Clerk auth, treats every request as admin. `ClerkProvider` is skipped when no publishable key is set.  
**Double-locked:** only activates when `DEV_MODE=true` AND `NODE_ENV=development` — zero effect on Vercel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Auth | Clerk (`@clerk/nextjs` v6) |
| Database | CockroachDB Serverless (raw SQL via `pg`) |
| Storage | Cloudflare R2 (S3-compatible, AES-256-GCM encrypted) |
| State / Fetching | SWR (5-min dedup, no revalidate-on-focus) |
| UI | shadcn/ui + Radix UI + Tailwind CSS |
| Charts | Recharts (SSR-disabled via dynamic import) |
| Tables | TanStack Table v8 |
| AI | Dify (via `/api/chat` proxy) |
| Deploy | Vercel free plan (UI + API) + GitHub Actions free (nightly mart build) |

---

## Repository Structure

```
src/
  app/
    (auth)/           — login / register pages
    (dashboard)/      — all dashboard pages
      dashboard/          — Main KPI overview
        sales/            — Order Sales
        telesales/        — Telesales performance
          call-log/       — (exists, not in nav — do NOT delete)
      leads/              — Lead list (admin only)
      raw-data/           — Raw table viewer (admin only)
      data-hub/           — Admin: upload + build mart + recovery
    api/
      auth/register/    — invite-code-gated registration (public)
      chat/             — Dify AI streaming proxy
      data/             — all data API routes (see API Routes section)
      webhooks/clerk/   — Clerk webhook handler (svix verified)
    maintenance/      — shown when MAINTENANCE_MODE=true
  components/
    dashboard/        — KpiCard, KpiGrid, FilterBar, FilterSelect, PageState,
                        MonthChipGroup, FreshnessBar, ChatBot, RadialGauge,
                        SalesTrendChart, TelesalesTrendMiniChart, TargetGaugeBar
    layout/           — TopBar, Prefetcher
    nav-user.tsx      — Sidebar user section (Clerk or dev-mode placeholder)
    app-sidebar.tsx   — Sidebar with Dashboard / Data / Help / NavUser sections
    ui/               — shadcn/ui primitives
  context/
    BuildContext.tsx      — mart build state (persist across navigation); after triggering
                           a GitHub Actions build, polls /api/data/hub/freshness every 20s;
                           bumps buildVersion (localStorage-persisted) and invalidates all
                           SWR keys when build completes; exposes done field on BuildResult
    LanguageContext.tsx   — EN/TH language toggle
    UploadQueueContext.tsx — upload queue state
  hooks/
    useDashboardSWR.ts   — typed SWR wrapper (5-min dedup, no revalidate on focus);
                           appends ?_v={buildVersion} to fetch URLs when buildVersion > 0
                           to bust both SWR client cache and Vercel CDN cache after a build
    useMonthRange.ts     — month chip range selector (default: last month)
    useLocalState.ts     — drop-in useState with localStorage persistence (SSR-safe)
  lib/
    auth.ts              — withAuth(), withAdmin(), requireAuth(), requireAdmin()
                           DEV_MODE bypass when DEV_MODE=true + NODE_ENV=development
    db.ts                — query(), queryOne(), queryRowCount()
    metrics.ts           — METRIC LAYER: CONV, NOT_CONV, REACHED, reachedCond()
    query.ts             — setCacheHeader(), CACHE presets, SQL filter helpers
    mart.ts              — buildMartMain(), buildMartPerformance(), refreshAllMarts(),
                           ensureSchemaExtensions()
    upload-service.ts    — ETL + SHA-256 hash dedup + R2 + DB upsert
    upload-config.ts     — FILE_TYPE_CONFIGS, validateHeaders()
    build-lock.ts        — in-memory build guard (prevents concurrent builds)
    formatters.ts        — fmt(), fmtBaht(), fmtPct(), formatPct()
    r2.ts                — uploadToR2(), downloadFromR2()
    crypto.ts            — encrypt() / decrypt() (AES-256-GCM)
    i18n.ts              — t(key, lang) translation helper
scripts/
  build-mart.ts          — standalone mart build (no Next.js, no timeout)
  create-indexes.ts      — source-table indexes (run once: npm run indexes)
  google-apps-script.js  — GAS script for incremental telesales sync
docs/
  business-logic.md      — business rules, metric definitions, data flow
  page-brief.md          — page content and audience briefs
  ux-personas.md         — user personas, display priorities, UX rules
  overview-design.md     — overview page design notes
.github/
  workflows/
    nightly-build.yml    — GitHub Actions cron: 02:00 AM ICT mart rebuild
```

---

## Auth Rules

```
Middleware (src/middleware.ts)  — clerkMiddleware
  Protected (login required): /dashboard(.*), /leads(.*),
                               /raw-data(.*), /data-hub(.*),
                               /api/data(.*)
  Public: /login, /register, /api/auth/register,
          /api/data/ingest/*, /api/webhooks/*, /api/dev-access

Route handler level:
  withAuth(handler)   — any authenticated user
  withAdmin(handler)  — role === 'admin' only (checks publicMetadata.role)

Admin-only: /leads, /data-hub, /raw-data,
  /api/data/hub/*, /api/data/pivot (POST), /api/data/raw/*,
  /api/data/leads/*, /api/data/template/*
```

Use `withAuth(handler)` for viewer+ routes, `withAdmin(handler)` for admin-only routes.  
GAS routes use `INGEST_API_SECRET` Bearer token checked separately (excluded from Clerk middleware matcher).

Registration: 2-step custom form — invite code validates role → `clerkClient.users.createUser` with `publicMetadata.role`.

---

## API Routes

```
/api/
  auth/register/             POST — invite-code-gated registration (public)
  chat/                      POST — Dify AI streaming proxy (auth required)
  webhooks/clerk/            POST — Clerk webhook (svix verified, public)

/api/data/
  dashboard/                 GET  — source table stats + upload history (admin)
  dashboard/agents           GET  — agent leaderboard (?startDate, endDate, cmg)
  dashboard/sales            GET  — sales KPI + trend + product analysis (?startDate, endDate, cmg)
  dashboard/sales-trend      GET  — monthly/weekly sales trend (?view, cmg, start, end)
  dashboard/summary          GET  — top-level KPI summary
  dashboard/telesales        GET  — funnel + tier breakdown + agent perf (?startDate, endDate, cmg, agent)
  dashboard/telesales-trend  GET  — monthly/weekly telesales trend (?view, start, end)
  hub/                       GET  — upload history + table stats (admin)
  hub/build                  POST — trigger mart rebuild (admin)
  hub/freshness              GET  — last refreshed_at + last build status
  hub/upload/multipart/
    init/                    POST — start R2 multipart upload (admin)
    complete/                POST — finish upload → ETL + hash dedup (admin)
    abort/                   POST — abort upload (admin)
    replay/                  POST — re-process R2 backups into DB (admin)
  ingest/
    telesales-activity/      POST — GAS: upsert telesales_calls (Bearer token)
    threshold/               GET  — GAS: get MAX(first_connected_date)
  leads/                     GET  — paginated lead list (?page, search, tier, contact, conv, cmg, agent)
  leads/summary/             GET  — KPI + filter options (admin)
  pivot/                     GET  — filter options (admin)
  pivot/                     POST — raw data export (admin)
  raw/                       GET  — raw table viewer (?table, page)
  raw/export/                GET  — export raw table as CSV
  template/[file]/           GET  — download upload templates (admin)
```

**Cache presets** (`src/lib/query.ts`):

| Preset | CDN TTL | Stale | Use for |
|---|---|---|---|
| SHORT | 1 min | 2 min | mart-status, leads list |
| MEDIUM | 5 min | 10 min | most data routes (default) |
| FUNNEL | 10 min | 20 min | expensive aggregations |
| LONG | 1 hr | 2 hr | static options |
| NONE | — | — | real-time status endpoints |

---

## Metric Layer

**All shared SQL fragments live in `src/lib/metrics.ts`. Never hardcode them in routes.**

```typescript
import { CONV, NOT_CONV, REACHED, reachedCond } from '@/lib/metrics'

`FILTER (WHERE ${CONV})`               // converted: new_customer + retention
`FILTER (WHERE ${NOT_CONV})`           // not converted
`FILTER (WHERE ${REACHED})`            // reached calls (bare column, no alias)
`FILTER (WHERE ${reachedCond('tc')})`  // reached calls with table alias tc
```

`REACHED` is a 4-condition definition (excludes: ไม่รับสาย, ปิดเครื่อง, ไม่สะดวกคุย, ยังไม่ต้องการสินค้า).  
See `docs/business-logic.md` for full definitions.

---

## New Page Pattern

```tsx
'use client'
import { useDashboardSWR }  from '@/hooks/useDashboardSWR'
import { KpiCard }          from '@/components/dashboard/KpiCard'
import { KpiGrid }          from '@/components/dashboard/KpiGrid'
import { FilterBar }        from '@/components/dashboard/FilterBar'
import { FilterSelect }     from '@/components/dashboard/FilterSelect'
import { PageLoading, PageEmpty, PageError } from '@/components/dashboard/PageState'
import { fmtBaht, fmt, fmtPct } from '@/lib/formatters'

export default function MyPageClient() {
  const { data, isLoading, error } = useDashboardSWR<MyType>('/api/data/my-endpoint')

  if (isLoading && !data) return <PageLoading cols={4} />
  if (error)              return <PageError />
  if (!data)              return <PageEmpty message="No data" hint="Run Build Mart first" />

  return (
    <>
      <KpiGrid cols={4}><KpiCard ... /></KpiGrid>
      <FilterBar hasFilter={hasFilter} onClear={clearAll}>
        <FilterSelect ... />
      </FilterBar>
    </>
  )
}
```

---

## Mart Build Flow

### Automatic (GitHub Actions — no timeout)
```
.github/workflows/nightly-build.yml
  → cron: 02:00 AM ICT (19:00 UTC) every day
  → scripts/build-mart.ts → refreshAllMarts(attributionDays)
```

### Manual
```
POST /api/data/hub/build   (Vercel, 10s timeout applies)
npm run build-mart          (local, no timeout)
```

### Build sequence
```
refreshAllMarts(attributionDays)
  → ensureSchemaExtensions()
  → buildMartMain()
      DROP + CREATE mmid_cmg_map      (mmid → primary_cmg + first_connected_date)
      DROP + CREATE sales_hoc_orders  (HOC-attributed row fact, customer_type)
      CREATE INDEX ×7 in parallel
  → buildMartPerformance()
      DROP + CREATE mart_performance_cmg    (month × CMG aggregates)
      DROP + CREATE mart_performance_month  (month costs + ROI)
      CREATE INDEX ×3 in parallel
  → INSERT INTO mart_builds (status, duration_ms, row_counts)
```

`mart_telesales_orders` no longer exists — replaced by `mmid_cmg_map` + `sales_hoc_orders`.

---

## File Upload & Dedup

```
Upload → SHA-256 hash → check upload_batches.file_hash
       → duplicate → 422 reject
       → else → R2 (AES-256-GCM) → ETL → upsert → store hash
```

---

## Stale Data Warning

`FreshnessBar` polls `/api/data/hub/freshness` every 5 min. Amber banner if `last_refreshed` > 24 h.

---

## Google Apps Script (GAS) Sync

```
exportIncrementalToStorage()
  → GET /api/data/ingest/threshold
  → POST /api/data/ingest/telesales-activity { records: [...] }
  → upserted into telesales_calls (ON CONFLICT mmid DO UPDATE)
```

---

## GitHub Actions Setup

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `DATABASE_URL` | CockroachDB connection string |
| `GH_WORKFLOW_TOKEN` | GitHub PAT (classic, `workflow` scope) — triggers nightly-build.yml from Data Hub UI |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DEV_MODE` | Bypass Clerk auth server-side (dev only, double-locked) |
| `NEXT_PUBLIC_DEV_MODE` | Bypass Clerk auth client-side (skips ClerkProvider, shows dev NavUser) |
| `MAINTENANCE_MODE` | Redirect all to /maintenance |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key |
| `CLERK_SECRET_KEY` | Clerk server key |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook verification (svix) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` |
| `INVITE_CODE_VIEWER` | Viewer registration invite code |
| `INVITE_CODE_ADMIN` | Admin registration invite code |
| `INGEST_API_SECRET` | GAS → API shared secret (32+ chars) |
| `STORAGE_ENCRYPTION_KEY` | AES-256 key (64-char hex) for R2 files |
| `DATABASE_URL` | CockroachDB connection string |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `DIFY_API_KEY` | Dify AI API key (server-side) |
| `NEXT_PUBLIC_DIFY_API_URL` | Dify API base URL |
| `NEXT_PUBLIC_DIFY_TOKEN` | Dify public token (client-side streaming) |
| `ATTRIBUTION_DAYS` | Attribution window in days (default: 14, GitHub Actions only) |
| `GH_WORKFLOW_TOKEN` | GitHub PAT (classic, `workflow` scope) — triggers nightly-build.yml from Data Hub UI |

---

## Known Constraints

- **Vercel free plan:** 10s function timeout → manual mart build via `npm run build-mart` for long runs.
- **CockroachDB:** No `STRING_AGG(DISTINCT ..., ORDER BY ...)` — use subquery workaround.
- **CockroachDB:** `TRUNCATE` may block → use `DELETE FROM ... WHERE true`.
- **CockroachDB:** `ALTER COLUMN TYPE` in transaction not supported → add/copy/drop/rename pattern.
- **Recharts SSR:** Must use `dynamic(() => import(...), { ssr: false })` for all chart components.
- **telesales_calls PK:** `mmid` — one row per customer, GAS upserts on conflict.
- **ClerkProvider:** Conditionally included in root layout — omitted when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is not set.
- **GAS ingest:** Vercel 413 limit ~4.5 MB — `postToAPI_` sends records in batches of 1,000 per HTTP request.
- **R2 CORS:** Must configure CORS policy on R2 bucket to allow PUT from the production domain (AllowedMethods: GET, PUT, HEAD, DELETE; ExposeHeaders: ETag).
