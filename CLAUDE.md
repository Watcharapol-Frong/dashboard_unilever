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

**Active branch:** `claude/review-upload-mvp-U5yDI`  
Always develop on this branch. Never push directly to `main` without explicit permission.

---

## Dev Mode (bypass Clerk auth)

Add to `.env.local`:
```
DEV_MODE=true
```
Bypasses all Clerk auth, treats every request as admin.  
**Double-locked:** only activates when `DEV_MODE=true` AND `NODE_ENV=development` — zero effect on Vercel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Auth | Clerk (`@clerk/nextjs`) |
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
      overview/
      sales/
        orders/
      telesales/
        call-log/
      leads/
      products/
      incentives/
      data-hub/       — admin: upload + build mart + recovery
      exports/        — admin: pivot export
    api/data/         — all API routes (see API Routes section)
    maintenance/      — shown when MAINTENANCE_MODE=true
  components/
    dashboard/        — KpiCard, KpiGrid, FilterBar, FilterSelect, PageState,
                        MonthChipGroup, FreshnessBar, ChatBot, HelpSheet
    layout/           — TopBar, Sidebar
    ui/               — shadcn/ui primitives
  context/
    BuildContext.tsx      — mart build state (persist across navigation)
    LanguageContext.tsx
    DateRangeContext.tsx
  hooks/
    useDashboardSWR.ts   — typed SWR wrapper (5-min dedup, no revalidate on focus)
    useMonthRange.ts     — month chip range selector (default: last month)
  lib/
    auth.ts              — withAuth(), withAdmin(), requireAuth(), requireAdmin()
    db.ts                — query(), queryOne(), queryRowCount()
    metrics.ts           — ★ METRIC LAYER: CONV, NOT_CONV, REACHED, reachedCond()
    query.ts             — setCacheHeader(), CACHE presets, SQL filter helpers
    mart.ts              — buildMartMain(), buildMartPerformance(), refreshAllMarts(),
                           ensureSchemaExtensions()
    upload-service.ts    — ETL + SHA-256 hash dedup + R2 + DB upsert
    upload-config.ts     — FILE_TYPE_CONFIGS, validateHeaders()
    build-lock.ts        — in-memory build guard (prevents concurrent builds)
    formatters.ts        — fmt(), fmtBaht(), fmtPct()
    r2.ts                — uploadToR2(), downloadFromR2()
    crypto.ts            — encrypt() / decrypt() (AES-256-GCM)
    i18n.ts              — t(key, lang) translation helper
scripts/
  build-mart.ts          — standalone mart build (no Next.js, no timeout)
  create-indexes.ts      — source-table indexes (run once: npm run indexes)
  google-apps-script.js  — GAS script for incremental telesales sync
