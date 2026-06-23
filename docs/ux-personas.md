# Dashboard Unilever — UX Personas & Display Logic

> Last updated: 2026-06-19

> Reference for developers and AI: use this file to decide **what to show**, **to whom**, and **in what priority order** for every section of the dashboard.

---

## 1. System Roles (Technical)

| Clerk Role | Access Level | Who holds it |
|---|---|---|
| `admin` | Full access — all pages including Leads, Data Hub, Raw Data | Data Admins, Telesales Admin |
| `viewer` | Read-only — all pages **except** Leads, Data Hub, Raw Data | All other business users |

> **Rule:** Access control is enforced at middleware level (route-based), not at component level. Never hide content in the UI as a substitute for route protection.

---

## 2. Business Personas

These are the **real people** who log in. Each maps to a Clerk role and has different goals.

### 2.1 Category / Programme Manager
- **Clerk role:** viewer
- **Primary goal:** Hit the HOC Unilever monthly sales target; monitor programme ROI
- **Morning routine:** Overview → check KPI cards → if sales are off, open Sales
- **Secondary pages:** Incentives (ROI), Products (SKU mix)
- **Does NOT need:** Individual agent names, raw lead lists, upload tools
- **Key numbers:** HOC Sales vs Target (%), ROI, New vs Retention trend

### 2.2 Sales Manager / Account Manager
- **Clerk role:** viewer
- **Primary goal:** Understand sales performance by channel, CMG, and period
- **Morning routine:** Sales page → compare to last period → identify weak channels
- **Secondary pages:** Overview (quick pulse), Products (Avg Order Value context)
- **Does NOT need:** Call-level detail, agent leaderboard, incentive configuration
- **Key numbers:** Total Sales, Channel split, Avg Order Value, period delta %

### 2.3 Telesales Supervisor / Team Lead
- **Clerk role:** viewer
- **Primary goal:** Improve conversion rate and reach rate across the call team
- **Morning routine:** Telesales → funnel drop-off → agent leaderboard → spot low performers
- **Secondary pages:** Overview (big picture), Leads (admin only — needs admin role to view)
- **Does NOT need:** Product breakdowns, incentive config, upload tools
- **Key numbers:** Connected Rate, Conversion Rate, Reach Rate per Agent, Funnel shape

### 2.4 Telesales Admin
- **Clerk role:** admin
- **Primary goal:** Manage the lead pipeline; ensure all leads are assigned and followed up
- **Morning routine:** Leads → filter "Not Called" → export or distribute to agents
- **Secondary pages:** Telesales (team-level context), Data Hub (upload new lead list)
- **Needs:** Full Leads table, contact/conversion badges, agent assignment visibility
- **Key numbers:** Uncontacted leads count, Conversion by agent, Tier breakdown

### 2.5 Product Manager / Category Analyst
- **Clerk role:** viewer
- **Primary goal:** Understand which SKUs and brands are performing; guide promotional focus
- **Morning routine:** Products → top SKUs → brand trend → new vs retention split by brand
- **Secondary pages:** Sales (volume context), Incentives (cost per brand)
- **Does NOT need:** Agent-level data, lead pipeline, upload tools
- **Key numbers:** Revenue by SKU/Brand, Qty Sold, Active SKU count, New vs Retention by brand

### 2.6 Finance / Programme ROI Manager
- **Clerk role:** viewer
- **Primary goal:** Validate incentive spend against sales outcomes
- **Morning routine:** Incentives → total payout → ROI per month → tier configuration review
- **Secondary pages:** Overview (high-level ROI card), Raw Data (raw data export for finance system)
- **Note:** Raw Data requires admin role — Finance users needing raw data exports must be upgraded to admin
- **Key numbers:** Total Incentives Paid, Programme ROI, ROI per tier, Monthly trend

### 2.7 Data Admin
- **Clerk role:** admin
- **Primary goal:** Keep data fresh — upload CSVs, rebuild mart, fix errors
- **Routine:** Data Hub → Upload tab → History check → Build Mart
- **Secondary pages:** Dashboard status cards (mart row counts), Raw Data (validate data)
- **Does NOT need:** Business KPI interpretation — this role operates the pipeline, not the business
- **Key numbers:** Last upload timestamp, Row counts per source, Build success/failure

---

## 3. Page × Persona Matrix

| Page | Category Mgr | Sales Mgr | Telesales Sup | Telesales Admin | Product Mgr | Finance | Data Admin |
|---|---|---|---|---|---|---|---|
| Overview | ★ Primary | Secondary | Secondary | Secondary | Reference | Reference | Rarely |
| Sales | Secondary | ★ Primary | Reference | Rarely | Secondary | Reference | Rarely |
| Telesales | Secondary | Secondary | ★ Primary | Secondary | Rarely | Rarely | Rarely |
| Leads | — | — | (needs admin) | ★ Primary | — | — | Reference |
| Products | Secondary | Reference | Rarely | Rarely | ★ Primary | Reference | Rarely |
| Incentives | Secondary | Reference | Rarely | Rarely | Reference | ★ Primary | Rarely |
| Data Hub | — | — | — | Secondary | — | — | ★ Primary |
| Raw Data | — | — | — | Rarely | — | Rarely | ★ Primary |

