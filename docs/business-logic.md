# Business Logic Reference
> Dashboard Unilever — Single source of truth for all business rules, metric definitions, and data flow.
> Last derived from codebase: 2026-06-16

---

## 1. Data Sources & Flow

```
Raw Input (uploaded via Data Hub or GAS sync)
    │
    ├─ online_sales         — online orders (CSV upload)
    ├─ offline_sales        — offline orders (CSV upload)
    ├─ products             — product master + HOC flag (CSV upload)
    ├─ telesales_calls      — one row per customer, last call status (GAS sync)
    ├─ leads                — lead list (CSV upload)
    ├─ targets              — monthly sales targets per CMG (CSV upload)
    ├─ costs                — monthly agent/supervisor cost (CSV upload)
    ├─ incentives           — incentive tier table (CSV upload)
    └─ agent_headcount      — monthly agent/supervisor headcount (CSV upload)
           │
           ▼ (Build Mart)
    ├─ sales_hoc_orders        — HOC orders only + attribution logic + customer_type
    ├─ mart_performance_cmg    — aggregated KPIs by month × CMG
    └─ mart_performance_month  — aggregated KPIs by month (cost, ROI, incentive)
           │
           ▼ (Dashboard pages query mart tables)
    Overview / Sales / Telesales / Products / Incentives / Leads
```

---

## 2. Core Concepts

### 2.1 MMID
- Unique customer identifier — 14-digit zero-padded string (e.g. `00000123456789`)
- Primary key of `telesales_calls` and `leads` tables
- Used to JOIN all tables together

### 2.2 HOC (Home & Office Channel)
- Definition: an order is HOC if the product has `product_name_en IS NOT NULL` in the `products` table
- Stored as `is_hoc_unilever = TRUE` in mart tables
- **Only HOC orders appear in `sales_hoc_orders`** — the primary analysis table

### 2.3 Channel
- `online` — from `online_sales` table
- `offline` — from `offline_sales` table

### 2.4 CMG (Customer Management Group)
Two CMG columns exist in the mart — they are NOT interchangeable:

| Column | Meaning | Use when |
|---|---|---|
| `dynamic_cmg` | The segment tag on the individual **order** | Counting sales amounts, channel breakdown |
| `primary_cmg` | The **customer-level** dominant CMG | Counting unique customers (new/retention) per segment |

**Priority rule for `primary_cmg`** (assigned per mmid):
```
1. FOOD RETAILER  (highest priority)
2. HORECA
3. END USER
4. Otherwise: MAX(dynamic_cmg) from all their orders
```

This ensures each customer is counted in exactly one segment — prevents double-counting when customers have orders across multiple CMGs.

---

## 3. Attribution Window

The attribution window determines whether a telesales call "gets credit" for an order.

**Rule:** An order is attributed to telesales if:
```
order_date >= first_connected_date
AND
order_date <= first_connected_date + attributionDays
```

Default `attributionDays` = **14 days** (configurable at build time).

### 3.1 customer_type Assignment

Every row in `sales_hoc_orders` has a `customer_type`:

```sql
CASE
  WHEN days_to_order > attributionDays AND order_date = first_order_date
    THEN 'first_order_not_converted'
  WHEN days_to_order > attributionDays
    THEN 'retention_not_converted'
  WHEN order_date = first_order_date
    THEN 'new_customer'
  ELSE
    'retention'
END
```

| customer_type | Meaning | Counts toward KPIs? |
|---|---|---|
| `new_customer` | First-ever HOC order + within window | ✅ Yes |
| `retention` | Repeat HOC order + within window | ✅ Yes |
| `first_order_not_converted` | First-ever order + outside window | ❌ No |
| `retention_not_converted` | Repeat order + outside window | ❌ No |

**"Converted" = `customer_type IN ('new_customer', 'retention')`**  
(see `src/lib/metrics.ts` → `CONV`)

### 3.2 Data Quality Notes
- A customer can have `first_order_not_converted` OR `new_customer` — never both (validated: conflict = 0)
- A customer may have multiple orders on the same `first_order_date` (same-day multi-order) — this is not a bug (validated: 294 cases)
- Always use `COUNT(DISTINCT mmid)` to count customers, never `COUNT(*)`

---

## 4. Metric Definitions

All SQL fragments are in `src/lib/metrics.ts`. Import from there — do not hardcode.

### 4.1 Converted
```sql
customer_type IN ('new_customer', 'retention')
```
Orders/customers that count as telesales-attributed successes.

### 4.2 Not Converted
```sql
customer_type IN ('first_order_not_converted', 'retention_not_converted')
```
Orders that exist but are outside the attribution window.

### 4.3 Reached (ติดต่อได้)
A call is "reached" if the customer picked up and a conversation occurred.
Only truly unreachable outcomes are excluded — statuses where no contact was made at all.

