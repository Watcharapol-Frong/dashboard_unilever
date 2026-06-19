# Dashboard Unilever — System Design Specification

> **Legacy design reference** — This document reflects the original architecture and page designs. Current API routes and environment variables are authoritative in `CLAUDE.md`. Last updated: 2026-06-19.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Database | CockroachDB Serverless (via `pg` pool, `DATABASE_URL` env) |
| Auth | Clerk — `withAdmin()` / `withAuth()` wrappers in `src/lib/auth.ts` |
| Data fetching | SWR (client) — stale-while-revalidate pattern |
| UI components | shadcn/ui + Tailwind CSS |
| Charts | Recharts v2 |
| Tables | TanStack Table v8 |

### Auth Guards

| Guard | Access | Usage |
|-------|--------|-------|
| `withAuth()` | Any logged-in user | Most read endpoints |
| `withAdmin()` | `publicMetadata.role === 'admin'` only | Leads, Data Hub, Exports |

---

## Database Tables

### Raw / Transactional

| Table | Contents |
|-------|---------|
| `leads` | MMID master list assigned to telesales — `mmid`, `cust_name`, `lead_customers` |
| `telesales_calls` | Call log — `mmid`, `agent`, `call_status`, `first_connected_date` |
| `sales_hoc_orders` | HOC Unilever orders — `mmid`, `order_number`, `order_date`, `sales_in_vat`, `customer_type`, `dynamic_cmg`, `prod_num` |
| `products` | SKU master — `prod_num`, `product_name_th`, `product_name_en`, `brands`, `class_name`, `subclass`, `senior_buyer_name`, `buyer_name` |
| `targets` | Monthly sales targets per CMG — `month`, `dynamic_cmg`, `sales_target` |
| `costs` | Monthly cost per agent/supervisor — `month`, `cost_per_agent`, `cost_per_supervisor` |
| `incentives` | Incentive tier rules — achievement threshold (`tier`) → `incentive_per_head` |
| `agent_headcount` | Monthly headcount — `month`, `agent_count`, `supervisor_count` |

### Materialized / Mart

| Table | Grain | Description | Rebuilt by |
|-------|-------|-------------|-----------|
| `mmid_cmg_map` | `mmid` | mmid → primary_cmg + first_connected_date (3-col lookup) | Build Mart |
| `sales_hoc_orders` | `(mmid, order_number, prod_num)` | HOC-attributed order fact with `customer_type` | Build Mart |
| `mart_performance_cmg` | `(month, dynamic_cmg)` | Pre-aggregated KPIs at month × CMG grain | Build Mart |
| `mart_performance_month` | `month` | Month-level costs, incentive, ROI | Build Mart |
| `mart_builds` | `id` | Build audit log — status, duration_ms, row_counts | Build Mart |

> `mart_telesales_orders` and `mart_performance` no longer exist. See `plan.md` and `CLAUDE.md` for current mart schema.

### Attribution Logic (`customer_type`)

```
new_customer              order_date within attribution_days of first_connected_date  AND first-ever order
retention                 order_date within attribution_days of first_connected_date  AND repeat order
first_order_not_converted first-ever order but outside attribution window
retention_not_converted   repeat order but outside attribution window
```

Default `attribution_days = 14`. Only `new_customer` and `retention` rows count toward KPIs.

### HOC Unilever Definition

`sales_hoc_orders` is built from `online_sales UNION ALL offline_sales`, INNER JOINed with `products WHERE product_name_en IS NOT NULL`. Only SKUs mapped as HOC Unilever products are included.

---

## API Endpoints

> The endpoints below (`/api/data/overview`, `/api/data/leads`, etc.) reflect the original design. Current API routes live under `/api/data/dashboard/*` and `/api/data/hub/*` — see `CLAUDE.md` for the authoritative route list.

---

### GET `/api/data/leads/summary`

| Item | Value |
|------|-------|
| Auth | `withAdmin` |
| DB tables | `leads`, `telesales_calls`, `sales_hoc_orders` |
| Query params | none — always global totals |
| Cache | `s-maxage=300, stale-while-revalidate=600` |

**KPI definitions:**

| Field | SQL |
|-------|-----|
| `total` | `COUNT(*)` from `leads` |
| `contacted` | `COUNT(*) FILTER (WHERE cs.contact_status IS NOT NULL)` — mmid appears in `telesales_calls` with `first_connected_date IS NOT NULL` |
| `converted` | `COUNT(*) FILTER (WHERE os.is_converted)` — mmid has ≥ 1 HOC order |
| `total_orders` | `SUM(os.hoc_orders) FILTER (WHERE os.is_converted)` — orders from converted MMIDs only |

