# Overview Dashboard — Design Specification

## Purpose
Provide a single-page operational summary of the HOC Unilever telesales program.
Primary audience: campaign managers and supervisors who need a quick read on
monthly sales performance, customer acquisition, and cost efficiency.

---

## Data Source

| Item | Value |
|------|-------|
| Primary table | `mart_performance` (Gold mart, built on demand) |
| API endpoint | `GET /api/data/overview` |
| Row granularity | 1 row per `(month, lead_customers, dynamic_cmg)` |
| Caching | Vercel Edge — `s-maxage=300, stale-while-revalidate=600` (5-min CDN cache) |
| Client cache | SWR `dedupingInterval: 300 000 ms` — no re-fetch on tab switch |
| Refresh trigger | Manual — user clicks **Build Mart** in Data Hub |

### mart_performance — full field reference

| Field | Type | Source / Calculation |
|-------|------|----------------------|
| `month` | DATE | `DATE_TRUNC('month', order_date)` from `mart_telesales_orders` |
| `lead_customers` | TEXT | from `telesales_calls.lead_customers` |
| `dynamic_cmg` | TEXT | from `sales_hoc_all.dynamic_cmg` |
| `total_calls` | INT | `COUNT(*)` from `telesales_calls` for the month × lead tier |
| `reached` | INT | `COUNT(*) FILTER (WHERE call_status = 'รับสาย')` |
| `ordered` | INT | `COUNT(DISTINCT mmid)` where `customer_type IN ('new_customer','retention')` |
| `new_customers` | INT | `COUNT(DISTINCT mmid)` where `customer_type = 'new_customer'` |
| `retention` | INT | `COUNT(DISTINCT mmid)` where `customer_type = 'retention'` |
| `hoc_orders` | INT | `COUNT(DISTINCT order_number)` where `customer_type IN ('new_customer','retention')` |
| `hoc_sales` | NUMERIC | `SUM(sales_in_vat)` from `mart_telesales_orders` — telesales-attributed HOC orders only |
| `actual_sales` | NUMERIC | `SUM(sales_in_vat)` from `sales_hoc_all` — ALL HOC Unilever sales for the CMG/month (not telesales-only) |
| `sales_target` | NUMERIC | from `targets` table (uploaded CSV) per `(month, dynamic_cmg)` |
| `achievement_ratio` | NUMERIC | `actual_sales / sales_target` — decimal e.g. `0.85` = 85% |
| `incentive_per_head` | NUMERIC | from `incentives` table — looked up by `LATERAL JOIN` where `tier <= achievement_ratio` |
| `total_incentive` | NUMERIC | `ordered × incentive_per_head` |
| `cost_per_agent` | NUMERIC | from `costs` table per month |
| `cost_per_supervisor` | NUMERIC | from `costs` table per month |
| `supervisor_count` | INT | from `agent_headcount` table per month |
| `agent_count` | INT | from `agent_headcount` table per month |
| `total_agent_cost` | NUMERIC | `(supervisor_count × cost_per_supervisor) + (agent_count × cost_per_agent)` |
| `total_expense` | NUMERIC | `total_incentive + total_agent_cost` |
| `roi` | NUMERIC | `ROUND(actual_sales / NULLIF(total_expense, 0), 2)` — multiplier e.g. `23.55` = 23.55× |

### HOC Unilever definition
`sales_hoc_all` is a UNION ALL view of `online_sales` and `offline_sales`,
INNER JOINed with `products WHERE product_name_en IS NOT NULL`.
Only SKUs mapped as HOC Unilever products are included.

### Attribution window (customer_type logic)
```
new_customer              order_date within attribution_days of first_connected_date + is first-ever order
retention                 order_date within attribution_days + not first-ever order
first_order_not_converted first-ever order but outside attribution window
retention_not_converted   repeat order but outside attribution window
```
Default `attribution_days = 14`. Only `new_customer` and `retention` rows
are counted in `hoc_sales`, `ordered`, `new_customers`, `retention`.

