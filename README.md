# Unilever HOC Telesales Dashboard

A full-stack operational dashboard for monitoring and analysing the Unilever HOC (House of Cosmetics) telesales programme. Tracks sales performance, lead conversion, call-centre KPIs, product revenue, and incentive payouts — all from a single interface.

---

## Features

- **Overview** — executive KPI snapshot: HOC sales vs target, achievement %, new vs retention customers, ROI
- **Sales** — period-over-period comparison with daily/weekly/monthly trend charts (online + offline split)
- **Telesales** — call-centre performance: reach rate, conversion rate, funnel visualisation, agent leaderboard
- **Leads** — full lead list with contact and conversion status; server-side filtered and paginated
- **Products** — SKU and brand revenue analysis with new vs retention segmentation
- **Incentives** — monthly incentive payout summary, tier configuration, and programme ROI
- **Data Hub** *(admin)* — CSV upload for all data sources, ETL status monitoring, mart rebuild with configurable attribution window
- **Exports** *(admin)* — custom pivot exports to CSV/XLSX at month/week/day/order-line granularity

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org) (App Router, TypeScript) |
| Database | PostgreSQL |
| Auth | [Clerk](https://clerk.com) |
| Data fetching | [SWR](https://swr.vercel.app) |
| UI components | [shadcn/ui](https://ui.shadcn.com) + [Tailwind CSS](https://tailwindcss.com) |
| Charts | [Recharts](https://recharts.org) |
| Tables | [TanStack Table v8](https://tanstack.com/table) |

---

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/          # All dashboard pages
│   │   ├── overview/
│   │   ├── sales/
│   │   ├── telesales/
│   │   ├── leads/
│   │   ├── products/
│   │   ├── incentives/
│   │   ├── data-hub/
│   │   └── exports/
│   └── api/data/             # REST API endpoints
│       ├── overview/
│       ├── leads/
│       ├── products/
│       ├── sales/
│       ├── telesales/
│       ├── incentives/
│       ├── dashboard/
│       ├── mart-status/
│       └── pivot/
├── components/
│   ├── dashboard/            # Shared dashboard components (KpiCard, FilterBar, MultiSelect, …)
│   └── ui/                   # shadcn/ui base components
├── lib/
│   ├── auth.ts               # withAuth / withAdmin wrappers (Clerk)
│   ├── db/                   # PostgreSQL pool + query helpers
│   ├── formatters.ts         # Number/currency formatting utilities
│   └── services/
│       └── mart-service.ts   # Mart build logic (attribution, aggregation)
└── types/
    └── index.ts              # Shared TypeScript interfaces
```

---

## Data Architecture

### Raw Tables (uploaded via Data Hub)

| Table | Description |
|-------|-------------|
| `leads` | MMID master list assigned to telesales agents |
| `telesales_calls` | Call log with agent, call status, and connection timestamp |
| `sales_hoc_orders` | HOC Unilever order fact table (online + offline combined) |
| `products` | SKU master with brand, class, buyer hierarchy |
| `targets` | Monthly sales targets per CMG |
| `costs` | Monthly agent and supervisor cost per head |
| `incentives` | Incentive tier rules (achievement threshold → bonus per head) |
| `agent_headcount` | Monthly FTE counts (agents + supervisors) |

### Materialized Mart Tables (rebuilt on demand)

| Table | Description |
|-------|-------------|
| `mart_telesales_orders` | Attributed order fact — customer_type assigned based on attribution window |
| `mart_performance` | Aggregated KPIs per `(month, lead_customers, dynamic_cmg)` |

### Attribution Logic

A telesales order is attributed when `order_date` falls within `attribution_days` (default 14) of the customer's `first_connected_date`.

| `customer_type` | Rule |
|-----------------|------|
| `new_customer` | Within window + first-ever HOC order |
| `retention` | Within window + repeat HOC order |
| `first_order_not_converted` | First order but outside window |
| `retention_not_converted` | Repeat order but outside window |

Only `new_customer` and `retention` rows count toward sales and conversion KPIs.

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Clerk account (for authentication)

### Installation

```bash
git clone https://github.com/<your-username>/dashboard_unilever.git
cd dashboard_unilever
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_OUT_URL=/sign-out
```

### Database Setup

Run the schema migrations to create the required tables, then seed master data (products, targets, costs, incentives, headcount) via the Data Hub CSV upload interface.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

---

## API Reference

All endpoints are under `/api/data/`. Every response follows `{ ok: true, ...data }`.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/data/overview` | User | mart_performance rows for Overview page |
| `GET /api/data/leads` | Admin | Paginated, filtered lead list |
| `GET /api/data/leads/summary` | Admin | Global lead KPIs + filter options |
| `GET /api/data/products` | User | Product/brand revenue data |
| `GET /api/data/products/options` | User | Filter dropdown options (cached 1 h) |
| `GET /api/data/sales` | User | Sales trend with period comparison |
| `GET /api/data/telesales` | User | Call-centre KPIs, agent leaderboard, funnel |
| `GET /api/data/incentives` | User | Incentive payout summary |
| `GET /api/data/dashboard` | User | Data Hub source status + upload history |
| `GET /api/data/mart-status` | User | Mart table row counts and refresh times |
| `POST /api/data/pivot` | User | Custom pivot export (JSON / CSV / XLSX) |

---

## Key Design Decisions

**Server-side filtering on Leads** — Lead data can be large; filters (tier, contact status, conversion, CMG, agent, search) are applied in SQL with server-side pagination (500 rows/page). KPI cards always show global totals and are not affected by filters.

**Subquery pattern for joined-table filters** — Filters on fields from joined tables (e.g., `senior_buyer_name` from `products`, `agent` from `telesales_calls`) use `IN (SELECT ...)` subqueries rather than JOIN aliases to avoid breaking queries that don't include that JOIN.

**Thai call_status values** — `telesales_calls.call_status` stores Thai-language values matching the telesales system's original data. These strings are matched exactly in SQL `WHERE` clauses. The UI translates them to English labels via `CALL_STATUS_LABELS` in `TelesalesClient.tsx` before rendering.

**mart_performance cross-join de-duplication** — The mart aggregates across `(month, lead_customers, dynamic_cmg)`. Fields like `actual_sales` (per CMG) and `total_agent_cost` (per month) are repeated across rows and must be de-duplicated before summing. ROI and achievement % are always recomputed from de-duplicated sums.

---

## Admin Setup

1. Create a Clerk user and set `publicMetadata: { role: "admin" }` via the Clerk dashboard.
2. Admin users gain access to `/data-hub` and `/exports`; API routes using `withAdmin()` will also become accessible.
3. Regular users (no role or `role: "viewer"`) access all read-only pages.

---

## License

MIT
