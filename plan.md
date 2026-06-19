# Unilever HOC Telesales Dashboard — Technical Roadmap

> Last updated: 2026-06-19

---

## System Architecture

```
CSV / Google Sheet
      │
      ▼
[Storage] Cloudflare R2 — AES-256-GCM encrypted at rest
      │
      ▼  ETL via /api/data/hub/upload/multipart/complete
[DB] CockroachDB Serverless — raw tables
      │
      ▼  POST /api/data/hub/build  (on-demand) or GitHub Actions (nightly)
[Mart] CockroachDB
         mmid_cmg_map         — mmid → primary_cmg lookup
         sales_hoc_orders     — HOC-attributed order fact with customer_type
         mart_performance_cmg — month × CMG KPI aggregates
         mart_performance_month — month costs + ROI
      │
      ▼  REST API routes (/api/data/dashboard/*)
[UI] Next.js 15 App Router — dashboard pages
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| UI | shadcn/ui + Tailwind CSS |
| Charts | Recharts (SSR-disabled) |
| Tables | TanStack Table v8 |
| Auth | Clerk v6 — RBAC via `publicMetadata.role` |
| Database | CockroachDB Serverless |
| File Storage | Cloudflare R2 (S3-compatible) |
| DB Client | `pg` (node-postgres) pool |
| Deployment | Vercel + GitHub Actions (nightly mart build) |

---

## Feature Status

### Infrastructure & Data Pipeline

| Feature | Status |
|---------|--------|
| CockroachDB setup + all raw tables | Done |
| Cloudflare R2 multipart upload pipeline | Done |
| AES-256-GCM file encryption | Done |
| Upload ETL → UPSERT into CockroachDB | Done |
| Google Apps Script incremental sync | Done |
| R2 replay (re-process backups into DB) | Done |
| Mart rebuild — single-query full build | Done |
| Build lock (prevents concurrent rebuilds) | Done |
| Configurable attribution window | Done |
| Clerk auth — middleware + withAuth / withAdmin | Done |
| RBAC: admin routes protected at middleware + handler level | Done |
| Invite-code registration via clerkClient.users.createUser | Done |
| Clerk webhook (svix signature verification) | Done |
| NavUser in sidebar (Clerk + dev-mode placeholder) | Done |
| Timing-safe invite-code comparison | Done |
| Environment-conditional SSL | Done |
| Vercel deployment | Done |
| Dead code cleanup (DateRangePicker, DateRangeContext, unused vars) | Done |

### Dashboard Pages

| Page | Route | Auth | Status |
|------|-------|------|--------|
| Main Overview | `/dashboard` | User | Done |
| Order Sales | `/dashboard/sales` | User | Done |
| Telesales | `/dashboard/telesales` | User | Done |
| Call Log | `/dashboard/telesales/call-log` | User | Exists, not in nav |
| Leads | `/leads` | Admin | Done |
| Raw Data | `/raw-data` | Admin | Done |
| Data Hub | `/data-hub` | Admin | Done |

### Page-Level Features

| Feature | Status |
|---------|--------|
| Persistent filter state (localStorage) — month range + filters across pages | Done |
| Default date range = full available range (auto-selected on data load) | Done |
| Agent Leaderboard sum row — both Sales and Telesales pages | Done |
| Channel Breakdown → converted-only (converted_online/offline) | Done |
| Telesales Converted scoped to post-call orders when date filter active | Done |
| GAS postToAPI_ chunked to 1,000 records per HTTP request | Done |
| Auto-refresh pages after GitHub Actions mart build (BuildContext polls freshness, bumps buildVersion) | Done |
| Vercel CDN cache busting via ?_v={buildVersion} in fetch URLs | Done |
| InputOTP component (input-otp package, login OTP restyle) | Done |
| Interested Not Converted fixed — server computes interested_not_converted (always ≥ 0) | Done |
| GH_WORKFLOW_TOKEN support — Build Mart triggers GitHub Actions workflow dispatch | Done |

### UI & Component System

| Component | Status |
|-----------|--------|
| `KpiCard` — icon, valueClassName, skeleton, tooltip, comparison badge | Done |
| `KpiGrid` — responsive grid (cols 2/3/4/6) | Done |
| `FilterBar` + `FilterSelect` — shared filter row + clear button | Done |
| `MultiSelect` — multi-checkbox dropdown | Done |
| `useLocalState` — localStorage-persisted useState drop-in (SSR-safe) | Done |
| MultiSelect "All" checkbox at top of dropdown | Done |
| `SalesFunnelChart` — per-stage Info tooltip with description | Done |
| `PageState` — PageLoading, PageEmpty, PageError | Done |
| `TopBar` — breadcrumb + sidebar trigger + freshness strip | Done |
| `AppSidebar` — Dashboard / Data / Help sections + NavUser footer | Done |
| `NavUser` — Clerk dropdown (or dev-mode amber placeholder) | Done |
| `SalesTrendChart` — stacked bar (online/offline), monthly/weekly (Target line removed from /sales page) | Done |
| `TelesalesTrendMiniChart` — bars + conversion rate line | Done |
| `SplitBubbleChart` — D3 bubble map per Senior Buyer, drill-down on double-click | Done |
| `FreshnessBar` — amber banner if mart > 24 h stale | Done |
| `useDashboardSWR` — typed SWR hook | Done |
| `BuildContext` — build state persisted across navigation | Done |

---

## API Routes

```
/api/auth/register/            POST — invite-code-gated user creation (public)
/api/chat/                     POST — Dify AI streaming proxy
/api/webhooks/clerk/           POST — svix-verified Clerk webhook