### Aggregation rules (cross-join duplication)
`mart_performance` is built from a cross join of `dynamic_cmg × lead_customers` per month.
Some fields are duplicated across that join and must be de-duplicated before summing:

| Fields | Granularity in DB | Correct aggregation |
|--------|-------------------|---------------------|
| `hoc_sales`, `new_customers`, `retention`, `ordered`, `hoc_orders`, `total_incentive` | Unique per `(month, dynamic_cmg, lead_customers)` | `SUM` directly |
| `actual_sales`, `sales_target`, `achievement_ratio` | Per `(month, dynamic_cmg)` — repeated for each `lead_customers` | De-dup by `(month, dynamic_cmg)` then `SUM` |
| `total_calls`, `reached` | Per `(month, lead_customers)` — repeated for each `dynamic_cmg` | De-dup by `(month, lead_customers)` then `SUM` |
| `total_agent_cost`, `cost_per_agent`, `supervisor_count` etc. | Per `(month)` — repeated for every row | De-dup by `month` then `SUM` |

`ROI` and `achievement %` are always **recomputed** from the de-duplicated sums,
never averaged from individual row values.

---

## Section 1 — Filters

Position: top of page, horizontal row of Select dropdowns.
All filtering is **client-side** (no additional API calls).

| Filter | Options | Applied to |
|--------|---------|------------|
| From month | Distinct months from data, sorted ASC | `row.month >= value` |
| To month | Distinct months from data, sorted ASC | `row.month <= value` |
| Lead Customers | `"All"` + distinct `lead_customers` values from data | exact match |
| Dynamic CMG | `"All"` + distinct `dynamic_cmg` values from data | exact match |

A **Clear filters** link appears when any filter is active.

---

## Section 2 — KPI Cards

Position: below filters.
Layout: 4-column grid (responsive: 2-col on mobile, 3-col on tablet).
All values are computed from the **filtered + de-duplicated** dataset.

| # | Card title | Primary value | Sub-text | Color rule |
|---|-----------|---------------|----------|------------|
| 1 | **HOC Sales** | `SUM(hoc_sales)` formatted as ฿M/K | `"Target ฿X"` — `SUM(sales_target)` deduped by (month, cmg) | none |
| 2 | **Achievement** | `SUM(hoc_sales) / SUM(sales_target) × 100` % (1 dp) | `"Target met ✓"` or `"Below target"` | green ≥ 100%, yellow ≥ 80%, red < 80% |
| 3 | **New Customers** | `SUM(new_customers)` | `"HOC new customers"` | none |
| 4 | **Retention** | `SUM(retention)` | `"HOC repeat customers"` | none |
| 5 | **Total Calls** | `SUM(total_calls)` deduped by (month, lead) | `"Reached X"` — reached count | none |
| 6 | **ROI** | `SUM(actual_sales) / (SUM(total_incentive) + SUM(total_agent_cost))` (2 dp) + `"x"` | `"Sales HOC / Total expense"` | green ≥ 10×, yellow ≥ 5×, red < 5× |

---

## Section 3 — Charts

All charts share the **same SWR-fetched dataset** — no separate API calls.
X-axis label uses `month_label` (English month name, e.g. "May") computed via
`TO_CHAR(month, 'FMMonth')` in the API query.

---

### Chart A — HOC Sales vs Target (Monthly)

- **Chart type:** `ComposedChart` — two Bars + one Line (Recharts v2)
- **Purpose:** Show monthly HOC telesales revenue against target and the achievement trend
- **X axis:** `month_label` (one tick per month)
- **Y axis left:** Sales in THB — formatted with `฿M` / `฿K` suffix
- **Y axis right:** Achievement % (0–150%)
- **Series:**
  - Bar 1 — **HOC Sales** (`hoc_sales`) — blue `#3b82f6`
  - Bar 2 — **Target** (`sales_target`) — light gray `#e2e8f0`
  - Line — **Achievement %** (`hoc_sales / sales_target × 100`) — amber `#f59e0b`, right Y axis
