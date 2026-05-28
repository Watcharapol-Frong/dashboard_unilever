# Unilever HOC Telesales Dashboard — Technical Roadmap

> Last updated: 2026-05-28

---

## System Architecture

```
CSV / Google Sheet
      │
      ▼
[Storage] Cloudflare R2 — AES-256-GCM encrypted at rest
      │
      ▼  ETL via /api/data/upload/multipart/complete
[DB] CockroachDB Serverless — raw tables
      │
      ▼  POST /api/data/refresh-mart  (on-demand mart rebuild)
[Mart] CockroachDB — mart_telesales_orders · mart_performance_month · mart_performance_cmg
      │
      ▼  REST API routes
[UI] Next.js 15 App Router — dashboard pages
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| UI | shadcn/ui + Tailwind CSS |
| Charts | Recharts |
| Tables | TanStack Table v8 |
| Auth | Clerk — RBAC via `publicMetadata.role` |
| Database | CockroachDB Serverless |
| File Storage | Cloudflare R2 (S3-compatible) |
| DB Client | `pg` (node-postgres) pool |
| Deployment | Vercel |

---

## Feature Status

### Infrastructure & Data Pipeline

| Feature | Status |
|---------|--------|
| CockroachDB setup + all raw tables | [Done] |
| Cloudflare R2 multipart upload pipeline | [Done] |
| AES-256-GCM file encryption | [Done] |
| Upload ETL → UPSERT into CockroachDB | [Done] |
| Google Apps Script incremental sync | [Done] |
| R2 replay (re-process backups into DB) | [Done] |
| Mart rebuild — single-query full build | [Done] |
| Build lock (prevents concurrent rebuilds) | [Done] |
| Configurable attribution window (14 / 30 / 90 / custom days) | [Done] |
| `attribution_days` stored in mart + surfaced in TopBar | [Done] |
| Clerk auth — middleware + `withAuth` / `withAdmin` wrappers | [Done] |
| RBAC: admin routes protected at middleware + handler level | [Done] |
| Rate limiting on register endpoint (sliding-window, 5/min/IP) | [Done] |
| Timing-safe invite-code comparison | [Done] |
| Environment-conditional SSL (`rejectUnauthorized: true` in prod) | [Done] |
| Vercel deployment | [Done] |

### Dashboard Pages

| Page | Status | Notes |
|------|--------|-------|
| `/overview` | [Done] | 6 KPI cards · Sales vs Target · New/Retention · ROI trend · month-range chip selector · CMG + channel filters |
| `/sales` | [Done] | Period-over-period comparison · trend chart · online/offline split |
| `/telesales` | [Done] | Funnel · agent leaderboard · reach/conversion rates |
| `/leads` | [Done] | Server-side paginated + filtered · 500 rows/page · global KPI cards |
| `/products` | [Done] | SKU/brand revenue · New vs Retention segmentation · channel mix |
| `/incentives` | [Done] | Monthly payout summary · tier config · ROI · DISTRIBUTOR exclusion (May 2026+) |
| `/data-hub` | [Done] | Upload pipeline · mart build tab · recovery tab |
| `/exports` | [Done] | Custom pivot export to CSV/XLSX |

### UI & Component System

| Component | Status |
|-----------|--------|
| `KpiCard` — icon, valueClassName, skeleton, tooltip, comparison badge | [Done] |
| `KpiGrid` — responsive grid (cols 2/3/4/6) | [Done] |
| `FilterBar` + `FilterSelect` — shared filter row + clear button | [Done] |
| `MultiSelect` — multi-checkbox dropdown | [Done] |
| `PageState` — `PageLoading`, `PageLoadingTable`, `PageEmpty`, `PageError` | [Done] |
| `TopBar` — breadcrumb + sidebar trigger + data freshness strip | [Done] |
| `HelpSheet` — slide-over user guide (All Users + Admin sections) | [Done] |
| Excel template downloads via `/api/data/template/[file]` | [Done] |
| `useDashboardSWR` — typed SWR hook with standard options | [Done] |
| `BuildContext` — build state persisted across navigation | [Done] |

---

## API Routes

```
/api/data/
  overview/                   GET  — mart_performance rows for Overview
  cohorts/                    GET  — cohort trend (?interval=&cmg=&channel=&startDate=&endDate=)
  leads/                      GET  — paginated + filtered leads (?page=&search=&tier=&contact=&conv=&cmg=&agent=)
  leads/summary/              GET  — global lead KPIs + filter options
  products/                   GET  — product/brand revenue data
  products/options/           GET  — filter dropdown options (cached 1 h)
  sales/                      GET  — sales trend + period comparison
  telesales/                  GET  — call-centre KPIs + leaderboard + funnel
  incentives/                 GET  — incentive payout summary
  dashboard/                  GET  — data status + upload history
  mart-status/                GET  — mart table row counts + refresh timestamps
  mart-freshness/             GET  — last refresh date + attribution_days
  build-status/               GET  — build-lock state
  refresh-mart/               POST — single-query full mart rebuild
  template/[file]/            GET  — .xlsx upload template download (admin)
  upload/
    multipart/init/           POST — start multipart R2 upload
    multipart/complete/       POST — finalize upload → ETL to DB
    multipart/abort/          POST — cancel failed upload
    replay/                   POST — re-process R2 backups into DB
  ingest/
    telesales-activity/       POST — GAS: upsert call records (Bearer token)
    threshold/                GET  — GAS: latest first_connected_date

