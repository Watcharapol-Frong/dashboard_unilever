# Claude Code — Project Guide
> Dashboard Unilever · Next.js 15 · CockroachDB · Clerk · Vercel

---

## Quick Reference

```bash
npm run dev          # start local dev server (http://localhost:3000)
npm run build        # production build (TypeScript check included)
npm run lint         # ESLint
npm run indexes      # create DB indexes (run once after schema changes)
```

**Active branch:** `claude/review-upload-mvp-U5yDI`  
Always develop on this branch. Never push directly to `main` without explicit permission.

---

## Dev Mode (bypass Clerk auth)

Add to `.env.local`:
```
DEV_MODE=true
```
This bypasses all Clerk auth and treats every request as admin.  
**Double-locked:** only activates when `DEV_MODE=true` AND `NODE_ENV=development` — zero effect on Vercel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Auth | Clerk (`@clerk/nextjs`) |
| Database | CockroachDB Serverless (raw SQL via `pg`) |
| Storage | Cloudflare R2 (S3-compatible) |
| State / Fetching | SWR |
| UI | shadcn/ui + Radix UI + Tailwind CSS |
| Charts | Recharts + Nivo + Visx |
| Tables | TanStack Table v8 |
| AI | Dify (via `/api/chat` proxy) |
| Deploy | Vercel (free plan — 10s function timeout) |

---

## Repository Structure

```
src/
  app/
    (auth)/           — login / register pages
    (dashboard)/      — all dashboard pages
      overview/
      sales/
        orders/       — orders sub-page
      telesales/
        call-log/     — call log sub-page
      leads/
      products/
      incentives/
      data-hub/       — admin: upload + build mart + recovery
      exports/        — admin: pivot export
    api/data/         — all API routes (see API section below)
  components/
    dashboard/        — shared: KpiCard, KpiGrid, FilterBar, FilterSelect, PageState, MonthChipGroup, ChatBot
    layout/           — TopBar, Sidebar
    ui/               — shadcn/ui primitives
  context/
    BuildContext.tsx  — mart build state (persist across navigation)
    LanguageContext.tsx
    DateRangeContext.tsx
  hooks/
    useDashboardSWR.ts  — typed SWR wrapper (5 min dedup, no revalidate on focus)
    useMonthRange.ts    — month chip range selector (default: last month)
  lib/
    auth.ts           — withAuth(), withAdmin(), requireAuth(), requireAdmin()
    db.ts             — query(), queryOne(), queryRowCount()
    metrics.ts        — ★ METRIC LAYER: CONV, NOT_CONV, REACHED, METRIC_DEFS
    query.ts          — SQL helpers: addDateRange, addFilter, toWhere, setCacheHeader, CACHE presets
    mart.ts           — mart build: buildMartMain(), buildMartPerformance(), refreshAllMarts()
    i18n.ts           — t(key, lang) translation helper
    formatters.ts     — fmt(), fmtBaht(), fmtPct(), formatTHB()
    r2.ts             — uploadToR2(), downloadFromR2()
    crypto.ts         — encrypt() / decrypt() (AES-256-GCM)
scripts/
  google-apps-script.js  — GAS script for incremental telesales sync
docs/
  business-logic.md  — ★ business rules, metric definitions, data flow
  overview-design.md — page design notes
  page-brief.md      — page content briefs
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
  overview/            GET  — mart_performance (month × CMG grain) + all-time calls
  overview/calls/      GET  — total_calls + connected  (?startDate, endDate, cmg)
  overview/agents/     GET  — agent leaderboard  (?startDate, endDate, cmg)
  cohorts/             GET  — cohort trend  (?interval, cmg, channel, startDate, endDate)
  sales/               GET  — HOC sales KPI + trend + recent orders  (?interval, startDate, endDate, ...)
  telesales/           GET  — funnel + tier breakdown + agent perf  (?startDate, endDate, agent, ...)
  telesales/funnel/    GET  — engaged vs not_engaged funnel
  leads/               GET  — paginated lead list  (?page, search, tier, contact, conv, cmg, agent)
  leads/summary/       GET  — KPI + filter options (admin only, fast, no pagination)
  products/            GET  — by_product, by_brand, by_buyer, brand_trend  (?brands, ...)
  products/options/    GET  — filter options for products page  [LONG cache]
  incentives/          GET  — ROI + cost + incentive breakdown
  pivot/               GET  — filter options (months, CMGs)  [LONG cache]
  pivot/               POST — raw data export (admin only)
  dashboard/           GET  — upload history + table stats (admin only)
  mart-status/         GET  — mart row counts
  mart-freshness/      GET  — last refreshed_at timestamp
  build-status/        GET  — build lock state
  refresh-mart/        POST — full mart rebuild  (admin only)
  refresh-mart/chunk/  POST — legacy chunked rebuild
  refresh-mart/finalize/ POST — legacy finalize
  upload/multipart/init/     POST — start R2 multipart upload
  upload/multipart/complete/ POST — finish upload → process CSV
  upload/multipart/abort/    POST — abort upload
  upload/replay/       POST — re-process R2 backups into DB
  ingest/telesales-activity/ POST — GAS: upsert telesales_calls (Bearer token)
  ingest/threshold/    GET  — GAS: get MAX(first_connected_date) from telesales_calls
```