Also returns dropdown options: `filters.tiers`, `filters.cmgs`, `filters.agents`.

**Contact status classification (cs CTE):**

```sql
CASE
  WHEN COUNT(*) FILTER (
    WHERE call_status NOT LIKE 'ไม่รับสาย%'
      AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
  ) > 0 THEN 'reached'
  ELSE 'called_not_reached'
END
FROM telesales_calls
WHERE first_connected_date IS NOT NULL
```

---

### GET `/api/data/leads`

| Item | Value |
|------|-------|
| Auth | `withAdmin` |
| DB tables | `leads`, `telesales_calls`, `sales_hoc_orders` |
| Cache | `s-maxage=60, stale-while-revalidate=120` |

**Query params:**

| Param | Type | Filter condition |
|-------|------|-----------------|
| `page` | int (default 1) | pagination |
| `limit` | int (default 500, max 500) | pagination |
| `search` | string | `l.mmid ILIKE` OR `l.cust_name ILIKE` |
| `tier` | CSV | `l.lead_customers = ANY($n)` |
| `contact` | CSV | `COALESCE(cs.contact_status,'not_called') = ANY($n)` |
| `conv` | CSV | CASE expression on `os.is_converted` / `os.mmid` |
| `cmg` | CSV | subquery: `l.mmid IN (SELECT mmid FROM sales_hoc_orders WHERE dynamic_cmg = ANY($n))` |
| `agent` | CSV | subquery: `l.mmid IN (SELECT mmid FROM telesales_calls WHERE agent = ANY($n) AND first_connected_date IS NOT NULL)` |

Returns `{ data: Lead[], total, page, limit }`.

**Why subqueries for cmg/agent:** Using `MAX(dynamic_cmg)` / `MAX(agent)` per mmid in CTEs would miss mmids with multiple values. Subqueries match any occurrence.

---

### GET `/api/data/products`

| Item | Value |
|------|-------|
| Auth | `withAuth` |
| DB tables | `sales_hoc_orders` (alias `m`), `products` (alias `p`) |
| Cache | `s-maxage=300, stale-while-revalidate=600` |

**Query params:**

| Param | Filter condition |
|-------|-----------------|
| `startDate` / `endDate` | `m.order_date >= $n::date` / `m.order_date <= $n::date` |
| `brands` | `m.brands = ANY($n)` |
| `class_name` | `m.class_name = ANY($n)` |
| `subclass` | `m.subclass = ANY($n)` |
| `senior_buyer` | subquery: `m.prod_num IN (SELECT prod_num FROM products WHERE senior_buyer_name = ANY($n))` |
| `buyer` | subquery: `m.prod_num IN (SELECT prod_num FROM products WHERE buyer_name = ANY($n))` |

**Why subqueries for senior_buyer/buyer:** These fields exist only in `products` table. Some queries (brand summary, brand trend) don't JOIN to `products p`, so direct `p.field` references would fail.

Returns: `by_product[]`, `by_brand[]`, `by_brand_trend[]`, `top5_brands[]`, plus aggregate KPIs (`total_sales`, `total_qty`, `total_skus`, `total_orders`, `avg_order_value`).

---

### GET `/api/data/products/options`

| Item | Value |
|------|-------|
| Auth | `withAuth` |
| DB tables | `products`, `sales_hoc_orders` |
| Cache | `s-maxage=3600, stale-while-revalidate=7200` (1-hour — stable master data) |

Returns all dropdown option lists: `brands`, `class_names`, `senior_buyers`, `buyers`, `subclasses`, `months`.

---

### GET `/api/data/sales`

| Item | Value |
|------|-------|
| Auth | `withAuth` |
| DB tables | `sales_hoc_orders` |
| Cache | `s-maxage=300, stale-while-revalidate=600` |

**Query params:** `interval` (daily/weekly/monthly), `startDate`, `endDate`, `channel` (CSV), `cmg` (CSV), `agent` (CSV), `conversion` (all/converted/not_converted).

Returns: `kpi` (with comparison deltas vs prior period), `by_period[]` (trend), `recent_orders[]`, `options` (CMG/agent lists), `months[]`.

---

