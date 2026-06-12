# Unilever HOC Telesales Dashboard

A production-grade operational analytics platform for the Unilever HOC (House of Cosmetics) telesales programme on Makro Pro. It centralises sales performance, lead conversion, call-centre KPIs, product revenue, and incentive payouts behind a role-based access layer.

---

## Table of Contents

- [Features](#features)
- [System Architecture](#system-architecture)
- [Security Architecture](#security-architecture)
- [Data Ingestion Pipeline](#data-ingestion-pipeline)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Key Design Decisions](#key-design-decisions)
- [License](#license)

---

## Features

| Page | Audience | Highlights |
|------|----------|-----------|
| **Overview** | All users | 6 KPI cards · HOC Sales vs Target · New vs Retention · ROI trend · month-range chip selector · CMG + channel filters |
| **Sales** | Sales Manager | Period-over-period comparison · daily/weekly/monthly area chart · online/offline split |
| **Telesales** | Call-centre Supervisor | Reach rate · conversion funnel · agent leaderboard · call-status breakdown by tier |
| **Leads** | Admin | Server-side filtered + paginated lead list · contact status · conversion outcome |
| **Products** | Category Manager | SKU / brand revenue · New vs Retention segmentation · channel mix |
| **Incentives** | Finance | Monthly incentive payouts · tier configuration · programme ROI |
| **Data Hub** *(admin)* | Admin | CSV upload pipeline · ETL status monitoring · mart rebuild with configurable attribution window |
| **Exports** *(admin)* | Admin | Custom pivot exports to CSV/XLSX at month/week/day/order-line granularity |
| **AI Assistant** | All users | Context-aware chatbot powered by Dify for data-driven insights |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Clients (Browser)                                               │
│  Next.js 15 App Router · React · SWR · Recharts · TanStack Table│
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼──────────────────────────────────────┐
│  API Layer  (Vercel Serverless — /api/data/*)                    │
│  · Clerk middleware: authentication + RBAC on every route        │
│  · withAuth() / withAdmin() wrappers on each handler             │
│  · In-memory sliding-window rate limiter (register endpoint)     │
│  · timingSafeEqual for invite-code comparison                    │
└────────────┬──────────────────────────────┬──────────────────────┘
             │ node-postgres (TLS)          │ AWS S3-compatible SDK
┌────────────▼───────────────────┐  ┌──────▼──────────────────────┐
│  CockroachDB Serverless         │  │  Cloudflare R2 (Object Store)│
│  · Raw tables (leads, sales, …) │  │  · AES-256-GCM encrypted     │
│  · Mart tables (aggregated KPIs)│  │  · Multipart upload          │
└─────────────────────────────────┘  └─────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  AI Integration (Dify)                                           │
│  · SSE streaming chat interface                                  │
│  · Context-aware assistant via /api/chat                         │
└──────────────────────────────────────────────────────────────────┘

External sync:
  Google Apps Script → POST /api/data/ingest/telesales-activity
  (Bearer-token auth, excluded from Clerk middleware matcher)
```

---

## Security Architecture

### Role-Based Access Control (RBAC)

Access is enforced at two independent layers:

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| **Middleware** | `clerkMiddleware` — single `auth()` call; redirects unauthenticated browsers, returns 401/403 JSON for API clients | Every protected route on every request |
| **Route handler** | `withAuth()` / `withAdmin()` wrappers in `src/lib/auth.ts` | Fine-grained per-endpoint guard; `withAdmin` checks `publicMetadata.role === 'admin'` |

Admin-only surfaces: `/leads`, `/data-hub`, `/exports` and their API equivalents.

### Cryptographic Controls

| Control | Implementation |
|---------|---------------|
| **File encryption at rest** | AES-256-GCM via `STORAGE_ENCRYPTION_KEY` (64-char hex) before files land in R2 |
| **Invite-code comparison** | `crypto.timingSafeEqual` — constant-time comparison prevents timing oracle attacks |
| **TLS / SSL** | `rejectUnauthorized: true` in production (environment-conditional in `src/lib/db.ts`) |
| **GAS ingest auth** | `INGEST_API_SECRET` Bearer token; routes excluded from Clerk middleware matcher |

### Rate Limiting

The `/api/auth/register` endpoint enforces a sliding-window limit (5 requests / IP / 60 s) via an in-memory map. For distributed production deployments, swap the implementation for `@upstash/ratelimit` backed by Redis — the `TODO` comment in the route file marks the upgrade point.

---

## Data Ingestion Pipeline

```
Upload (browser)
  │
  ├─ 1. POST /api/data/upload/multipart/init
  │       └─ Cloudflare R2 creates a multipart upload session
  │
  ├─ 2. PUT (direct to R2) — chunked, parallel
  │       └─ AES-256-GCM encryption applied per chunk
  │
  ├─ 3. POST /api/data/upload/multipart/complete
  │       ├─ R2 assembles the object
  │       └─ ETL: CSV → validate headers → UPSERT into CockroachDB
  │
  └─ 4. (optional) POST /api/data/upload/replay
          └─ Re-process R2 backups into DB without re-uploading

Google Apps Script sync (incremental):
  GAS → POST /api/data/ingest/telesales-activity (Bearer token)
       └─ Upserts call records; GET /api/data/ingest/threshold returns
          the latest first_connected_date to limit what GAS sends

Mart rebuild (on demand, admin):
  POST /api/data/refresh-mart
    └─ Single DB query rebuilds mart_telesales_orders + mart_performance
       with configurable attribution_days (default 14)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org) (App Router, TypeScript) |
| Database | [CockroachDB Serverless](https://cockroachlabs.com) via `node-postgres` |
| File Storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible) |
| Auth | [Clerk](https://clerk.com) — magic link + email OTP |
| Data fetching | [SWR](https://swr.vercel.app) — stale-while-revalidate |
| UI components | [shadcn/ui](https://ui.shadcn.com) + [Tailwind CSS v4](https://tailwindcss.com) |
| Charts | [Recharts](https://recharts.org) |
| Tables | [TanStack Table v8](https://tanstack.com/table) |
| Excel generation | [ExcelJS](https://github.com/exceljs/exceljs) |
| AI Platform | [Dify](https://dify.ai) — LLM orchestration & RAG |
| Deployment | [Vercel](https://vercel.com) |

---

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/              # Authenticated dashboard pages
│   │   ├── overview/
│   │   ├── sales/
│   │   ├── telesales/
│   │   ├── leads/
│   │   ├── products/
│   │   ├── incentives/
│   │   ├── data-hub/
│   │   └── exports/
│   ├── api/
│   │   ├── auth/register/        # Invite-code registration
│   │   └── data/                 # REST data endpoints
│   │       ├── overview/
│   │       ├── leads/
│   │       ├── products/
│   │       ├── sales/
│   │       ├── telesales/
│   │       ├── incentives/
│   │       ├── dashboard/
│   │       ├── mart-status/
│   │       ├── refresh-mart/
│   │       ├── template/[file]/  # Excel template downloads (admin)
│   │       ├── upload/           # Multipart R2 + ETL pipeline
│   │       └── ingest/           # GAS incremental sync (no Clerk)
│   └── (auth)/                   # Sign-in / sign-up pages
├── components/
│   ├── dashboard/                # KpiCard, FilterBar, HelpSheet, …
│   └── ui/                       # shadcn/ui base components
├── context/                      # BuildContext, DateRangeContext
├── hooks/
│   └── useDashboardSWR.ts        # Typed SWR hook with standard options
├── lib/
│   ├── auth.ts                   # withAuth / withAdmin wrappers
│   ├── db.ts                     # PostgreSQL pool + query helpers
│   ├── build-lock.ts             # In-memory build guard
│   ├── formatters.ts             # fmt, fmtBaht, fmtPct
│   └── services/
│       └── mart-service.ts       # Attribution logic + mart SQL
├── middleware.ts                 # Clerk RBAC — single auth() call
└── types/                        # Shared TypeScript interfaces
scripts/
└── google-apps-script.js         # GAS incremental telesales sync
```

---

## Database Schema

### Raw / Transactional Tables

| Table | Primary Key | Description |
|-------|------------|-------------|
| `leads` | `mmid` | MMID master list assigned to telesales agents |
| `telesales_calls` | `mmid` | Call log — agent, call status, first connected date |
| `online_sales` | `(order_number, prod_num)` | HOC online order lines |
| `offline_sales` | `(order_number, prod_num)` | HOC offline order lines |
| `products` | `prod_num` | SKU master — brand, class, buyer hierarchy |
| `targets` | `(month, dynamic_cmg)` | Monthly sales targets per CMG |
| `costs` | `month` | Agent and supervisor cost per head |
| `incentives` | `tier` | Incentive tier rules (achievement threshold → bonus) |
| `agent_headcount` | `month` | Monthly FTE headcount |
| `upload_batches` | `id` | Audit log for every upload |

`sales_hoc_orders` is a `UNION ALL` view of `online_sales` and `offline_sales` INNER JOINed with `products` (HOC SKUs only).

### Materialized Mart Tables

| Table | Rebuilt by | Description |
|-------|-----------|-------------|
| `mart_telesales_orders` | Build Mart | Attributed order fact — one row per order with `customer_type` and `attribution_days` |
| `mart_performance_month` | Build Mart | Aggregated KPIs at `(month, dynamic_cmg)` grain |
| `mart_performance_cmg` | Build Mart | Cross-CMG aggregation for Overview |

### Attribution Logic

A telesales order is attributed when `order_date ≤ first_connected_date + attribution_days`.

| `customer_type` | Rule |
|-----------------|------|
| `new_customer` | Within window + first-ever HOC order |
| `retention` | Within window + repeat HOC order |
| `first_order_not_converted` | First order but outside window |
| `retention_not_converted` | Repeat order but outside window |

Only `new_customer` and `retention` rows count toward KPIs.

### DISTRIBUTOR Exclusion (May 2026+)

From May 2026 onwards, DISTRIBUTOR CMG is excluded from incentive-eligible sales and achievement calculations. The mart SQL and all API queries use a time-conditional filter:

```sql
-- Covers Feb–Apr 2025 (all CMGs) and May 2026+ (FOOD RETAILER + HORECA only)
WHERE month < '2026-05-01'
   OR dynamic_cmg IN ('FOOD RETAILER', 'HORECA')
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- CockroachDB Serverless cluster (or any PostgreSQL 14+ database)
- Clerk account
- Cloudflare R2 bucket

### Installation

```bash
git clone https://github.com/<your-username>/dashboard_unilever.git
cd dashboard_unilever
npm install
```

### Environment Setup

Copy the example file — **never commit the real `.env.local`**:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in every value. The example file (`env.local.example`) documents all required keys and their expected formats. The file itself is safe to commit — it contains no real secrets.

> `.env.local` is already listed in `.gitignore` and will never be tracked by git.

### Database Setup

Run the schema SQL from `db/` to create all raw and mart tables, then seed reference data (products, targets, costs, incentives, headcount) via the Data Hub CSV upload interface.

### Development

```bash
npm run dev       # http://localhost:3000
npm run build     # production build
npm run lint      # ESLint
```

### Admin User Setup

1. Create a Clerk user via the Clerk dashboard.
2. Set `publicMetadata: { "role": "admin" }` on that user.
3. Admin users gain access to `/data-hub`, `/leads`, and `/exports`. All other authenticated users are viewers.

---

## API Reference

All endpoints live under `/api/data/`. Authenticated endpoints require a valid Clerk session cookie.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/data/overview` | User | Mart performance rows for Overview page |
| `GET` | `/api/data/cohorts` | User | Cohort trend data with interval + filter params |
| `GET` | `/api/data/leads` | Admin | Paginated, server-side filtered lead list |
| `GET` | `/api/data/leads/summary` | Admin | Global lead KPIs + filter options |
| `GET` | `/api/data/products` | User | Product / brand revenue data |
| `GET` | `/api/data/products/options` | User | Filter dropdown options (cached 1 h) |
| `GET` | `/api/data/sales` | User | Sales trend with period comparison |
| `GET` | `/api/data/telesales` | User | Call-centre KPIs, agent leaderboard, funnel |
| `GET` | `/api/data/incentives` | User | Incentive payout summary |
| `GET` | `/api/data/dashboard` | Admin | Data Hub source status + upload history |
| `GET` | `/api/data/mart-status` | User | Mart table row counts and refresh timestamps |
| `GET` | `/api/data/mart-freshness` | User | Last refresh date + attribution_days from mart |
| `GET` | `/api/data/build-status` | Admin | Build-lock state |
| `POST` | `/api/data/refresh-mart` | Admin | Single-query full mart rebuild |
| `GET` | `/api/data/template/[file]` | Admin | Download `.xlsx` upload template |
| `POST` | `/api/data/upload/multipart/init` | Admin | Start multipart R2 upload |
| `POST` | `/api/data/upload/multipart/complete` | Admin | Finalize upload + ETL to DB |
| `POST` | `/api/data/upload/multipart/abort` | Admin | Cancel a failed upload |
| `POST` | `/api/data/upload/replay` | Admin | Re-process R2 backups into DB |
| `POST` | `/api/data/ingest/telesales-activity` | Bearer | GAS: upsert call records |
| `GET` | `/api/data/ingest/threshold` | Bearer | GAS: latest `first_connected_date` |
| `POST` | `/api/chat` | User | Proxy request to Dify AI for streaming chat |
| `POST` | `/api/auth/register` | Public* | Invite-code-gated user registration |

\* Rate-limited (5 req/IP/min) and invite-code protected.

---

## Key Design Decisions

**Single `auth()` call per middleware request** — Clerk's `auth()` is called once and destructured. Calling it twice (the old pattern of `auth.protect()` + `auth()`) caused two round-trips to Clerk's remote JWK endpoint per request.

**Server-side filtering on Leads** — Lead data can be large. All filters (tier, contact status, conversion, CMG, agent, free-text search) are applied in SQL with server-side pagination (500 rows/page). KPI cards always show global totals regardless of active filters.

**Subquery pattern for joined-table filters** — Filters on fields from joined tables (`senior_buyer_name`, `agent`) use `IN (SELECT ...)` subqueries rather than JOIN aliases. This avoids breaking queries that don't include that JOIN branch.

**Thai `call_status` values** — `telesales_calls.call_status` stores Thai-language values matching the source system's export format. These are matched exactly in SQL `WHERE` clauses; the UI translates them to English via `CALL_STATUS_LABELS` before rendering.

**Mart cross-join de-duplication** — `mart_performance` stores KPIs at `(month, dynamic_cmg, lead_customers)` grain. Fields like `total_agent_cost` (per month) repeat across CMG rows. The UI always de-duplicates before summing; ROI and achievement % are always recomputed from de-duplicated sums, never averaged from row values.

**`DELETE FROM` instead of `TRUNCATE`** — CockroachDB blocks `TRUNCATE` when an async index-drop job is running on the target table. `DELETE FROM mart_telesales_orders WHERE true` avoids this locking issue.

**Environment-conditional SSL** — `src/lib/db.ts` sets `rejectUnauthorized: true` in production and `false` only in development, preventing accidental acceptance of invalid certificates in production while keeping local dev convenient.

---

## License

MIT