- **Tooltip:** all three values on hover
- **Data computation:** `byMonth` array — `aggregate()` called per month group from filtered rows

---

### Chart B — New vs Retention Customers (Monthly)

- **Chart type:** `BarChart` — stacked bars (Recharts v2)
- **Purpose:** Visualize customer acquisition vs repeat-purchase split month by month
- **X axis:** `month_label`
- **Y axis:** Customer count
- **Series:**
  - Bar 1 (bottom) — **New Customers** (`new_customers`) — green `#22c55e`
  - Bar 2 (top) — **Retention** (`retention`) — blue `#3b82f6`, `stackId="a"`
- **Tooltip:** both counts on hover
- **Layout:** half-width card (left column), placed below Chart A

---

### Chart C — ROI (Monthly)

- **Chart type:** `LineChart` (Recharts v2)
- **Purpose:** Track cost efficiency trend — how many THB of HOC sales generated per 1 THB spent
- **X axis:** `month_label`
- **Y axis:** ROI multiplier, formatted as `Xx`
- **Series:**
  - Line — **ROI** — purple `#8b5cf6`, dot radius 4
- **Formula per month:** `SUM(actual_sales, deduped by cmg) / (SUM(total_incentive) + SUM(total_agent_cost, deduped by month))`
- **Tooltip:** `{value}x`
- **Layout:** half-width card (right column), placed beside Chart B

---

## Section 4 — Detail Table

Position: bottom of page, full width.
Data: raw `filtered` rows — one row per `(month, lead_customers, dynamic_cmg)`.
Sort: `month ASC` (default, from API ORDER BY).

| Column | Field | Format |
|--------|-------|--------|
| Month | `month_label` | text — e.g. "May" |
| Lead | `lead_customers` | text, muted color |
| CMG | `dynamic_cmg` | text, muted color |
| HOC Sales | `hoc_sales` | ฿ with M/K suffix |
| Target | `sales_target` | ฿ with M/K suffix, muted |
| Achievement | `achievement_ratio × 100` | Badge — green/yellow/red |
| New | `new_customers` | integer |
| Retention | `retention` | integer |
| ROI | `roi` (per-row value from DB) | `{n}x`, `—` if 0 |

> **Note:** Achievement badge uses the **per-row** `achievement_ratio` from `mart_performance`
> (which is `actual_sales / sales_target` per CMG), not the client-recomputed aggregate.

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  [From month ▼]  [To month ▼]  [Lead ▼]  [CMG ▼]  clear │
├──────────────────────────────────────────────────────────┤
│  HOC Sales   │ Achievement │ New Customers │  Retention  │
│  Total Calls │    ROI      │               │             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   Chart A — HOC Sales vs Target  (full width)            │
│   ComposedChart: Bar(HOC) + Bar(Target) + Line(Achiev%)  │
│                                                          │
├────────────────────────────┬─────────────────────────────┤
│  Chart B — New vs Retention│  Chart C — ROI              │
│  Stacked Bar               │  Line                       │
├──────────────────────────────────────────────────────────┤
│  Detail Table                                            │
│  Month │ Lead │ CMG │ HOC Sales │ Target │ % │ New │ ROI │
└──────────────────────────────────────────────────────────┘
```

---

## File Locations

| File | Role |
|------|------|
| `src/app/api/data/overview/route.ts` | GET endpoint — queries `mart_performance`, sets Cache-Control header |
| `src/app/(dashboard)/overview/_components/OverviewClient.tsx` | All UI — SWR fetch, filters, `aggregate()`, KPI cards, charts, table |
| `src/app/(dashboard)/overview/page.tsx` | Server component shell — imports OverviewClient |

---

## Planned Pages (not yet implemented)

| Route | Intended purpose |
|-------|-----------------|
| `/sales` | Sales breakdown by product, brand, channel |
| `/leads` | Lead list with call status and conversion status |
| `/products` | Product catalog performance (HOC SKUs) |
| `/telesales` | Agent-level performance and call metrics |
| `/incentives` | Incentive tier configuration and payout summary |