/api/data/
  dashboard/                   GET  — source table stats (admin)
  dashboard/agents             GET  — agent leaderboard
  dashboard/sales              GET  — sales KPI + trend + product analysis
  dashboard/sales-trend        GET  — monthly/weekly trend
  dashboard/summary            GET  — top-level KPIs
  dashboard/telesales          GET  — funnel + tier + agent perf
  dashboard/telesales-trend    GET  — monthly/weekly telesales trend
  hub/                         GET  — upload history + table stats (admin)
  hub/build                    POST — mart rebuild trigger (admin)
  hub/freshness                GET  — last refresh + build status
  hub/upload/multipart/init    POST — start R2 multipart upload (admin)
  hub/upload/multipart/complete POST — finalize + ETL (admin)
  hub/upload/multipart/abort   POST — cancel upload (admin)
  hub/upload/replay            POST — re-process R2 backups (admin)
  ingest/telesales-activity    POST — GAS upsert (Bearer token)
  ingest/threshold             GET  — GAS: MAX(first_connected_date)
  leads/                       GET  — paginated lead list (admin)
  leads/summary/               GET  — lead KPIs + filter options (admin)
  pivot/                       GET  — export filter options (admin)
  pivot/                       POST — raw data export (admin)
  raw/                         GET  — raw table viewer (admin)
  raw/export/                  GET  — CSV export (admin)
  template/[file]/             GET  — upload template download (admin)
```

---

## Database Tables

### Raw / Transactional

| Table | Primary Key | Notes |
|-------|------------|-------|
| `online_sales` | `(order_number, prod_num)` | HOC online order lines |
| `offline_sales` | `(order_number, prod_num)` | `sales_in_vat = sales_ex_vat × 1.07` |
| `leads` | `mmid` | MMID master list |
| `products` | `prod_num` | SKU master — brand, class, buyer hierarchy |
| `telesales_calls` | `mmid` | Latest call per customer (GAS upserts) |
| `targets` | `(month, dynamic_cmg)` | Monthly sales targets |
| `costs` | `month` | Agent + supervisor cost per head |
| `incentives` | `tier` | Achievement threshold → bonus per head |
| `agent_headcount` | `month` | Monthly FTE counts |
| `upload_batches` | `id` | Upload audit log; includes `file_hash` for dedup |
| `table_summaries` | `table_name` | Row-count + total_sales cache |

### Mart (rebuilt nightly)

| Table | Grain | Description |
|-------|-------|-------------|
| `mmid_cmg_map` | `mmid` | mmid → primary_cmg + first_connected_date (3 cols) |
| `sales_hoc_orders` | `(mmid, order_number, prod_num)` | HOC-attributed orders with customer_type |
| `mart_performance_cmg` | `(month, dynamic_cmg)` | Pre-aggregated KPIs at month × CMG |
| `mart_performance_month` | `month` | Month-level costs, incentive, ROI |
| `mart_builds` | `id` | Build audit log — status, duration_ms, row_counts |

> `mart_telesales_orders` was removed. Replaced by `mmid_cmg_map` (3-col lookup) + `sales_hoc_orders` (built directly from source tables in one CTE chain).

---

## Upload Config

| File Type | Target Table | Conflict Key |
|-----------|-------------|--------------|
| `online_sales` | `online_sales` | `(order_number, prod_num)` |
| `offline_sales` | `offline_sales` | `(order_number, prod_num)` |
| `leads` | `leads` | `mmid` |
| `products` | `products` | `prod_num` |
| `telesales` | `telesales_calls` | `mmid` |
| `targets` | `targets` | `(month, dynamic_cmg)` |
| `costs` | `costs` | `month` |
| `incentives` | `incentives` | `tier` |
| `agent_headcount` | `agent_headcount` | `month` |

---

## Known Constraints

| Constraint | Mitigation |
|-----------|-----------|
| Vercel free plan: 10 s function timeout | Nightly build in GitHub Actions; manual `npm run build-mart` |
| CockroachDB: `TRUNCATE` blocks on async index drop | Use `DELETE FROM … WHERE true` instead |
| CockroachDB: `ALTER COLUMN TYPE` in transaction not supported | Add / copy / drop / rename pattern |
| CockroachDB: `STRING_AGG(DISTINCT …, ORDER BY …)` not supported | Subquery + GROUP BY workaround |
| Recharts SSR incompatibility | Dynamic import with `{ ssr: false }` |
| ClerkProvider requires publishable key | Conditionally included in root layout |

---

## Backlog

| Item | Priority | Notes |
|------|----------|-------|
| Agent leaderboard CSV export | Medium | Export from Telesales page |
| Distributed rate limiting on register | Low | Swap in-memory limiter for @upstash/ratelimit |
| Call Log page (`/dashboard/telesales/call-log`) | Low | Route exists but page not built |
