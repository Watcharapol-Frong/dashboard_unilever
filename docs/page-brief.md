# Dashboard Unilever — Page Brief

## User Journey

```
Admin uploads data (Data Hub)
    ↓
Manager reviews overview (Overview) → spots issues
    ↓
Drill-down to Sales or Telesales → finds root cause
    ↓
Agent works lead queue (Leads) → makes calls
    ↓
Products / Incentives → helps prioritise what to sell and what bonuses are active
```

---

## 1. Overview `/overview`

| | |
|---|---|
| **Purpose** | Single-page KPI snapshot across all months |
| **Audience** | Managers / Supervisors — morning check |
| **Key questions** | Did we hit the sales target? Are new customers coming in? Is call volume healthy? |
| **Auth** | Any logged-in user |
| **Filters** | Month range, Lead Tier, CMG — affect both KPI cards and charts |
| **Action** | If metrics look off → open Sales or Telesales to find root cause |

**KPI Cards:** HOC Sales, Achievement %, New Customers, Retention, Total Calls, ROI

**Charts:** HOC Sales vs Target (ComposedChart), New vs Retention by month (Stacked Bar), ROI Trend (Line)

---

## 2. Sales `/sales`

| | |
|---|---|
| **Purpose** | Analyse HOC Unilever sales (Online / Offline) with period comparison |
| **Audience** | Sales Manager, Account Manager |
| **Key questions** | How are sales trending this period? What is the New vs Retention split? |
| **Auth** | Any logged-in user |
| **Filters** | Date range (month chips or DateRangePicker), Channel, CMG, Agent, Conversion type — affect KPI and charts |
| **Action** | If Avg Order Value drops → check Products; if Conversion is low → check Telesales |

**KPI Cards (4):** Total Sales, Avg Order Value, New Customers, Retention — each shows a delta % vs prior period

**Charts:** Sales Trend (AreaChart — Online + Offline stacked, interval auto-selects daily/weekly/monthly), Channel Distribution (Stacked Bar)

---

## 3. Telesales `/telesales`

| | |
|---|---|
| **Purpose** | Monitor call-centre performance and the telesales conversion funnel |
| **Audience** | Telesales Supervisor, Team Lead |
| **Key questions** | What is the reach rate? Which agents are converting? Where does the funnel drop off? |
| **Auth** | Any logged-in user |
| **Filters** | Date range, Channel, CMG, Agent — affect KPI and all charts |
| **Action** | Low agent conversion → coaching; low reach rate → review call status breakdown |

**KPI Cards (4):** Total Leads, Connected Rate (colour-coded), Conversion Rate (colour-coded), Orders (New + Repeat)

**Charts:** Daily Calling Trend (AreaChart), Call Status by Tier (Horizontal Stacked Bar), Conversion Funnel (custom waterfall)

**Table:** Agent Leaderboard — Total Calls, Reached, Not Reached, Reach Rate, Conversion Rate, Calls/Day

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

## 5. Products `/products`

| | |
|---|---|
| **Purpose** | Analyse revenue at SKU and brand level |
| **Audience** | Product Manager, Category Manager |
| **Key questions** | Which SKUs are top sellers? Which brands drive new customers vs repeat buyers? |
| **Auth** | Any logged-in user |
| **Filters** | Date range, Brand, Class, Subclass, Senior Buyer, Buyer — affect KPI, charts, and all tables |
| **Action** | SKU revenue unexpectedly low → check stock / adjust incentive |

**KPI Cards (4):** Total Revenue, Avg Order Value, Total Qty Sold, Active SKUs

**Charts:** Revenue Trend by Brand (Line — Top 5 + Other)

**Tables (Tabs):** Top SKUs, New vs Retention (segment classification), By Brand (channel mix)

---

## 6. Incentives `/incentives`

| | |
|---|---|
| **Purpose** | Summarise incentive payouts and programme ROI |
| **Audience** | Finance, Programme Manager |
| **Key questions** | How much incentive was paid out? Is the programme delivering good ROI? Which tier triggered? |
| **Auth** | Any logged-in user |
| **Filters** | None — shows all months with available data |
| **Action** | Low ROI → adjust tier structure or increase campaign pressure |

**KPI Cards (2):** Total Incentives Paid, Overall Programme ROI

**Charts:** Monthly Incentives vs ROI (ComposedChart — Bar + Line)

**Tables (Tabs):** Monthly Incentive Summary, Incentive Tier Configuration (read-only)

---

## 7. Data Hub `/data-hub`

| | |
|---|---|
| **Purpose** | Upload raw CSV data, monitor ETL status, and trigger mart rebuild |
| **Audience** | Admin only (redirects non-admin users) |
| **Key questions** | When was the last upload? How many rows are loaded? Were there any errors? |
| **Auth** | Admin only |
| **Action** | Upload → check History tab for pass/fail → if all pass → Build Mart |

**Supported file types:** Online Sales, Offline Sales, Leads, Products, Telesales, Targets, Costs, Incentives, Agent Headcount

**Tabs:** Overview (status cards), Data Status (8-source summary table), History (upload log), Build Mart (attribution window selector + build trigger)

---

## 8. Exports `/exports`

| | |
|---|---|
| **Purpose** | Export data as CSV or Excel with custom column selection and granularity |
| **Audience** | Admin users who need raw data for offline analysis |
| **Auth** | Admin only (redirects non-admin users) |
| **Action** | Select granularity + filters + columns → Preview → Download |

**Granularity:** Month / Week / Day / Order Line

**Formats:** CSV (max 500 k rows), XLSX (max 100 k raw / 500 k aggregated)