**Legend:** ★ Primary = opens this page first / most frequently · Secondary = drills into here when primary raises questions · Reference = occasional lookup · Rarely = almost never · — = no access or no need

---

## 4. Per-Page Display Priorities

### 4.1 Overview
**Audience:** All viewers, primarily Category/Programme Managers

**Information hierarchy:**
1. **KPI cards** (top fold) — immediate health check: HOC Sales vs Target, Achievement %, New Customers, Retention, Total Calls, ROI
2. **HOC Sales vs Target chart** — monthly trend, most important visual
3. **New vs Retention trend** — customer mix over time
4. **Filters** (Month range, Tier, CMG) — let users narrow scope without losing the big picture

**Display rules:**
- Default view = full available range (auto-selected from data, persisted to localStorage)
- All KPI cards always reflect the selected month range + filters
- Charts react to filters in real time
- No raw tables — this page is executive summary only
- Colour coding: Achievement % green if ≥ 100%, yellow if ≥ 80%, red if < 80%

---

### 4.2 Sales
**Audience:** Sales Manager, Account Manager

**Information hierarchy:**
1. **KPI cards with delta** — Total Sales, AOV, New Customers, Retention vs prior period
2. **Sales Trend chart** — area chart showing Online + Offline over time
3. **Channel Distribution chart** — Online vs Offline split this period
4. **Recent Orders table** — drill-down detail for spot checks

**Display rules:**
- Default date range = last month; DateRangePicker lets user extend to any range
- Delta % cards: green = better than prior period, red = worse
- Channel filter affects all charts and cards simultaneously
- If no data for selected range → show `PageEmpty` with "Run Build Mart first" hint, not an error

---

### 4.3 Telesales
**Audience:** Telesales Supervisor, Team Lead

**Information hierarchy:**
1. **KPI cards** (colour-coded thresholds) — Total Leads, Connected Rate, Conversion Rate, Orders
2. **Daily Calling Trend** — volume over time (are agents active?)
3. **Conversion Funnel** — where does it drop? (Leads → Reached → Ordered)
4. **Agent Leaderboard table** — who is performing, who needs coaching

**Display rules:**
- Connected Rate: green ≥ 60%, yellow ≥ 40%, red < 40%
- Conversion Rate: green ≥ 30%, yellow ≥ 15%, red < 15%
- Agent filter: narrows all charts AND the leaderboard to that agent's rows
- Leaderboard sorted by Conversion Rate desc by default
- Call Status breakdown (Tier bar chart) shows HOW calls ended — coaching input

---

### 4.4 Leads
**Audience:** Telesales Admin only (admin role required)

**Information hierarchy:**
1. **KPI summary cards** — Total Leads, Contacted, Converted, Orders (always global, not filtered)
2. **Filter bar** — Tier, Contact status, Conversion status, CMG, Agent, Search
3. **Lead table** — paginated 500/page, sortable by key columns

**Display rules:**
- KPI cards show **global** totals regardless of table filters (by design — admins need both the filtered list and the overall picture simultaneously)
- Filters affect **only** the table, not the KPI cards — this must be visually communicated (e.g. "Showing X of Y leads" below filter bar)
- Contact badge: "Reached" (green) / "Not Reached" (amber) / "Not Called" (grey)
- Conversion badge: "Converted" (green) / "Not Converted" (grey)
- Default sort: Not Called first → helps admin find unworked leads fast
- Search covers MMID and Customer Name (debounced 300ms)

---

### 4.5 Products
**Audience:** Product Manager, Category Analyst

**Information hierarchy:**
1. **KPI cards** — Total Revenue, AOV, Qty Sold, Active SKUs
2. **Revenue by Brand trend** — which brands are growing / declining
3. **Top SKUs tab** — revenue and qty by SKU
4. **By Brand tab** — channel mix (Online vs Offline) per brand
5. **New vs Retention tab** — which brands attract new buyers vs repeat buyers

**Display rules:**
- Brand filter (multi-select) narrows all tabs at once
- Class / Subclass / Buyer filters narrow to product hierarchy
- Tabs are independent views of the same filtered dataset — switching tabs does NOT reset filters
- "Active SKUs" = SKUs with at least 1 order in selected period

---

### 4.6 Incentives
**Audience:** Finance, Programme Manager

**Information hierarchy:**
1. **KPI cards** — Total Incentives Paid, Programme ROI
2. **Monthly Incentives vs ROI chart** — bar + line, trend over all available months
3. **Monthly Summary table** — raw numbers for each month (Finance needs this for reconciliation)
4. **Tier Configuration tab** — read-only incentive tier rules (what triggers payment)