### GET `/api/data/telesales`

| Item | Value |
|------|-------|
| Auth | `withAuth` |
| DB tables | `leads`, `telesales_calls`, `sales_hoc_orders`, `mart_telesales_orders` |
| Cache | `s-maxage=300, stale-while-revalidate=600` |

**Query params:** `startDate`, `endDate`, `channel` (CSV), `cmg` (CSV), `agent` (CSV).

Returns: `summary` (aggregate KPIs), `by_agent[]` (leaderboard), `by_period[]` (daily trend), `by_tier_status[]` (call status breakdown by tier), `options`, `months[]`.

---

### GET `/api/data/incentives`

| Item | Value |
|------|-------|
| Auth | `withAuth` |
| DB tables | `incentives`, `costs`, `agent_headcount`, `mart_performance` |
| Cache | `s-maxage=300, stale-while-revalidate=600` |

No query params. Returns: `incentive_tiers[]`, `headcount_costs[]`, `monthly_summary[]`.

---

### GET `/api/data/dashboard`

| Item | Value |
|------|-------|
| Auth | `withAuth` |
| DB tables | All source tables + `upload_batches` |
| Cache | no-store (real-time status) |

Returns: `status` object (row counts, date ranges, last upload per table), `history[]` (upload batch log).

---

### GET `/api/data/mart-status`

| Item | Value |
|------|-------|
| Auth | `withAuth` |
| DB tables | `mart_telesales_orders`, `mart_performance` |
| Cache | `s-maxage=300, stale-while-revalidate=600` |

Returns row counts, date ranges, and `last_refreshed` timestamps for both mart tables.

---

### POST `/api/data/pivot`

| Item | Value |
|------|-------|
| Auth | `withAuth` |
| DB tables | `sales_hoc_orders`, `products` |
| Cache | none (POST, dynamic) |

Body: `{ granularity, columns[], filters{}, format }`. Returns JSON preview or streams CSV/XLSX file for download.

---

## Shared UI Patterns

### KpiCard

`src/components/dashboard/KpiCard.tsx`

Props: `title`, `value`, `subtitle`, `icon`, `tooltip`, `valueClassName`, `comparison` (ratio), `comparisonLabel`, `comparisonTooltip`, `extras[]`.

- `tooltip` renders an `<Info>` icon that shows a `<TooltipContent>` on hover.
- `comparison` renders a color-coded `%` badge (green ≥ 0, red < 0).

### DataTable

`src/components/ui/data-table.tsx` — TanStack Table v8 wrapper.

Props include `manualPagination?: boolean`. When `true`:
- Internal `pageSize` is set to 10,000 (show all rows).
- `DataTablePagination` is hidden (parent owns pagination UI).

Used on Leads page where server-side pagination controls apply.

### MultiSelect

`src/components/dashboard/MultiSelect.tsx` — dropdown checkbox list. Emits `string[]` via `onChange`.

### FilterBar

`src/components/dashboard/FilterBar.tsx` — horizontal filter row with a **Clear** button shown when `hasFilter` is true.

---

## Page Designs

---

### Overview `/overview`

**Auth:** any logged-in user  
**Data source:** `GET /api/data/overview` → client-side aggregation  
**Filtering:** 100% client-side (no re-fetch on filter change)

#### Filters

| Filter | Options | Applied to |
|--------|---------|------------|
| From month | Distinct months ASC | `row.month >= value` |
| To month | Distinct months ASC | `row.month <= value` |
| Lead Customers | All + distinct values | exact match |
| Dynamic CMG | All + distinct values | exact match |

Filters affect both KPI cards and all charts.

#### KPI Cards (6)

| # | Title | Value | Subtitle | Color |
|---|-------|-------|---------|-------|
| 1 | HOC Sales | `SUM(hoc_sales)` | `Target ฿X` | — |
| 2 | Achievement | `hoc_sales / sales_target × 100`% | Target met / Below target | ≥100% green, ≥80% yellow, <80% red |
| 3 | New Customers | `SUM(new_customers)` | "HOC new customers" | — |
| 4 | Retention | `SUM(retention)` | "HOC repeat customers" | — |
| 5 | Total Calls | `SUM(total_calls)` deduped by (month, lead) | `Reached X` | — |
| 6 | ROI | `SUM(actual_sales) / (SUM(total_incentive) + SUM(total_agent_cost))` | "Sales HOC / Total expense" | ≥10× green, ≥5× yellow, <5× red |

