# Dashboard Unilever — Page Brief

> Last updated: 2026-06-19

## User Journey

```
Admin uploads data (Data Hub)
    ↓
Manager checks main dashboard → spots issues
    ↓
Drill-down to Sales or Telesales → finds root cause
    ↓
Agent works lead queue (Leads) → makes calls
    ↓
Admin browses Raw Data → investigates individual records
```

---

## 1. Dashboard `/dashboard`

| | |
|---|---|
| **Purpose** | Main KPI snapshot: sales, telesales trend, agent leaderboard, product bubble map |
| **Audience** | Managers / Supervisors — morning check |
| **Key questions** | How are sales trending? Which agents are performing? Which Senior Buyers are driving volume? |
| **Auth** | Any logged-in user |
| **Filters** | Date range, CMG — affect KPI cards and charts |
| **Action** | If KPIs look off → drill into Sales or Telesales |

**KPI Cards:** HOC Sales, New Customers, Retention, Total Calls

**Charts:** Sales Trend (stacked bar — online/offline/target, monthly/weekly), Telesales Trend (bars + conversion rate line)

**Bubble Map:** `SplitBubbleChart` — D3 bubble pack per Senior Buyer, bubbles sized by HOC sales, double-click drills into product brands

---

## 2. Order Sales `/dashboard/sales`

| | |
|---|---|
| **Purpose** | HOC sales trend, channel split, product revenue by brand/buyer |
| **Audience** | Sales Manager, Account Manager |
| **Key questions** | How are sales trending? Online vs Offline split? Which brands/buyers drive volume? |
| **Auth** | Any logged-in user |
| **Filters** | Date range, CMG — affect KPI cards and charts |
| **Action** | If sales dip → check telesales conversion; if brand mix shifts → check product table |

**KPI Cards (4):** Converted Sales, Avg Order Value, New Customers, Repeat Customers

**Charts:** Sales Trend line chart (online/offline, monthly/weekly toggle — no Target line), Channel Breakdown (converted only), Conversion Split, Agent Leaderboard (with sum row), Product bubble map

---

## 3. Telesales `/dashboard/telesales`

| | |
|---|---|
| **Purpose** | Monitor call-centre performance and the telesales conversion funnel |
| **Audience** | Telesales Supervisor, Team Lead |
| **Key questions** | What is the reach rate? Which agents are converting? Where does the funnel drop off? |
| **Auth** | Any logged-in user |
| **Filters** | Date range, Channel, CMG, Agent — affect KPI and all charts |
| **Action** | Low agent conversion → coaching; low reach rate → review call status breakdown |

**KPI Cards (4):** Total Leads, Connected Rate (colour-coded), Conversion Rate (colour-coded), Orders (New + Repeat)

**Charts:** Telesales Trend (bars + conversion rate), Call Status by Tier (Horizontal Stacked Bar), Conversion Funnel (custom SVG area — each stage has Info tooltip with English description; "Interested, Not Converted" value comes from `summary.interested_not_converted` computed server-side and is always ≥ 0)

**Table:** Agent Leaderboard — Total Calls, Reached, Not Reached, Reach Rate, Conversion Rate, Calls/Day + **Total sum row**

---

## 4. Leads `/leads`

| | |
|---|---|
| **Purpose** | Full lead list with contact status and conversion outcome |
| **Audience** | Telesales Admin / Supervisor |
| **Key questions** | Which leads have not been called? Which have converted? Who is handling each lead? |
| **Auth** | Admin only |
| **Filters** | Tier, Contact status, Conversion status, CMG, Agent, Search — affect **table only** (KPI cards always show global totals) |
| **Action** | Filter "Not Called" → export list to agents for outreach |

**KPI Cards (4):** Total Leads, Contacted (reached + not reached combined), Conversion (unique MMIDs that converted), Orders (from converted MMIDs only)

**Table:** MMID, Customer Name, Tier, CMG, Agent, Contact Badge, Conversion Badge, HOC Orders, HOC Sales

**Pagination:** Server-side, 500 rows per page



---

## 5. Data Hub `/data-hub`

| | |
|---|---|
| **Purpose** | Upload raw CSV data, monitor ETL status, and trigger mart rebuild |
| **Audience** | Admin only (redirects non-admin users) |
| **Key questions** | When was the last upload? How many rows are loaded? Were there any errors? |
| **Auth** | Admin only |
| **Action** | Upload → check History tab for pass/fail → if all pass → Build Mart |

**Supported file types:** Online Sales, Offline Sales, Leads, Products, Telesales, Targets, Costs, Incentives, Agent Headcount

**Tabs:** Overview (status cards), Data Status (8-source summary table), History (upload log), Build Mart (attribution window selector + build trigger)

**Build Mart:** Clicking Build dispatches `nightly-build.yml` via GitHub Actions workflow dispatch (requires `GH_WORKFLOW_TOKEN`). Build takes approximately 2–5 minutes. The UI shows a spinner (Loader2) while the build is running and switches to CheckCircle + "Build complete — data updated" when `BuildContext` detects completion via freshness polling. All dashboard SWR keys are invalidated automatically on completion. Default attribution window: 14 days.
---

## 6. Raw Data `/raw-data`

| | |
|---|---|
| **Purpose** | Browse and export any source table directly |
| **Audience** | Admin |
| **Key questions** | What raw records exist? Are there data quality issues? |
| **Auth** | Admin only |

**Tables available:** online_sales, offline_sales, telesales_calls, leads, products, targets, costs, incentives, agent_headcount

**Actions:** Paginate rows · Export table as CSV