**Excluded (NOT reached — customer did NOT answer):**
```
ไม่รับสาย*              — no answer (all variants, wildcard match)
ปิดเครื่อง/ติดต่อไม่ได้  — phone off / unreachable
```

**Included as Reached (customer DID answer, conversation occurred):**
```
ไม่สะดวกคุย             — not convenient to talk right now
ยังไม่ต้องการสินค้า      — not ready to buy yet
(all other statuses)     — normal outcomes
```

SQL fragment (`src/lib/metrics.ts` → `REACHED`):
```sql
call_status NOT LIKE 'ไม่รับสาย%'
AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
```

`ไม่สะดวกคุย` and `ยังไม่ต้องการสินค้า` count as Reached because the customer answered — they are distinguished at the **Interested** stage instead.

### 4.4 Interested
A reached customer who did not explicitly decline to engage.

**Excluded from Interested (Reached but NOT Interested):**
```
ไม่สะดวกคุย             — customer answered but was not convenient to talk
ยังไม่ต้องการสินค้า      — customer answered but is not ready to buy yet
```

SQL fragment (applied in addition to REACHED):
```sql
call_status NOT IN ('ไม่สะดวกคุย', 'ยังไม่ต้องการสินค้า')
```

This creates the Conversion Funnel boundary:
```
Total Calls → [drop: Not Reached] → Reached → [drop: Not Interested] → Interested → [drop: Not Converted] → Converted
```

### 4.5 New Customer
```sql
customer_type = 'new_customer'
```
Customer whose first-ever HOC order falls within the attribution window.

### 4.6 Retention (Repeat Customer)
```sql
customer_type = 'retention'
```
Customer who reordered HOC products within the attribution window.

### 4.7 Conversion Rate
```
Converted Customers ÷ Total Leads Called
```

### 4.7 Reach Rate
```
Reached Calls ÷ Total Calls Made
```

### 4.8 ROI
```
HOC Sales (incentive-eligible) ÷ Total Program Expense
```
Where `Total Program Expense = total_incentive + total_agent_cost`.

> Note: ROI is always month-level and is NOT affected by CMG or channel filters — program costs are shared across all segments.

---

## 5. Incentive Rules

### 5.1 Incentive Eligibility by CMG

| Period | CMGs counted toward incentive |
|---|---|
| Before May 2026 | All CMGs (including DISTRIBUTOR) |
| May 2026 onward | FOOD RETAILER, HORECA, END USER only (DISTRIBUTOR excluded) |

SQL:
```sql
WHERE month < '2026-05-01'
   OR dynamic_cmg IN ('FOOD RETAILER', 'HORECA', 'END USER')
```

### 5.2 Incentive Per Head
Looked up from the `incentives` table using the agent tier.  
`total_incentive = agent_count × incentive_per_head`

### 5.3 Total Program Expense
```
total_expense = total_incentive
              + (agent_count × cost_per_agent)
              + (supervisor_count × cost_per_supervisor)
```

---

## 6. Dashboard Pages & What They Show

| Page | Route | Primary Question | Key Tables |
|---|---|---|---|
| Dashboard | `/dashboard` | Sales KPIs, telesales trend, agent leaderboard | `sales_hoc_orders`, `telesales_calls`, `mart_performance_cmg` |
| Order Sales | `/dashboard/sales` | HOC sales trend, online/offline split, products | `sales_hoc_orders`, `mart_performance_cmg` |
| Telesales | `/dashboard/telesales` | Reach rate, conversion funnel, agent performance | `telesales_calls`, `sales_hoc_orders` |
| Leads | `/leads` | Who are the leads? Contact/conversion status? | `leads`, `telesales_calls`, `sales_hoc_orders` |
| Raw Data | `/raw-data` | Browse any source table | all source tables |
| Data Hub | `/data-hub` | Upload data, build mart, recover from backup | all tables |

---

## 7. Filtering Rules

### 7.1 Date Filter (most pages)
- Filters on `order_date` (sales pages) or `first_connected_date` (telesales pages)
- Default: **full available range** — auto-selected on first data load; persisted to `localStorage` across sessions
- Range: click start month → click end month (chip UI)

### 7.2 CMG Filter
- Filters on `dynamic_cmg` for sales amounts
- Filters on `primary_cmg` for customer counts (to avoid double-counting)
- CMG options: FOOD RETAILER, HORECA, END USER, DISTRIBUTOR (+ "No Segment")

### 7.3 Channel Filter
- `online` / `offline` / both

### 7.4 Converted Scoping (Telesales page)
When a date range filter is active, the Converted count in the Conversion Funnel is scoped:
only `sales_hoc_orders` rows where `order_date >= telesales_calls.first_connected_date` for
that customer are counted. This prevents historical conversions (from data periods before the
selected range) from inflating the count.