**Cache presets** (from `src/lib/query.ts`):

| Preset | CDN TTL | Stale | Use for |
|---|---|---|---|
| SHORT | 1 min | 2 min | mart status, leads list |
| MEDIUM | 5 min | 10 min | most data routes (default) |
| FUNNEL | 10 min | 20 min | expensive aggregations |
| LONG | 1 hr | 2 hr | static options (products, pivot) |
| NONE | — | — | real-time status endpoints |

---

## Metric Layer

**All shared SQL fragments live in `src/lib/metrics.ts`. Never hardcode them in routes.**

```typescript
import { CONV, NOT_CONV, REACHED, reachedCond, METRIC_DEFS } from '@/lib/metrics'

// Usage examples
`FILTER (WHERE ${CONV})`              // converted orders
`FILTER (WHERE ${NOT_CONV})`          // not-converted orders
`FILTER (WHERE ${REACHED})`           // reached calls (bare column)
`FILTER (WHERE ${reachedCond('tc')})`  // reached calls (tc.call_status prefix)
```

See `docs/business-logic.md` for full metric definitions with business context.

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
import { useLanguage }       from '@/context/LanguageContext'
import { t }                 from '@/lib/i18n'

export default function MyPageClient() {
  const { lang } = useLanguage()
  const { data, isLoading, error } = useDashboardSWR<MyType>('/api/data/my-endpoint')

  if (isLoading && !data) return <PageLoading cols={4} />
  if (error)              return <PageError />
  if (!data)              return <PageEmpty message="..." hint={t('common.buildFirst', lang)} />

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

```
POST /api/data/refresh-mart
  → buildLock.acquire()
  → buildMartMain(attributionDays)
      ├─ DROP + CREATE mart_telesales_orders
      ├─ INSERT: telesales_calls JOIN online_sales/offline_sales JOIN products
      ├─ DROP + CREATE sales_hoc_orders
      └─ INSERT: mart_telesales_orders WHERE is_hoc_unilever = TRUE + attribution logic
  → buildMartPerformance(attributionDays)
      ├─ DROP + CREATE mart_performance_cmg
      ├─ INSERT: aggregated month × CMG metrics
      ├─ DROP + CREATE mart_performance_month
      └─ INSERT: month-level cost/ROI metrics
  → buildLock.release()
  → SWR revalidates all /api/data/* endpoints
```

**Vercel free plan constraint:** 10s function timeout. Build must complete within that window.  
**After build:** mart tables exist and are populated. All dashboard pages query these tables.

---

## Google Apps Script (GAS) Sync

Script: `scripts/google-apps-script.js`

```
exportIncrementalToStorage()
  → GET /api/data/ingest/threshold   (get MAX first_connected_date)
  → Filter sheet rows: first_connected_date > (threshold - 3 days)
  → POST /api/data/ingest/telesales-activity  { records: [...] }
  → Records upserted into telesales_calls (ON CONFLICT mmid DO UPDATE)
```

**Script Properties required in GAS:**
- `DASHBOARD_URL` — Vercel app URL
- `INGEST_SECRET` — matches `INGEST_API_SECRET` env var
- `VERCEL_BYPASS_SECRET` — from Vercel Dashboard → Settings → Deployment Protection
- `FALLBACK_DATE` — (optional) YYYY-MM-DD used when API unreachable

**Debug functions:** `testConnection()`, `debugLeadSheets()`

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DEV_MODE` | Bypass Clerk auth (dev only) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key |
| `CLERK_SECRET_KEY` | Clerk server key |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook verification |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/overview` |
| `INVITE_CODE_VIEWER` | Viewer registration invite code |
| `INVITE_CODE_ADMIN` | Admin registration invite code |
| `INGEST_API_SECRET` | GAS → API shared secret |
| `STORAGE_ENCRYPTION_KEY` | AES-256 key (64-char hex) for R2 files |
| `DATABASE_URL` | CockroachDB connection string |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `DIFY_API_KEY` | Dify AI API key |
| `NEXT_PUBLIC_DIFY_API_URL` | Dify API base URL |

---

## Known Constraints

- **Vercel free plan:** 10s function timeout → mart build must be fast enough
- **CockroachDB:** No `STRING_AGG(DISTINCT ..., ORDER BY ...)` — use subquery workaround
- **CockroachDB:** `TRUNCATE` may block → use `DELETE FROM ... WHERE true` instead
- **CockroachDB:** `ALTER COLUMN TYPE` in transaction not supported → add/copy/drop/rename
- **Recharts SSR:** Must use `dynamic(() => import(...), { ssr: false })` for chart components
- **telesales_calls PK:** `mmid` — one row per customer, GAS upserts on conflict
