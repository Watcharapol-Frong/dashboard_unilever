# Knowledge Base — Makro × Unilever HOC Telesales Dashboard

> Source of truth for all metric definitions, business rules, and dashboard guidance.
> Language: English

---

## 1. System Overview

The **HOC (Home & Office Channel) Telesales Dashboard** tracks the performance of a telesales program run by an agency on behalf of Unilever. Telesales agents call Makro customers to encourage them to purchase Unilever HOC products.

**Data flow:**
```
Agents call customers → data synced via Google Apps Script
Offline/Online orders uploaded via Data Hub (CSV)
↓
Build Mart → aggregated into dashboard tables
↓
Dashboard pages query mart tables
```

---

## 2. Core Concepts

### HOC (Home & Office Channel)
An order is **HOC** if the product has an English product name in the product master (`product_name_en IS NOT NULL`). Only HOC orders appear in the dashboard — other Makro orders are excluded.

### MMID
A **14-digit zero-padded customer identifier** (e.g., `00000123456789`). Every customer has exactly one MMID. It is the primary key linking sales orders, telesales calls, and leads.

### Channel
- **Online** — orders placed through e-commerce
- **Offline** — orders placed through field sales / counter

### CMG (Customer Management Group)
Customers are grouped into segments. Two CMG columns exist and serve different purposes:

| Column | Used For |
|---|---|
| `dynamic_cmg` | The segment tag on each individual **order** — used for sales amounts, channel breakdown |
| `primary_cmg` | The **customer-level** dominant segment — used for counting unique customers to avoid double-counting |

**Priority rule for `primary_cmg`** (assigned once per customer):
1. FOOD RETAILER (highest priority)
2. HORECA
3. END USER
4. Otherwise: the customer's most frequent CMG

CMG options: **FOOD RETAILER**, **HORECA**, **END USER**, **DISTRIBUTOR**

---

## 3. Attribution Window

The attribution window determines whether a telesales call gets credit for an order.

**Rule:** An order is attributed to telesales if:
```
order_date >= first_connected_date
AND
order_date <= first_connected_date + 14 days
```

Default: **14 days** (configurable at build time).

`first_connected_date` is the date the agent first reached (connected with) the customer.

### Customer Types
Every order in the system is tagged with one of four types:

| customer_type | Meaning | Counts as Converted? |
|---|---|---|
| `new_customer` | Customer's first-ever HOC order, placed within the attribution window | ✅ Yes |
| `retention` | Customer reordered HOC products within the attribution window | ✅ Yes |
| `first_order_not_converted` | Customer's first-ever HOC order, placed outside the attribution window | ❌ No |
| `retention_not_converted` | Customer reordered outside the attribution window | ❌ No |

**Converted = `new_customer` + `retention`**

---

## 4. Metric Definitions

### 4.1 Converted
Orders or customers where `customer_type IN ('new_customer', 'retention')`. These are telesales-attributed successes — orders that fall within the 14-day window after first contact.

### 4.2 Not Converted
Orders where `customer_type IN ('first_order_not_converted', 'retention_not_converted')`. These orders exist but were placed outside the attribution window.

### 4.3 Reached (ติดต่อได้)
A call is **Reached** when the customer picked up and a conversation occurred.

**NOT Reached (customer did not answer):**
- `ไม่รับสาย` and all variants (no answer)
- `ปิดเครื่อง/ติดต่อไม่ได้` (phone off / unreachable)

**Reached (customer did answer):**
- `ไม่สะดวกคุย` (not convenient to talk — counted as Reached, not Interested)
- `ยังไม่ต้องการสินค้า` (not ready to buy — counted as Reached, not Interested)
- All other statuses (normal conversation outcomes)

### 4.4 Interested
A **Reached** customer who did not explicitly decline to engage.

**Reached but NOT Interested:**
- `ไม่สะดวกคุย` — customer answered but was inconvenient to talk
- `ยังไม่ต้องการสินค้า` — customer answered but is not ready to buy yet

These statuses are Reached (the phone was answered) but fall out at the Interested stage.

### 4.5 New Customer
`customer_type = 'new_customer'` — Customer whose first-ever HOC order falls within the attribution window.