When no date filter is active (all-time view): no order_date restriction is applied.

---

## 8. Database Tables Reference

### Transactional (source data)

| Table | PK | Purpose |
|---|---|---|
| `online_sales` | `id` UUID | Online orders from e-commerce |
| `offline_sales` | `id` UUID | Offline orders from field sales |
| `leads` | `mmid` | Lead list with customer name and contact info |
| `products` | `prod_num` | Product master — includes HOC flag, brands, buyer info |
| `telesales_calls` | `mmid` | One row per customer — latest call status and date |
| `targets` | `(month, dynamic_cmg)` | Monthly sales targets per CMG |
| `costs` | `month` | Monthly agent/supervisor cost rates |
| `incentives` | `tier` | Incentive per head by tier |
| `agent_headcount` | `month` | Monthly agent and supervisor count |
| `upload_batches` | `id` UUID | Audit trail for all file uploads |

### Mart (built by Build Mart)

| Table | Grain | Purpose |
|---|---|---|
| `mmid_cmg_map` | `mmid` | Tiny lookup: mmid → primary_cmg + first_connected_date |
| `sales_hoc_orders` | `(mmid, order_number, prod_num)` | HOC-attributed orders with customer_type |
| `mart_performance_cmg` | `(month, dynamic_cmg)` | Aggregated KPIs at month × CMG grain |
| `mart_performance_month` | `month` | Month-level costs, incentive, ROI |
| `mart_builds` | `id` | Build audit log — status, duration_ms, row_counts |

> `mart_telesales_orders` was removed (2026-06-15). Replaced by `mmid_cmg_map` (3-col lookup) + `sales_hoc_orders` built directly from source tables in a single CTE chain.

---

## 9. GAS Sync (Telesales Data Ingestion)

Google Apps Script reads from Google Sheets and POSTs to the API.

**Sync logic:**
1. GET `/api/data/ingest/threshold` → returns `MAX(first_connected_date)` from DB
2. Subtract 3 days from threshold (safety buffer for late-arriving data)
3. Filter sheet rows: `first_connected_date > threshold`
4. POST `/api/data/ingest/telesales-activity` with filtered records

**Schema mapping:**
- `schema_map` tab in the spreadsheet maps Thai column headers → target field names
- GAS normalizes headers (lowercase, no spaces) before lookup
- Records with no valid `mmid` are skipped (`hasCoreData = false`)

**MMID cleaning:** strips non-digits, rejects if > 14 digits, zero-pads to 14 digits  
**Mobile cleaning:** strips non-digits, accepts 9 or 10 digits, zero-pads to 10

**Payload chunking:** GAS sends records in batches of 1,000 per HTTP POST to avoid
Vercel's ~4.5 MB payload limit (413 FUNCTION_PAYLOAD_TOO_LARGE). The API upserts in
further sub-chunks of 500 rows to CockroachDB.

---

## 10. Roles & Permissions

| Role | Access |
|---|---|
| `admin` | All pages including Leads, Raw Data, Data Hub + all API routes |
| `viewer` | Dashboard, Sales, Telesales only |
| Unauthenticated | Redirected to `/login` |
| GAS (Bearer token) | `/api/data/ingest/*` only |

---

## 11. Change Log (Business Logic)

| Date | Change | Impact |
|---|---|---|
| 2026-05-01 | Incentive eligibility: DISTRIBUTOR excluded from May 2026 onward | Incentives page, ROI calculation |
| 2026-06-12 | Metric Layer created (`src/lib/metrics.ts`) | All routes now import CONV, NOT_CONV, REACHED, reachedCond() — single source of truth |
| 2026-06-12 | REACHED defined as 2-condition (excludes only ไม่รับสาย + ปิดเครื่อง); ไม่สะดวกคุย and ยังไม่ต้องการสินค้า count as Reached | Telesales Conversion Funnel: Reached → Interested → Converted stages |
| 2026-06-15 | `mart_telesales_orders` replaced by `mmid_cmg_map` + `sales_hoc_orders` | Faster build, less storage, single CTE chain |
| 2026-06-15 | Clerk auth restored — middleware, register, webhook | Users can now log in and register via invite code |
| 2026-06-16 | Telesales Converted scoped to post-call orders when date filter active | Prevents historical conversions inflating period-filtered Converted count |
| 2026-06-16 | GAS postToAPI_ chunked to 1,000 records/request | Fixes 413 FUNCTION_PAYLOAD_TOO_LARGE for large datasets |
| 2026-06-16 | Channel Breakdown on Sales page uses converted_online/offline only | Metric consistency — all Sales page metrics now show converted data |
| 2026-06-16 | useLocalState hook added — localStorage filter persistence | Filters persist across browser sessions |