All values computed from filtered + de-duplicated dataset.

#### Charts

**Chart A — HOC Sales vs Target (full width)**
- Type: `ComposedChart` (Recharts)
- Bars: HOC Sales (blue `#3b82f6`), Target (gray `#e2e8f0`)
- Line: Achievement % (amber `#f59e0b`, right Y-axis, 0–150%)

**Chart B — New vs Retention (half width, left)**
- Type: `BarChart` stacked
- Bar 1 bottom: New Customers (green `#22c55e`)
- Bar 2 top: Retention (blue `#3b82f6`, `stackId="a"`)

**Chart C — ROI Trend (half width, right)**
- Type: `LineChart`
- Line: ROI × (purple `#8b5cf6`), dot radius 4
- Formula per month: `SUM(actual_sales, deduped by cmg) / (SUM(total_incentive) + SUM(total_agent_cost, deduped by month))`

#### Detail Table

One row per `(month, lead_customers, dynamic_cmg)` from filtered data.

| Column | Field | Format |
|--------|-------|--------|
| Month | `month_label` | text |
| Lead | `lead_customers` | muted |
| CMG | `dynamic_cmg` | muted |
| HOC Sales | `hoc_sales` | ฿M/K |
| Target | `sales_target` | ฿M/K, muted |
| Achievement | `achievement_ratio × 100` | Badge green/yellow/red |
| New | `new_customers` | int |
| Retention | `retention` | int |
| ROI | `roi` | `Nx` or `—` |

---

### Leads `/leads`

**Auth:** Admin only (API: `withAdmin`)  
**Data sources:**
- `GET /api/data/leads/summary` — global KPIs + filter options (cached 5 min)
- `GET /api/data/leads` — paginated, filtered table data (cached 1 min)

#### KPI Cards (4) — global, not affected by filters

| # | Title | Definition | Tooltip |
|---|-------|-----------|---------|
| 1 | Total Leads | `COUNT(*)` from `leads` | "Total MMIDs assigned to the telesales team as leads." |
| 2 | Contacted | MMIDs with `first_connected_date IS NOT NULL` in `telesales_calls` (reached + called_not_reached) | "MMIDs that have been called at least once — includes both Reached and Called Not Reached." |
| 3 | Conversion | Unique MMIDs with `is_converted = true` (≥1 HOC order) | "Unique MMIDs with at least one HOC order (new_customer or retention)." |
| 4 | Orders | `SUM(hoc_orders)` for converted MMIDs only | "Total HOC orders placed by converted MMIDs only. Non-converted leads are excluded." |

#### Filters — table only, KPI cards remain global

| Filter | Values | Param |
|--------|--------|-------|
| Tier | from `leads.lead_customers` | `tier` |
| Contact | Reached / Not Reached / Not Called | `contact` |
| Conversion | Converted / Not Converted / No Order | `conv` |
| CMG | from `sales_hoc_orders.dynamic_cmg` | `cmg` |
| Agent | from `telesales_calls.agent` | `agent` |
| Search | MMID or customer name (server-side ILIKE) | `search` |

#### Table Columns

| Column | Field | Notes |
|--------|-------|-------|
| MMID | `mmid` | mono font |
| Customer Name | `cust_name` | — |
| Tier | `lead_customers` | — |
| CMG | `dynamic_cmg` | from HOC orders |
| Agent | `agent` | MAX agent per mmid in CTE |
| Contact | `contact_status` | Badge: Reached (green) / Not Reached (yellow) / Not Called (slate) |
| Conversion | `conversion_status` | Badge: Converted (blue) / Not Converted (orange) / No Order (slate) |
| Orders | `hoc_orders` | int, `—` if 0 |
| HOC Sales | `hoc_sales` | ฿ formatted |

#### Pagination

Server-side. Default 500 rows/page, max 500. Footer: `{total} results · page X of Y` with Prev/Next buttons. DataTable uses `manualPagination=true` to suppress client-side pagination.

---

### Sales `/sales`

**Auth:** any logged-in user  
**Data source:** `GET /api/data/sales`

#### KPI Cards (4)

| # | Title | Formula | Notes |
|---|-------|---------|-------|
| 1 | Total Sales | `SUM(sales_in_vat)` | Includes all customer types by default |
| 2 | Avg Order Value | `total_sales / total_orders` | — |
| 3 | New Customers | `COUNT(DISTINCT mmid)` where `customer_type = 'new_customer'` | — |
| 4 | Retention | `COUNT(DISTINCT mmid)` where `customer_type = 'retention'` | — |