### 4.6 Retention (Repeat Customer)
`customer_type = 'retention'` — Customer who reordered HOC products within the attribution window.

### 4.7 Conversion Rate
```
Conversion Rate = Converted ÷ Reached
```
"Of everyone who answered the call, how many became customers?"

The denominator is **Reached** (not Total Calls, not Total Leads). Calls that were never answered are outside the agent's control and should not penalise the rate.

### 4.8 Reach Rate
```
Reach Rate = Reached Calls ÷ Total Calls Made
```
"Of all calls attempted, how many were actually answered?"

### 4.9 ROI
```
ROI = HOC Sales (incentive-eligible) ÷ Total Program Expense
Total Program Expense = total_incentive + total_agent_cost
```
ROI is always **month-level** and is NOT affected by CMG or channel filters — program costs are shared across all segments.

---

## 5. Conversion Funnel

The telesales funnel has four stages:

```
Total Calls
    ↓  [drop: Not Reached — no answer / phone off]
Reached
    ↓  [drop: Not Interested — ไม่สะดวกคุย / ยังไม่ต้องการสินค้า]
Interested
    ↓  [drop: Not Converted — ordered outside attribution window]
Converted
```

**Interested, Not Converted** = Interested − (Interested customers who also converted)

This value is always ≥ 0. It is computed server-side to ensure accuracy — it is NOT simply `Interested − Total Converted`, because some customers who said "not convenient" may still have placed an order through another channel.

---

## 6. Incentive Rules

### Eligibility by CMG

| Period | CMGs counted toward incentive |
|---|---|
| Before May 2026 | All CMGs (including DISTRIBUTOR) |
| May 2026 onward | FOOD RETAILER, HORECA, END USER only (DISTRIBUTOR excluded) |

### Calculation
```
incentive_per_head  — looked up from incentive tier table
total_incentive     = agent_count × incentive_per_head
total_expense       = total_incentive + (agent_count × cost_per_agent) + (supervisor_count × cost_per_supervisor)
```

---

## 7. Dashboard Pages

### 7.1 Dashboard Overview — `/dashboard`
**Audience:** Managers, Supervisors (morning check)
**Purpose:** Top-level KPI snapshot
**KPI Cards:** HOC Sales, New Customers, Retention, Total Calls
**Charts:**
- Sales Trend (stacked bar — online/offline, monthly/weekly)
- Telesales Trend (bars + conversion rate line)
- Bubble Map (D3 — Senior Buyer bubbles sized by HOC sales; double-click drills into brands)
**Filters:** Date range, CMG

### 7.2 Order Sales — `/dashboard/sales`
**Audience:** Sales Manager, Account Manager
**Purpose:** HOC sales trend, channel split, product revenue by brand/buyer
**KPI Cards:** Converted Sales, Avg Order Value, New Customers, Repeat Customers
**Charts:** Sales Trend (online/offline, no Target line), Channel Breakdown (converted orders only), Conversion Split, Agent Leaderboard, Product Bubble Map
**Filters:** Date range, CMG

### 7.3 Telesales — `/dashboard/telesales`
**Audience:** Telesales Supervisor, Team Lead
**Purpose:** Call-centre performance and conversion funnel
**KPI Cards:** Total Leads, Connected Rate (colour-coded), Conversion Rate (colour-coded), Orders (New + Repeat)
**Charts:** Telesales Trend, Call Status by Tier (Horizontal Stacked Bar), Conversion Funnel
**Table:** Agent Leaderboard — Total Calls, Reached, Not Reached, Reach Rate, Conversion Rate, Calls/Day + total sum row
**Filters:** Date range, Channel, CMG, Agent

### 7.4 Leads — `/leads`
**Audience:** Telesales Admin, Supervisor
**Purpose:** Full lead list with contact status and conversion outcome
**Access:** Admin only
**KPI Cards:** Total Leads, Contacted, Conversion, Orders (always show global totals — not affected by table filters)
**Table:** MMID, Customer Name, Tier, CMG, Agent, Contact Badge, Conversion Badge, HOC Orders, HOC Sales
**Table Filters:** Tier, Contact status, Conversion status, CMG, Agent, Search
**Pagination:** 500 rows per page (server-side)