**Display rules:**
- No date filter — show all historical months (Finance needs the full picture)
- ROI line: green zone > 1.0x, red zone < 1.0x
- Incentive amounts in THB with no rounding (Finance needs exact figures)
- **May 2026 cutoff rule**: DISTRIBUTOR CMG excluded from incentive calculations from May 2026 onwards — this is handled in the mart SQL, not the UI, but Finance should be aware it exists

---

### 4.7 Data Hub
**Audience:** Data Admin (admin role required)

**Information hierarchy:**
1. **Upload tab** — primary action: drag-and-drop CSV upload, file type selector
2. **Data Status tab** — 8-source row count + last upload timestamp (is everything loaded?)
3. **History tab** — recent upload log with pass/fail per file
4. **Build Mart tab** — attribution window selector + Build button (final step after upload)

**Display rules:**
- Non-admin users are redirected to `/overview` by middleware — no partial display
- Build button is disabled if a build is already in progress (build lock)
- History shows last 20 uploads sorted by timestamp desc
- Error rows in History are highlighted red — admin must investigate before rebuilding
- Build progress shown inline with percentage bar (BuildContext state)

---

### 4.8 Raw Data (`/raw-data`)
**Audience:** Data Admin (admin role required)

**Information hierarchy:**
1. **Table selector** — choose from source tables (online_sales, offline_sales, telesales_calls, leads, products, targets, costs, incentives, agent_headcount)
2. **Paginated table** — browse raw rows directly
3. **CSV export** — download the full table as a CSV file

**Display rules:**
- Non-admin users are redirected by middleware
- Raw pivot/export is available via `GET/POST /api/data/pivot/` — accessible from this page, not a separate `/exports` route

---

## 5. Global UX Rules

### Empty States
| Condition | What to show |
|---|---|
| Mart not built yet | `PageEmpty` with "Run Build Mart first" hint (not an error) |
| No data for selected filters | `PageEmpty` with "No data for this period / Try adjusting filters" |
| API error | `PageError` with "Something went wrong. Please try again." |
| Loading | `PageLoading` skeleton matching the expected layout (correct `cols`) |

### Filter Behaviour
- **All filters are URL-synced** (or local state that resets on navigation — both acceptable, but be consistent within a page)
- **Clear All** button appears in FilterBar when `hasFilter={true}`
- Filters always affect charts AND tables on the same page **unless explicitly documented otherwise** (Leads KPI cards are the one exception)
- Date range default = full available range (auto-selected from data, persisted to localStorage)

### Colour Semantics
| Colour | Meaning |
|---|---|
| Green | Good / on track / converted / reached |
| Amber / Yellow | Warning / borderline / at risk |
| Red | Bad / missed target / not reached |
| Blue | Neutral data / informational |
| Grey | Inactive / not yet actioned / zero |

### Language
- All UI text is in **English** (the product is configured for English throughout)
- Thai text appears only in the Maintenance page (bilingual) and in raw data values from the DB (e.g. `call_status` values like `"ไม่รับสาย"`) — these are displayed as-is, not translated

### Role-Based UI Visibility
| Element | Admin | Viewer |
|---|---|---|
| Sidebar: Leads | Shown | Hidden |
| Sidebar: Data Hub | Shown | Hidden |
| Sidebar: Raw Data | Shown | Hidden |
| All other sidebar items | Shown | Shown |
| Build Mart button | Visible | N/A (page hidden) |
| Upload controls | Visible | N/A (page hidden) |

> Sidebar items for admin-only pages are **hidden from viewer role** to prevent confusion — middleware handles actual enforcement.

---

## 6. User Journey Flow

```
Data Admin uploads CSVs → builds mart
          ↓
Category Manager: Overview → spot KPI anomaly
          ↓
Sales Manager: Sales → diagnose channel / period
          ↓
Telesales Supervisor: Telesales → funnel drop-off → agent coaching
          ↓
Telesales Admin: Leads → filter uncontacted → distribute to agents
          ↓
Product Manager: Products → identify weak SKUs → adjust promotion
          ↓
Finance: Incentives → validate ROI → report to programme board
```

---

## 7. What NOT to Build (Anti-Patterns)

- **Do not duplicate KPI detail across pages.** Overview shows the pulse. Sales/Telesales/Products show the detail. Repeating detail on Overview creates maintenance burden and user confusion.
- **Do not add admin-only controls to viewer pages.** If a feature requires admin role, it lives on an admin-only page.
- **Do not hide data behind auth checks inside components.** Route-level middleware handles auth. Components assume the user is already authorized for the page they're on.
- **Do not show partial/empty charts.** If data is loading, show skeleton. If data is genuinely missing, show PageEmpty. Never render a chart with zero-filled axes as if it were real data.
- **Do not let filter changes cause a full page reload.** All filtering is client-side state → SWR revalidation with new query params. Page structure persists.