All cards show a comparison delta (`%`) vs prior period when a date range is set.

#### Filters — affect KPI + charts

| Filter | Values |
|--------|--------|
| Date range | Month chips OR custom `DateRangePicker`; custom range sets `interval=daily` |
| Channel | Online / Offline (MultiSelect) |
| CMG | Dynamic CMG (MultiSelect) |
| Agent | Agent name (MultiSelect) |
| Conversion | All / Converted Only / Not Converted |

#### Charts

**Sales Trend (AreaChart)**
- Interval: daily (custom range), weekly (multi-month), monthly (single month)
- Series: Online (blue) + Offline (red) stacked areas
- Tooltip: breakdown per channel

**Channel Distribution (stacked bar)**
- Shows online % vs offline % with absolute amounts

#### Table

Recent telesales orders — client-side search on MMID. Not paginated (fixed recent window).

---

### Products `/products`

**Auth:** any logged-in user  
**Data sources:**
- `GET /api/data/products` — all data (cached 5 min)
- `GET /api/data/products/options` — filter dropdown options (cached 1 hour)

#### KPI Cards (4)

| # | Title | Value |
|---|-------|-------|
| 1 | Total Telesales Revenue | `SUM(sales_in_vat)` filtered |
| 2 | Avg Order Value | `total_sales / total_orders` |
| 3 | Total Qty Sold | `SUM(quantity)` |
| 4 | Active SKUs | `COUNT(DISTINCT prod_num)` with sales |

Affected by all filters.

#### Filters — affect KPI + charts + all tables

| Filter | Condition |
|--------|-----------|
| Date range | Month chips (`startDate` / `endDate`) |
| Brand | `m.brands = ANY($n)` |
| Class | `m.class_name = ANY($n)` |
| Subclass | `m.subclass = ANY($n)` |
| Senior Buyer | subquery on `products.senior_buyer_name` |
| Buyer | subquery on `products.buyer_name` |

Subquery pattern used for Senior Buyer / Buyer to avoid JOIN dependency in brand-only queries.

#### Charts

**Revenue Trend by Brand (LineChart)**
- Top 5 brands by sales + "Other" (dashed gray)
- X: Month label, Y: Revenue (฿)

#### Tables (Tabs)

**Tab 1: Top SKUs**
- Columns: Prod #, Brand, Name (TH), Qty, Sales, New Customers, Retention, % of Total, is_hoc badge
- Client-side search

**Tab 2: New vs Retention**
- Columns: Prod #, Brand, Name (TH), New, Retention, New %, Segment
- Segment classification: New Customer Driver (new ≥ 70%), Retention Driver (retention ≥ 70%), Mixed (30–70%)
- Segment dropdown filter

**Tab 3: By Brand**
- Columns: Brand, SKUs, Qty, Revenue, Online (฿ + %), Offline (฿ + %), Channel Mix bar, % of Total

---

### Telesales `/telesales`

**Auth:** any logged-in user  
**Data source:** `GET /api/data/telesales`

#### KPI Cards (4)

| # | Title | Formula | Color |
|---|-------|---------|-------|
| 1 | Total Leads | All MMIDs in DB | — |
| 2 | Connected Rate | `reached / total_calls` | ≥30% green, ≥15% yellow, <15% red |
| 3 | Conversion Rate | `total_converted / total_calls` | ≥8% green, ≥4% yellow, <4% red |
| 4 | Orders | `new_converted + repeat_converted` | subtitle: `New: X · Repeat: Y` |

Affected by all filters.

#### Filters — affect KPI + all charts

| Filter |
|--------|
| Date range (month chips + custom DateRangePicker) |
| Channel (MultiSelect) |
| CMG (MultiSelect) |
| Agent (MultiSelect) |

#### Charts

**Daily Calling Trend (AreaChart, 3-col)**
- Series: Calls (blue) + Conversion count (green) stacked areas

**Call Status by Tier (horizontal BarChart, 3-col)**
- Y-axis: Tier name, X-axis: % (0–100%)
- Stacked bars: top 4 call statuses + "Other"

**Conversion Funnel**
- Custom waterfall: All Leads → Contacted → Engaged → Converted
- Shows counts and drop-off % at each stage

#### Table: Agent Leaderboard

