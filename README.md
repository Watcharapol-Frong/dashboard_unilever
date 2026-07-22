# Makro × Unilever HOC Telesales Dashboard

Operational analytics platform for the Unilever HOC telesales programme on Makro Pro. Centralises sales performance, lead conversion, call-centre KPIs, product revenue, and incentive payouts behind a role-based access layer.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Security](#security)
- [Data Pipeline](#data-pipeline)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [API Reference](#api-reference)
- [GitHub Actions](#github-actions)

---

## Features

| Page | Audience | Highlights |
|------|----------|------------|
| **Dashboard** | All users | Sales KPI · Telesales trend · Bubble map by Senior Buyer · Agent leaderboard |
| **Order Sales** | Sales Manager | HOC sales trend (monthly/weekly) · online/offline split · product revenue by brand |
| **Telesales** | Supervisor | Reach rate · conversion funnel · agent leaderboard · call-status breakdown by tier |
| **Leads** *(admin)* | Admin | Server-side filtered + paginated lead list · contact/conversion status badges |
| **Raw Data** *(admin)* | Admin | Browse + export any source table |
| **Data Hub** *(admin)* | Admin | CSV upload pipeline · ETL status · mart rebuild with attribution window selector |
| **AI Assistant** | All users | Context-aware chatbot powered by Dify |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Browser — Next.js 15 App Router · React · SWR · Recharts     │
└──────────────────────────┬─────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼─────────────────────────────────────┐
│  Vercel Serverless — /api/data/*                               │
│  Clerk middleware: auth + RBAC on every route                  │
│  withAuth() / withAdmin() per handler                          │
└───────────┬────────────────────────────┬───────────────────────┘
            │ node-postgres (TLS)        │ AWS SDK (S3-compatible)
┌───────────▼──────────────┐   ┌────────▼───────────────────────┐
│  CockroachDB Serverless  │   │  Cloudflare R2 (Object Store)  │
│  · Raw source tables     │   │  · AES-256-GCM encrypted files │
│  · Mart tables (indexed) │   │  · Multipart upload            │
└──────────────────────────┘   └────────────────────────────────┘

On-demand mart build (GitHub Actions — free tier, no nightly cron):
  "Build Mart" button, or auto-triggered after an upload → scripts/build-mart.ts → refreshAllMarts()
  → no Vercel timeout; writes directly to CockroachDB

Incremental GAS sync:
  Google Sheets → GAS → POST /api/data/ingest/telesales-activity
  Bearer-token auth; excluded from Clerk middleware matcher
```

---

## Security

### Role-Based Access Control

| Layer | Mechanism |
|-------|-----------|
| **Middleware** | `clerkMiddleware` — single `auth()` call; 401/403 JSON for API, redirect for browsers |
| **Route handler** | `withAuth()` / `withAdmin()` in `src/lib/auth.ts` — checks `publicMetadata.role === 'admin'` |

Admin-only surfaces: `/leads`, `/data-hub`, `/raw-data` and all `/api/data/hub/*`, `/api/data/pivot` (POST), `/api/data/raw/*`, `/api/data/leads/*`, `/api/data/template/*`.

**Dev Mode (local only):** `DEV_MODE=true` in `.env.local` bypasses all Clerk auth and treats every request as admin. Double-locked — only activates when `NODE_ENV=development`.

### Cryptographic Controls

| Control | Implementation |
|---------|----------------|
| File encryption at rest | AES-256-GCM via `STORAGE_ENCRYPTION_KEY` (64-char hex) before R2 upload |
| Invite-code comparison | `crypto.timingSafeEqual` — constant-time, prevents timing oracle |
| TLS / SSL | `rejectUnauthorized: true` in production (env-conditional in `src/lib/db.ts`) |
| GAS ingest auth | `INGEST_API_SECRET` Bearer token; routes excluded from Clerk middleware |
| File dedup | SHA-256 content hash stored in `upload_batches.file_hash`; duplicate uploads rejected with 422 |

---

## Data Pipeline

### Upload (browser → R2 → CockroachDB)

```
POST /api/data/hub/upload/multipart/init      → R2 creates multipart session
PUT  (direct to R2, chunked + parallel)       → file uploaded in parts
POST /api/data/hub/upload/multipart/complete  → R2 assembles → ETL:
    SHA-256 hash check (duplicate rejected with 422)
    CSV header validation
    Transform rows → UPSERT into source table
    Update table_summaries
```

### GAS Incremental Sync

```
GAS cron → GET /api/data/ingest/threshold   (latest first_connected_date)
         → POST /api/data/ingest/telesales-activity (new records, chunked 1,000/request)
         → upserted into telesales_calls ON CONFLICT mmid DO UPDATE
```

### Mart Build (on demand, no timeout)

No nightly cron — a build only runs when triggered: the "Build Mart" button in Data
Hub (admin only), or automatically right after a successful upload.

```
GitHub Actions (workflow_dispatch)
  → scripts/build-mart.ts → refreshAllMarts(attributionDays)
      → ensureSchemaExtensions()          (idempotent DDL migrations)
      → buildMartMain()
          DROP + CREATE mmid_cmg_map      (mmid → primary_cmg lookup, 3 cols)
          DROP + CREATE sales_hoc_orders  (HOC-attributed row fact, 24 cols)
          CREATE INDEX ×7 in parallel
      → buildMartTelesalesFunnel()
          DROP + CREATE mart_telesales_funnel  (contact/conversion status per mmid)
          CREATE INDEX ×4 in parallel
      → buildMartPerformance()
          DROP + CREATE mart_performance_cmg    (month × CMG aggregates)
          DROP + CREATE mart_performance_month  (month-level costs + ROI)
          CREATE INDEX ×3 in parallel
      → refreshTableSummaries()           (table_summaries for hub/freshness stats)
      → record build in mart_builds (status, duration_ms, row_counts)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Auth | Clerk (`@clerk/nextjs`) |
| Database | CockroachDB Serverless — raw SQL via `node-postgres` |
| File Storage | Cloudflare R2 (S3-compatible, AES-256-GCM encrypted) |
| State / Fetching | SWR — stale-while-revalidate, 5-min dedup |
| UI | shadcn/ui + Radix UI + Tailwind CSS |
| Charts | Recharts (SSR-disabled via dynamic import) |
| Tables | TanStack Table v8 |
| AI | Dify (streaming via `/api/chat` proxy) |
| Deployment | Vercel free plan + GitHub Actions (on-demand mart build) |

---

## Project Structure

```
src/
  app/
    (auth)/           — login / register pages
    (dashboard)/      — dashboard pages (layout: BuildProvider + FreshnessBar)
      dashboard/          — Main KPI overview
        sales/            — Order Sales
        telesales/        — Telesales performance
          call-log/       — (exists, not in nav)
      leads/              — Lead list (admin)
      raw-data/           — Raw table viewer (admin)
      data-hub/           — Upload + mart build (admin)
    api/data/         — REST data endpoints (see API Reference)
    maintenance/      — shown when MAINTENANCE_MODE=true
  components/
    dashboard/        — KpiCard, KpiGrid, FilterBar, FilterSelect, PageState,
                        MonthChipGroup, FreshnessBar, ChatBot, SalesTrendChart,
                        TelesalesTrendMiniChart, RadialGauge, TargetGaugeBar
    layout/           — TopBar, Sidebar
    ui/               — shadcn/ui primitives
  context/
    BuildContext.tsx      — mart build state (persists across navigation)
    LanguageContext.tsx
    UploadQueueContext.tsx
  hooks/
    useDashboardSWR.ts    — typed SWR hook (5-min dedup, no revalidate-on-focus)
    useMonthRange.ts      — month chip range selector (defaults to last month)
    useLocalState.ts      — localStorage-persisted useState drop-in (SSR-safe)
  lib/
    auth.ts               — withAuth(), withAdmin(), requireAuth(), requireAdmin()
    db.ts                 — query(), queryOne(), queryRowCount()
    mart.ts               — buildMartMain(), buildMartPerformance(), refreshAllMarts(),
                            ensureSchemaExtensions()
    metrics.ts            — CONV, NOT_CONV, REACHED, reachedCond() — shared SQL fragments
    query.ts              — setCacheHeader(), CACHE presets, SQL filter helpers
    upload-service.ts     — ETL + SHA-256 hash dedup + R2 + DB upsert
    upload-config.ts      — FILE_TYPE_CONFIGS, validateHeaders()
    build-lock.ts         — in-memory build guard (prevents concurrent builds)
    formatters.ts         — fmt(), fmtBaht(), fmtPct()
    r2.ts                 — uploadToR2(), downloadFromR2()
    crypto.ts             — encrypt() / decrypt() (AES-256-GCM)
    i18n.ts               — t(key, lang) translation helper
scripts/
  build-mart.ts           — standalone mart build (no Next.js, no timeout)
  create-indexes.ts       — source-table indexes (run once: npm run indexes)
  google-apps-script.js  — GAS incremental telesales sync script
docs/
  business-logic.md       — metric definitions, attribution rules, data flow
  page-brief.md           — page content and audience briefs
  ux-personas.md          — user personas, display priorities, UX rules
  overview-design.md      — overview page design notes
.github/
  workflows/
    mart-build.yml        — GitHub Actions mart rebuild (workflow_dispatch only, no cron)
```

---

## Database Schema

### Source Tables (raw / transactional)

| Table | PK | Description |
|-------|----|-------------|
| `leads` | `mmid` | MMID master list assigned to telesales agents |
| `telesales_calls` | `mmid` | Call log — agent, call_status, first_connected_date |
| `online_sales` | `(order_number, prod_num)` | HOC online order lines |
| `offline_sales` | `(order_number, prod_num)` | HOC offline order lines |
| `products` | `prod_num` | SKU master — brand, class, buyer hierarchy |
| `targets` | `(month, dynamic_cmg)` | Monthly sales targets per CMG |
| `costs` | `month` | Agent and supervisor cost per head |
| `incentives` | `tier` | Achievement threshold → incentive per head |
| `agent_headcount` | `month` | Monthly FTE headcount |
| `upload_batches` | `id (serial)` | Upload audit log (includes `file_hash` for dedup) |
| `table_summaries` | `table_name` | Row-count + total_sales cache per source table |

### Mart Tables (rebuilt on demand, indexed)

| Table | PK | Description |
|-------|----|-------------|
| `mmid_cmg_map` | `mmid` | Tiny lookup: mmid → primary_cmg + first_connected_date |
| `sales_hoc_orders` | `(mmid, order_number, prod_num)` | HOC-attributed order fact with customer_type |
| `mart_performance_cmg` | `(month, dynamic_cmg)` | Pre-aggregated KPIs at month × CMG grain |
| `mart_performance_month` | `month` | Month-level costs, incentive, ROI |
| `mart_builds` | `id (bigserial)` | Build audit log — status, duration_ms, row_counts |

### Attribution Logic

An order is attributed when `order_date ≤ first_connected_date + attribution_days` (default: 14).

| `customer_type` | Rule |
|-----------------|------|
| `new_customer` | Within window + first-ever HOC order for this mmid |
| `retention` | Within window + repeat HOC order |
| `first_order_not_converted` | First order but outside window |
| `retention_not_converted` | Repeat order but outside window |

Only `new_customer` and `retention` count toward KPI metrics.

### CMG Priority (`primary_cmg`)

For mmids that ordered across multiple CMGs, a single segment is assigned per customer:  
**FOOD RETAILER > HORECA > END USER > max(dynamic_cmg)**  
Prevents double-counting in Overview CMG breakdowns.

### Incentive Cutoff (May 2026+)

From May 2026, DISTRIBUTOR CMG is excluded from incentive-eligible sales:

```sql
WHERE month < '2026-05-01'
   OR dynamic_cmg IN ('FOOD RETAILER', 'HORECA', 'END USER')
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- CockroachDB Serverless cluster (or PostgreSQL 14+)
- Clerk account
- Cloudflare R2 bucket

### Installation

```bash
git clone https://github.com/watcharapol-frong/dashboard_unilever.git
cd dashboard_unilever
npm install
cp .env.local.example .env.local
# Fill in every value — see comments in .env.local.example
```

### Database Initialisation

1. Create all tables from your schema SQL.
2. Run `npm run indexes` once — creates source-table indexes and adds `file_hash` column.
3. Upload seed data (products, targets, costs, incentives, headcount) via Data Hub.
4. Trigger first mart build: Data Hub → Build Mart, or `npm run build-mart`.

### Admin User

1. Register at `/register` using the `INVITE_CODE_ADMIN` invite code.
2. Role (`admin` or `viewer`) is set automatically via `clerkClient.users.createUser`.
3. To promote an existing user: set `publicMetadata: { "role": "admin" }` in the Clerk dashboard.

---

## Scripts

```bash
npm run dev          # local dev server — http://localhost:3000
npm run build        # Next.js production build (TypeScript check included)
npm run lint         # ESLint
npm run indexes      # source-table indexes + file_hash column (run once)
npm run build-mart   # run mart build directly (no Vercel, no timeout)
                     # requires DATABASE_URL in environment
```

---

## API Reference

Authenticated routes require a valid Clerk session cookie. GAS ingest routes use a Bearer token (`INGEST_API_SECRET`).

```
/api/auth/register/            POST — public, invite-code-gated
/api/chat/                     POST — Dify AI streaming proxy
/api/webhooks/clerk/           POST — svix-verified

/api/data/dashboard/           GET  — source stats (admin)
/api/data/dashboard/agents     GET  — agent leaderboard
/api/data/dashboard/sales      GET  — sales KPI + trend
/api/data/dashboard/sales-trend GET — monthly/weekly trend
/api/data/dashboard/summary    GET  — top-level KPIs
/api/data/dashboard/telesales  GET  — funnel + agent perf
/api/data/dashboard/telesales-trend GET — telesales trend
/api/data/hub/                 GET  — upload history + stats (admin)
/api/data/hub/build            POST — trigger mart build via GitHub Actions (admin)
/api/data/hub/freshness        GET  — last refresh + build status
/api/data/hub/upload/multipart/init     POST (admin)
/api/data/hub/upload/multipart/complete POST (admin)
/api/data/hub/upload/multipart/abort    POST (admin)
/api/data/hub/upload/replay    POST (admin)
/api/data/ingest/telesales-activity POST — GAS Bearer token
/api/data/ingest/threshold     GET  — GAS Bearer token
/api/data/leads/               GET  — paginated (admin)
/api/data/leads/summary/       GET  — KPIs + options (admin)
/api/data/pivot/               GET/POST — export (admin)
/api/data/raw/                 GET  — table viewer (admin)
/api/data/raw/export/          GET  — CSV export (admin)
/api/data/template/[file]/     GET  — upload templates (admin)
```

**Cache presets** (`src/lib/query.ts`):

| Preset | CDN TTL | Stale | Used for |
|--------|---------|-------|----------|
| SHORT | 1 min | 2 min | admin/status routes: `hub`, `hub/freshness`, `leads`, `raw` |
| MEDIUM | 5 min | 10 min | `leads/summary` |
| FUNNEL | 10 min | 20 min | expensive aggregations (currently unused) |
| LONG | 1 hr | 2 hr | static options + most `dashboard/*` routes (`buildVersion` busts the cache immediately on build completion, so TTL doesn't gate freshness) |
| NONE | — | — | real-time status endpoints |

---

## GitHub Actions

Mart rebuild runs on demand via GitHub Actions (free tier) — no nightly cron. Triggered by
the "Build Mart" button in Data Hub, or automatically right after a successful upload.

### Setup (one-time)

Go to: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|-------|
| `DATABASE_URL` | CockroachDB connection string |
| `GH_WORKFLOW_TOKEN` | GitHub PAT (classic, `workflow` scope) — allows Data Hub UI to trigger workflow dispatch |

### Manual trigger

**Actions → Mart Build → Run workflow** — optionally override `attribution_days`.

### Cost

One build ≈ 2 min · 30 builds/month ≈ 60 min · GitHub free plan = 2,000 min/month (private).  
**Uses ~3% of free allowance.**

---

## Key Design Decisions

**Metric Layer (`src/lib/metrics.ts`)** — All shared SQL fragments (`CONV`, `NOT_CONV`, `REACHED`, `reachedCond()`) live here. Single source of truth — prevents metric drift between Overview, Telesales, and Leads pages.

**`mmid_cmg_map` replaces `mart_telesales_orders`** — The old 24-column intermediate table was only queried post-build for 2 columns. Replaced with a 3-column PK lookup. `sales_hoc_orders` is now built directly from source tables in a single CTE chain — faster build, less storage.

**Indexes auto-created after each build** — `buildMartMain()` and `buildMartPerformance()` create all mart indexes in parallel after populating each table. No separate migration step needed.

**Single `auth()` call per request** — Clerk's `auth()` called once and destructured. Two calls = two round-trips to Clerk's JWK endpoint per request.

**Server-side filtering on Leads** — All filters applied in SQL with 500-row pagination. KPI cards always show global totals regardless of active filters — intentional design.

**`DELETE FROM` instead of `TRUNCATE`** — CockroachDB blocks `TRUNCATE` when an async index-drop job is running. `DELETE FROM ... WHERE true` avoids this lock.

**Stale data warning** — `FreshnessBar` in the dashboard layout polls `/api/data/hub/freshness` every 5 minutes. Amber banner appears if `last_refreshed` > 24 hours.

**File dedup via SHA-256** — Upload service computes SHA-256 of raw CSV before ingest. Duplicate hashes rejected with HTTP 422.

**Environment-conditional SSL** — `rejectUnauthorized: true` in production, `false` in development only.