docs/
  business-logic.md      — ★ business rules, metric definitions, data flow
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
Middleware (src/middleware.ts)
  ├─ Protected (login required): /overview, /sales, /telesales, /products,
  │                               /leads, /incentives, /data-hub, /exports,
  │                               /api/data/*
  ├─ Admin only:  /leads, /data-hub, /exports,
  │               /api/data/upload/*, /api/data/dashboard*,
  │               /api/data/refresh-mart/*, /api/data/export/*, /api/data/template/*
  └─ No auth (GAS Bearer token): /api/data/ingest/*
```

Use `withAuth(handler)` for viewer+ routes, `withAdmin(handler)` for admin-only routes.  
GAS routes use `INGEST_API_SECRET` Bearer token checked via `timingSafeEqual`.

---

## API Routes

```
/api/data/
  overview/              GET  — mart_performance_cmg (month × CMG)
  overview/calls/        GET  — total_calls + connected (?startDate, endDate, cmg)
  overview/agents/       GET  — agent leaderboard (?startDate, endDate, cmg)
  cohorts/               GET  — cohort trend (?interval, cmg, channel, startDate, endDate)
  sales/                 GET  — HOC sales KPI + trend + recent orders
  telesales/             GET  — funnel + tier breakdown + agent perf
  telesales/funnel/      GET  — engaged vs not_engaged Sankey data
  leads/                 GET  — paginated lead list (?page, search, tier, contact, conv, cmg, agent)
  leads/summary/         GET  — KPI + filter options (admin only)
  products/              GET  — by_product, by_brand, by_buyer, brand_trend
  products/options/      GET  — filter options [LONG cache]
  incentives/            GET  — ROI + cost + incentive breakdown
  pivot/                 GET  — filter options (months, CMGs) [LONG cache]
  pivot/                 POST — raw data export (admin only)
  dashboard/             GET  — upload history + table stats (admin only)
  mart-status/           GET  — mart row counts + last 5 builds (admin only)
  mart-freshness/        GET  — last refreshed_at + last build status
  build-status/          GET  — build lock state
  refresh-mart/          POST — full mart rebuild (admin only, manual trigger)
  refresh-mart/chunk/    POST — legacy chunked rebuild
  refresh-mart/finalize/ POST — legacy finalize
  upload/multipart/init/     POST — start R2 multipart upload
  upload/multipart/complete/ POST — finish upload → ETL + hash dedup
  upload/multipart/abort/    POST — abort upload
  upload/replay/         POST — re-process R2 backups into DB
  ingest/telesales-activity/ POST — GAS: upsert telesales_calls (Bearer token)
  ingest/threshold/      GET  — GAS: get MAX(first_connected_date)
```

**Cache presets** (`src/lib/query.ts`):

| Preset | CDN TTL | Stale | Use for |
|---|---|---|---|
| SHORT | 1 min | 2 min | mart-status, leads list |
| MEDIUM | 5 min | 10 min | most data routes (default) |
| FUNNEL | 10 min | 20 min | expensive aggregations |
| LONG | 1 hr | 2 hr | static options (products, pivot) |
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
See `docs/business-logic.md` for full definitions with business context.

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
  → scripts/build-mart.ts
  → refreshAllMarts(attributionDays)
```

### Manual (Data Hub UI or CLI)
```
POST /api/data/refresh-mart   (Vercel, 10s timeout applies)
npm run build-mart            (local, no timeout)
```

### Build sequence
```
refreshAllMarts(attributionDays)
  → ensureSchemaExtensions()          (adds mart_builds, file_hash column if missing)
  → buildMartMain()
      DROP + CREATE mmid_cmg_map      (mmid → primary_cmg, 3 cols, PK lookup)
      DROP + CREATE sales_hoc_orders  (HOC-attributed row fact, 24 cols)
        JOIN: telesales_calls + online/offline_sales + products + mmid_cmg_map
        CASE WHEN → customer_type (new_customer / retention / *_not_converted)
      CREATE INDEX ×7 in parallel
  → buildMartPerformance()
      DROP + CREATE mart_performance_cmg    (month × CMG aggregates, 11 cols)
      DROP + CREATE mart_performance_month  (month costs + ROI, 9 cols)
      CREATE INDEX ×3 in parallel
  → INSERT INTO mart_builds (status, duration_ms, row_counts)
```

**Note:** `mart_telesales_orders` no longer exists. All routes that previously queried it now use `mmid_cmg_map` (for CMG lookup) or `sales_hoc_orders` (for order data).

---

## File Upload & Dedup

```
Upload → SHA-256 hash of CSV text
       → check upload_batches WHERE file_hash = $1
       → if duplicate → reject 422 "This file has already been uploaded"
       → else → upload to R2 (AES-256-GCM) → ETL → upsert → store hash
```

`file_hash` column added to `upload_batches` by `ensureSchemaExtensions()` or `npm run indexes`.

---

## Stale Data Warning

`FreshnessBar` in `(dashboard)/layout.tsx` polls `/api/data/mart-freshness` every 5 min.  
Shows amber banner if `last_refreshed` > 24 h or no mart data exists yet.

---

## Google Apps Script (GAS) Sync

Script: `scripts/google-apps-script.js`

```
exportIncrementalToStorage()
  → GET /api/data/ingest/threshold   (get MAX first_connected_date)
  → Filter sheet rows > threshold - 3 days
  → POST /api/data/ingest/telesales-activity  { records: [...] }
  → Upserted into telesales_calls (ON CONFLICT mmid DO UPDATE)
```

**GAS Script Properties:**
- `DASHBOARD_URL` — Vercel app URL
- `INGEST_SECRET` — matches `INGEST_API_SECRET` env var
- `VERCEL_BYPASS_SECRET` — from Vercel → Settings → Deployment Protection
- `FALLBACK_DATE` — (optional) YYYY-MM-DD fallback when API unreachable

**Debug functions:** `testConnection()`, `debugLeadSheets()`

---

## GitHub Actions Setup

Add one secret in: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `DATABASE_URL` | CockroachDB connection string |

Manual trigger: **Actions → Nightly Mart Build → Run workflow**  
Cost: ~60 min/month on private repo free plan (2,000 min/month included).

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DEV_MODE` | Bypass Clerk auth (dev only, double-locked) |
| `MAINTENANCE_MODE` | Redirect all to /maintenance (Vercel env var) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key |
| `CLERK_SECRET_KEY` | Clerk server key |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook verification |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/overview` |
| `INVITE_CODE_VIEWER` | Viewer registration invite code |
| `INVITE_CODE_ADMIN` | Admin registration invite code |
| `INGEST_API_SECRET` | GAS → API shared secret (32+ chars) |
| `STORAGE_ENCRYPTION_KEY` | AES-256 key (64-char hex) for R2 files |
| `DATABASE_URL` | CockroachDB connection string |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `DIFY_API_KEY` | Dify AI API key |
| `NEXT_PUBLIC_DIFY_API_URL` | Dify API base URL |
| `ATTRIBUTION_DAYS` | Attribution window in days (default: 14, GitHub Actions only) |

---

## Known Constraints

- **Vercel free plan:** 10s function timeout → manual Build Mart must finish within that window. Nightly automated build runs in GitHub Actions (no timeout).
- **CockroachDB:** No `STRING_AGG(DISTINCT ..., ORDER BY ...)` — use subquery workaround.
- **CockroachDB:** `TRUNCATE` may block when async index-drop job is running → use `DELETE FROM ... WHERE true`.
- **CockroachDB:** `ALTER COLUMN TYPE` in transaction not supported → add/copy/drop/rename pattern.
- **Recharts SSR:** Must use `dynamic(() => import(...), { ssr: false })` for chart components.
- **telesales_calls PK:** `mmid` — one row per customer, GAS upserts on conflict.
- **mart tables:** Rebuilt from scratch on every build (DROP + CREATE). Mart indexes are recreated automatically by `buildMartMain()` and `buildMartPerformance()` — no manual index migration needed.