| Column |
|--------|
| Agent, Total Calls, Reached, Not Reached, Reach Rate, Conversion Rate, Calls/Day |

Sortable, no pagination.

---

### Incentives `/incentives`

**Auth:** any logged-in user  
**Data source:** `GET /api/data/incentives` (no filters)

#### KPI Cards (2)

| # | Title | Formula |
|---|-------|---------|
| 1 | Total Incentives Paid | `SUM(total_incentive)` all months |
| 2 | Overall Program ROI | `SUM(hoc_sales) / (SUM(total_incentive) + SUM(total_agent_cost))` |

#### Chart

**Monthly Incentives vs ROI (ComposedChart)**
- Bar: Incentive amount (blue, left Y)
- Line: ROI × (red, right Y)

#### Tables (Tabs)

**Tab 1: Monthly Incentive Summary**
- Columns: Month, Achievement %, Incentive/Head, Total Incentives, ROI

**Tab 2: Incentive Tier Configuration**
- Columns: Achievement Tier (%), Incentive Per Head (฿)
- Read-only — shows uploaded tier rules

---

### Data Hub `/data-hub`

**Auth:** Admin only (server-side redirect for non-admin)

#### Sections

**Upload Raw CSV**
- File type selector: Online Sales / Offline Sales / Leads / Products / Telesales / Targets / Costs / Incentives / Agent Headcount
- Drag-and-drop or file picker; batch up to 4 concurrent
- Header validation, first-row preview
- Shows target table and storage location

**Upload Jobs Progress**
- Live queue: filename, size, status (queued/uploading/done/failed), progress %, error detail

**Overview Tab**
- 4 status cards (Online Sales, Offline Sales, Telesales, Targets & SKUs): row count, sales, date range, last upload, ready/empty badge

**Data Status Tab**
- 8 sources with row counts, ranges, last upload timestamps

**History Tab**
- Upload batch log: Date, File Type, Filename, Uploaded By, Rows, Errors, Status badge
- Searchable by filename

**Build Mart Tab**
- Current mart row counts + last refresh time
- Attribution window selector: 14 / 30 / 90 / Custom days
- **Build Tables** button — rebuilds `mart_telesales_orders` and `mart_performance`
- Live progress timer, success/fail banner with row counts

---

### Exports `/exports`

**Auth:** Admin only (server-side redirect)

#### Sections

**Granularity selector:** Month / Week / Day / Order Line

**Filters:** Date range, CMG, Channel, Customer Type

**Columns Panel (left)**
- Key columns always included
- Checkboxes for optional breakdowns and metrics

**Preview Panel (right)**
- Live table (up to 500 rows aggregated, 100k raw)
- Export: CSV (500k max) or XLSX (100k raw / 500k aggregated) — streams as file attachment

---

## File Reference

| File | Role |
|------|------|
| `src/lib/auth.ts` | `withAuth` / `withAdmin` wrappers |
| `src/lib/db/index.ts` | PostgreSQL pool — `query`, `queryOne`, `queryCount` |
| `src/lib/formatters.ts` | `fmtBaht`, `fmtPct`, number helpers |
| `src/components/dashboard/KpiCard.tsx` | KPI card with tooltip, comparison badge |
| `src/components/dashboard/KpiGrid.tsx` | Responsive KPI grid layout |
| `src/components/dashboard/FilterBar.tsx` | Filter row with Clear button |
| `src/components/dashboard/MultiSelect.tsx` | Multi-checkbox dropdown |
| `src/components/ui/data-table.tsx` | TanStack Table wrapper — supports `manualPagination` |
| `src/app/api/data/overview/route.ts` | Overview data endpoint |
| `src/app/api/data/leads/route.ts` | Leads paginated table endpoint |
| `src/app/api/data/leads/summary/route.ts` | Leads global KPIs + filter options |
| `src/app/api/data/products/route.ts` | Products data + KPIs |
| `src/app/api/data/products/options/route.ts` | Products filter dropdown options |
| `src/app/api/data/sales/route.ts` | Sales data + comparison KPIs |
| `src/app/api/data/telesales/route.ts` | Telesales performance data |
| `src/app/api/data/incentives/route.ts` | Incentive payout data |
| `src/app/api/data/dashboard/route.ts` | Data Hub status + history |
| `src/app/api/data/mart-status/route.ts` | Mart table status |
| `src/app/api/data/pivot/route.ts` | Exports pivot query + file stream |