### 7.5 Data Hub — `/data-hub`
**Audience:** Admin only
**Purpose:** Upload raw CSV data, monitor ETL, trigger mart rebuild
**File Types:** Online Sales, Offline Sales, Leads, Products, Telesales, Targets, Costs, Incentives, Agent Headcount
**Tabs:** Overview, Data Status, History, Build Mart
**Build Mart:** Triggers GitHub Actions nightly-build workflow. Takes 2–5 minutes. UI shows spinner while running, then "Build complete" when done. All dashboard pages refresh automatically.

### 7.6 Raw Data — `/raw-data`
**Audience:** Admin only
**Purpose:** Browse and export any source table directly
**Tables:** online_sales, offline_sales, telesales_calls, leads, products, targets, costs, incentives, agent_headcount
**Actions:** Paginate rows, Export as CSV

---

## 8. Filtering Rules

### Date Filter
- Filters on `order_date` (sales pages) or `first_connected_date` (telesales pages)
- Default: full available date range, auto-selected on first load
- Persisted in browser localStorage across sessions

### CMG Filter
- `dynamic_cmg` for sales amounts
- `primary_cmg` for customer counts (to avoid double-counting)

### Channel Filter
- Online / Offline / Both

### Date Filter — Converted Scoping (Telesales page)
When a date range is active on the Telesales page, Converted counts only orders where `order_date >= telesales_calls.first_connected_date` for that customer. This prevents historical conversions from inflating the period-filtered count.

---

## 9. Roles and Access

| Role | Pages Accessible |
|---|---|
| Admin | All pages: Dashboard, Sales, Telesales, Leads, Raw Data, Data Hub |
| Viewer | Dashboard Overview, Order Sales, Telesales only |
| Unauthenticated | Redirected to login |
| GAS (system) | Ingest API only (telesales sync) |

---

## 10. Build Mart

Build Mart is the process that rebuilds the aggregated data tables from raw uploads.

**When to run:** After uploading new data files in Data Hub.
**How to trigger:** Data Hub → Build Mart tab → click Build.
**Duration:** 2–5 minutes (runs via GitHub Actions).
**What it rebuilds:**
- `mmid_cmg_map` — customer → primary CMG + first contact date
- `sales_hoc_orders` — HOC orders with attribution and customer_type tags
- `mart_performance_cmg` — KPIs by month × CMG
- `mart_performance_month` — KPIs by month (costs, ROI, incentives)

**After build:** All dashboard pages automatically refresh with the new data.
**Stale data warning:** An amber banner appears if the mart data is more than 24 hours old.

---

## 11. Data Freshness

The system shows a **Freshness Bar** (amber banner) if the mart was last rebuilt more than 24 hours ago. This means the dashboard may not reflect the most recent uploaded data. To refresh: go to Data Hub → Build Mart.

---

## 12. Frequently Asked Questions

**Q: Why doesn't my uploaded data appear on the dashboard immediately?**
A: After uploading CSV files, you must run **Build Mart** in Data Hub. The mart rebuild takes 2–5 minutes. Once complete, all dashboard pages refresh automatically.

**Q: Why does "Interested, Not Converted" sometimes show 0?**
A: It means that all customers who reached the "Interested" stage (answered the call and showed willingness to engage) went on to place an order within the attribution window. This is a genuinely good result.

**Q: Why is the Conversion Rate calculated against Reached, not Total Leads?**
A: Calls that were never answered are outside the agent's control. Using Reached as the denominator gives a fairer measure of how well agents convert the conversations they actually have.

**Q: A customer appears in both New Customer and Retention — is that a bug?**
A: No. A customer can have multiple orders. Their first-ever HOC order determines `new_customer`; any subsequent orders within the window are `retention`. Both count as Converted.

**Q: What is the difference between online and offline?**
A: Online orders come from e-commerce channels. Offline orders come from field sales or counter sales. Both appear in the dashboard when the Channel filter is set to "Both".

**Q: Why does the CMG filter not affect ROI?**
A: ROI is always calculated at the whole-program level. Program costs (agent salaries, supervisor costs, incentives) are shared across all segments and cannot be attributed to a single CMG.