/api/auth/
  register/                   POST — invite-code-gated user registration
```

---

## Database Tables

### Raw / Transactional

| Table | Primary Key | Notes |
|-------|------------|-------|
| `online_sales` | `(order_number, prod_num)` | HOC online order lines |
| `offline_sales` | `(order_number, prod_num)` | `sales_in_vat = sales_ex_vat × 1.07` |
| `leads` | `mmid` | MMID master list |
| `products` | `prod_num` | SKU master |
| `telesales_calls` | `mmid` | Latest call per customer |
| `targets` | `(month, dynamic_cmg)` | Monthly sales targets |
| `costs` | `month` | Agent + supervisor cost per head |
| `incentives` | `tier` | Achievement threshold → bonus per head |
| `agent_headcount` | `month` | Monthly FTE counts |
| `upload_batches` | `id` | Upload audit log; `uploaded_by` is TEXT (Clerk email/ID) |

`sales_hoc_orders` is a `UNION ALL` view of `online_sales` + `offline_sales`, INNER JOINed with `products` (HOC SKUs only).

### Mart (rebuilt on demand)

| Table | Grain | Description |
|-------|-------|-------------|
| `mart_telesales_orders` | `(mmid, order_number)` | Attributed orders with `customer_type` and `attribution_days` |
| `mart_performance_month` | `(month, dynamic_cmg)` | Aggregated KPIs per month × CMG |
| `mart_performance_cmg` | `dynamic_cmg` | Cross-month CMG totals |

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
| Vercel free plan: 10 s function timeout | Single-query mart build; chunked legacy path removed |
| CockroachDB: `TRUNCATE` blocks on async index drop | Use `DELETE FROM … WHERE true` instead |
| CockroachDB: `ALTER COLUMN TYPE` in transaction not supported | Add / copy / drop / rename pattern |
| CockroachDB: `STRING_AGG(DISTINCT …, ORDER BY …)` not supported | Use subquery + GROUP BY workaround |
| Recharts SSR incompatibility | Dynamic import with `{ ssr: false }` for chart components |
| Rate limiter is in-memory | Works on single-server; upgrade to `@upstash/ratelimit` + Redis for multi-region |

---

## Backlog

| Item | Priority | Notes |
|------|----------|-------|
| Materialize `sales_hoc_all` as a real table | Medium | UNION ALL view causes full-scan on every query |
| Stored Procedure for mart build | Low | Moves build logic into DB, removes API timeout risk |
| Distributed rate limiting | Low | Swap in-memory limiter for `@upstash/ratelimit` |
| DateRangeContext global filter | Low | Context wired in layout; TopBar no longer uses it |
| Agent leaderboard export | Low | Export agent-level CSV from Telesales page |
