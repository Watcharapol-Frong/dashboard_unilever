"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard, PhoneCall, TrendingUp, Package, PiggyBank,
  Upload, DatabaseZap, Shield, Users, Clock,
} from "lucide-react"

// ─── Reusable small components ────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 mt-4 first:mt-0">
      {children}
    </p>
  )
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <span className="font-semibold text-foreground">{label}</span>
      <span className="text-muted-foreground"> — {children}</span>
    </div>
  )
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-2 rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      {children}
    </div>
  )
}

function UploadTable({ rows }: { rows: { col: string; type: string; note: string }[] }) {
  return (
    <table className="w-full text-xs mt-2 border-collapse">
      <thead>
        <tr className="border-b text-muted-foreground">
          <th className="text-left pb-1 pr-3 font-medium">Column</th>
          <th className="text-left pb-1 pr-3 font-medium">Type</th>
          <th className="text-left pb-1 font-medium">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.col} className="border-b border-border/40 last:border-0">
            <td className="py-1 pr-3 font-mono text-[11px] text-foreground">{r.col}</td>
            <td className="py-1 pr-3 text-muted-foreground">{r.type}</td>
            <td className="py-1 text-muted-foreground">{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Content sections ──────────────────────────────────────────────────────────

function AllUsersContent() {
  return (
    <Accordion type="multiple" className="w-full">

      {/* Overview */}
      <AccordionItem value="overview">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-[#003DA6]" />
            Overview
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <SectionLabel>KPI Cards</SectionLabel>
          <Term label="HOC Sales">Total Unilever HOC order value (online + offline) from telesales-attributed customers within the selected period.</Term>
          <Term label="Achievement %">HOC Sales ÷ Sales Target × 100. Only FOOD RETAILER and HORECA CMGs count from May 2026 onwards.</Term>
          <Term label="Total Leads">Number of MMIDs assigned to the telesales team.</Term>
          <Term label="New Customers">MMIDs whose first-ever HOC order fell within the attribution window.</Term>
          <Term label="Retention">MMIDs with a repeat HOC order within the attribution window.</Term>
          <Term label="Program ROI">Incentive-eligible HOC Sales ÷ Total Program Expense (incentives + agent costs + supervisor costs).</Term>

          <SectionLabel>Filters</SectionLabel>
          <Term label="Month chips">Click one month to select it; click another to set an end range. Click the same month again to deselect.</Term>
          <Term label="CMG">Filter all charts and KPIs to a specific customer management group.</Term>
          <Term label="Channel">Online / Offline split for the Sales vs Target chart bars.</Term>
        </AccordionContent>
      </AccordionItem>

      {/* Attribution Window */}
      <AccordionItem value="attribution">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#003DA6]" />
            Attribution Window
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <p className="text-muted-foreground mb-3">
            The attribution window is the number of days after a customer&apos;s <strong>first connected date</strong> (first successful call) within which their HOC orders are credited to the telesales programme.
          </p>

          <SectionLabel>How it works</SectionLabel>
          <Formula>
            Order is attributed  IF  order_date ≤ first_connected_date + attribution_days
          </Formula>

          <SectionLabel>Customer types</SectionLabel>
          <Term label="new_customer">First-ever HOC order AND within the attribution window — counts toward conversion KPIs.</Term>
          <Term label="retention">Repeat HOC order AND within the attribution window — counts toward conversion KPIs.</Term>
          <Term label="first_order_not_converted">First HOC order but outside the window — NOT counted in telesales KPIs.</Term>
          <Term label="retention_not_converted">Repeat order but outside the window — NOT counted in telesales KPIs.</Term>

          <SectionLabel>Impact</SectionLabel>
          <p className="text-muted-foreground text-xs">
            A shorter window (e.g. 7 days) attributes fewer orders → lower conversion counts. A longer window (e.g. 30 days) attributes more orders. The current window used is shown in the top bar: <span className="font-mono font-semibold">N-day attribution</span>.
          </p>
          <Note>Changing the attribution window requires a mart rebuild. All historical conversion numbers will recalculate.</Note>
        </AccordionContent>
      </AccordionItem>

      {/* Sales */}
      <AccordionItem value="sales">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#003DA6]" />
            Sales
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <SectionLabel>Charts</SectionLabel>
          <Term label="HOC Sales vs Target">Monthly bar chart comparing actual HOC sales against the target per CMG. Bars are stacked by channel (online/offline).</Term>
          <Term label="Period comparison">Current period vs previous period — absolute and % change shown on each KPI card.</Term>

          <SectionLabel>Key values</SectionLabel>
          <Term label="HOC Sales">All telesales-attributed orders (new_customer + retention) within the selected date range.</Term>
          <Term label="Sales Target">Monthly targets uploaded per CMG via Data Hub → Targets file.</Term>
          <Formula>Achievement % = HOC Sales ÷ Sales Target × 100</Formula>
        </AccordionContent>
      </AccordionItem>

      {/* Telesales */}
      <AccordionItem value="telesales">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-[#003DA6]" />
            Telesales
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <SectionLabel>Funnel</SectionLabel>
          <Term label="Total Leads">All MMIDs with a first_connected_date assigned.</Term>
          <Term label="Reached">MMIDs where call_status is NOT "No Answer" / "Phone Off / Unreachable".</Term>
          <Term label="Ordered">MMIDs with at least one attributed HOC order (new_customer or retention).</Term>

          <SectionLabel>Rates</SectionLabel>
          <Formula>Reach Rate = Reached ÷ Total Leads × 100</Formula>
          <Formula>Conversion Rate = Ordered ÷ Reached × 100</Formula>

          <SectionLabel>Agent Leaderboard</SectionLabel>
          <Term label="Calls/day">Total calls ÷ number of working days in the period.</Term>
          <Term label="Conversion rate">Ordered leads ÷ Reached leads for that agent.</Term>

          <Note>Call statuses are stored in Thai in the database and translated to English labels in the UI only.</Note>
        </AccordionContent>
      </AccordionItem>

      {/* Products */}
      <AccordionItem value="products">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[#003DA6]" />
            Products
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <SectionLabel>Dimensions</SectionLabel>
          <Term label="Brand">Product brand (e.g. Dove, Sunsilk). Comes from the products master file.</Term>
          <Term label="Class">Product category (e.g. Hair Care, Skin Care).</Term>
          <Term label="Subclass">Sub-category within a class.</Term>

          <SectionLabel>Metrics</SectionLabel>
          <Term label="HOC Sales">Revenue from attributed telesales orders for that product group.</Term>
          <Term label="New vs Retention split">HOC Sales broken down by customer_type: new_customer vs retention.</Term>
          <Term label="HOC Orders">Number of distinct order lines for that product group.</Term>
        </AccordionContent>
      </AccordionItem>

      {/* Incentives */}
      <AccordionItem value="incentives">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-[#003DA6]" />
            Incentives
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <SectionLabel>Achievement &amp; Tier</SectionLabel>
          <p className="text-muted-foreground mb-2 text-xs">
            Achievement % determines which incentive tier applies. The system picks the <strong>highest tier whose threshold ≤ achievement %</strong>.
          </p>
          <Formula>Achievement % = Incentive-eligible Sales ÷ Incentive Target × 100</Formula>
          <Term label="Incentive-eligible sales">FOOD RETAILER + HORECA CMGs only (from May 2026 — DISTRIBUTOR excluded).</Term>

          <SectionLabel>Incentive calculation</SectionLabel>
          <Formula>Total Incentives Paid = Agent Count × Rate per Head</Formula>
          <Formula>Total Expense = Total Incentives + Agent Salaries + Supervisor Salaries</Formula>
          <Formula>ROI = Incentive-eligible HOC Sales ÷ Total Expense</Formula>

          <Note>
            Rows from May 2026 onwards show an ⚠ icon — DISTRIBUTOR is excluded from HOC Sales, Achievement %, and ROI for those months.
          </Note>

          <SectionLabel>Incentive Tiers table</SectionLabel>
          <p className="text-muted-foreground text-xs">
            Shows the threshold → rate mapping uploaded via Data Hub. Example: achievement ≥ 80% → ฿500/head, ≥ 100% → ฿1,000/head.
          </p>
        </AccordionContent>
      </AccordionItem>

    </Accordion>
  )
}

function AdminContent() {
  return (
    <Accordion type="multiple" className="w-full">

      {/* Upload order */}
      <AccordionItem value="upload-order">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-rose-600" />
            Upload Order &amp; Dependencies
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <p className="text-muted-foreground text-xs mb-3">
            Upload files in this order to avoid foreign-key and join issues:
          </p>
          <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
            <li><span className="font-semibold text-foreground">Products</span> — must exist before sales orders (prod_num lookup)</li>
            <li><span className="font-semibold text-foreground">Leads</span> — MMID master list</li>
            <li><span className="font-semibold text-foreground">Telesales Calls</span> — requires MMIDs from Leads</li>
            <li><span className="font-semibold text-foreground">Online Sales</span> — requires prod_num from Products</li>
            <li><span className="font-semibold text-foreground">Offline Sales</span> — requires prod_num from Products</li>
            <li><span className="font-semibold text-foreground">Targets</span> — monthly targets per CMG</li>
            <li><span className="font-semibold text-foreground">Costs</span> — monthly cost per head</li>
            <li><span className="font-semibold text-foreground">Agent Headcount</span> — monthly FTE counts</li>
            <li><span className="font-semibold text-foreground">Incentives</span> — tier → rate mapping</li>
          </ol>
          <Note>After uploading new sales or calls data, always rebuild the mart to update all dashboard KPIs.</Note>
        </AccordionContent>
      </AccordionItem>

      {/* Leads */}
      <AccordionItem value="upload-leads">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">📋 Leads (MMID Master)</span>
        </AccordionTrigger>
        <AccordionContent>
          <UploadTable rows={[
            { col: "mmid",               type: "TEXT",    note: "Unique customer ID — primary key" },
            { col: "tier",               type: "TEXT",    note: "e.g. Gold, Silver, Bronze" },
            { col: "lead_customers",     type: "TEXT",    note: "CMG bucket assigned to this lead" },
            { col: "senior_buyer_name",  type: "TEXT",    note: "Senior buyer name (optional)" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* Telesales Calls */}
      <AccordionItem value="upload-calls">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">📞 Telesales Calls</span>
        </AccordionTrigger>
        <AccordionContent>
          <UploadTable rows={[
            { col: "mmid",                 type: "TEXT",  note: "Must match an MMID in Leads" },
            { col: "agent",                type: "TEXT",  note: "Agent name or ID" },
            { col: "call_status",          type: "TEXT",  note: "Thai call status value (from CRM)" },
            { col: "first_connected_date", type: "DATE",  note: "YYYY-MM-DD — first successful contact" },
          ]} />
          <Note>call_status must match exact Thai strings from the CRM system. Do not translate before uploading.</Note>
        </AccordionContent>
      </AccordionItem>

      {/* Sales */}
      <AccordionItem value="upload-sales">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">🛒 Online / Offline Sales</span>
        </AccordionTrigger>
        <AccordionContent>
          <p className="text-muted-foreground text-xs mb-2">Same schema for both online and offline files:</p>
          <UploadTable rows={[
            { col: "order_number",  type: "TEXT",    note: "Unique order identifier" },
            { col: "order_date",    type: "DATE",    note: "YYYY-MM-DD" },
            { col: "mmid",         type: "TEXT",    note: "Must match an MMID in Leads" },
            { col: "prod_num",     type: "TEXT",    note: "Must match a prod_num in Products" },
            { col: "dynamic_cmg",  type: "TEXT",    note: "FOOD RETAILER / HORECA / DISTRIBUTOR / END USER" },
            { col: "sales_qty",    type: "NUMERIC", note: "Quantity sold" },
            { col: "sales_in_vat", type: "NUMERIC", note: "Revenue including VAT (THB)" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* Products */}
      <AccordionItem value="upload-products">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">📦 Products Master</span>
        </AccordionTrigger>
        <AccordionContent>
          <UploadTable rows={[
            { col: "prod_num",       type: "TEXT", note: "Unique SKU identifier — primary key" },
            { col: "product_name_th",type: "TEXT", note: "Thai product name" },
            { col: "product_name_en",type: "TEXT", note: "English product name" },
            { col: "brands",         type: "TEXT", note: "Brand name (e.g. Dove)" },
            { col: "class_name",     type: "TEXT", note: "Product category" },
            { col: "subclass",       type: "TEXT", note: "Sub-category" },
            { col: "senior_buyer_name", type: "TEXT", note: "Senior buyer (optional)" },
            { col: "buyer_name",     type: "TEXT", note: "Buyer (optional)" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* Targets */}
      <AccordionItem value="upload-targets">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">🎯 Targets</span>
        </AccordionTrigger>
        <AccordionContent>
          <UploadTable rows={[
            { col: "month",        type: "DATE",    note: "YYYY-MM-DD (first day of month)" },
            { col: "dynamic_cmg",  type: "TEXT",    note: "FOOD RETAILER / HORECA / DISTRIBUTOR / END USER" },
            { col: "sales_target", type: "NUMERIC", note: "Monthly target in THB" },
          ]} />
          <Note>Incentive achievement uses targets for FOOD RETAILER + HORECA only (from May 2026, DISTRIBUTOR excluded).</Note>
        </AccordionContent>
      </AccordionItem>

      {/* Costs & Headcount */}
      <AccordionItem value="upload-costs">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">💰 Costs &amp; Agent Headcount</span>
        </AccordionTrigger>
        <AccordionContent>
          <p className="text-muted-foreground text-xs mb-1 font-medium">Costs (cost per head):</p>
          <UploadTable rows={[
            { col: "month",                type: "DATE",    note: "YYYY-MM-DD" },
            { col: "cost_per_agent",       type: "NUMERIC", note: "Monthly salary per agent (THB)" },
            { col: "cost_per_supervisor",  type: "NUMERIC", note: "Monthly salary per supervisor (THB)" },
          ]} />
          <p className="text-muted-foreground text-xs mt-3 mb-1 font-medium">Agent Headcount (FTE):</p>
          <UploadTable rows={[
            { col: "month",            type: "DATE",    note: "YYYY-MM-DD" },
            { col: "agent_count",      type: "INTEGER", note: "Number of active agents" },
            { col: "supervisor_count", type: "INTEGER", note: "Number of supervisors" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* Incentive Tiers */}
      <AccordionItem value="upload-incentives">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">🏆 Incentive Tiers</span>
        </AccordionTrigger>
        <AccordionContent>
          <UploadTable rows={[
            { col: "tier",               type: "NUMERIC", note: "Achievement threshold as a decimal (e.g. 0.8 = 80%)" },
            { col: "incentive_per_head", type: "NUMERIC", note: "Bonus paid per agent (THB)" },
          ]} />
          <p className="text-muted-foreground text-xs mt-2">
            System picks the <strong>highest tier ≤ achievement ratio</strong>. Example: achievement = 1.15 (115%) with tiers at 0.8 and 1.0 → uses the 1.0 tier rate.
          </p>
        </AccordionContent>
      </AccordionItem>

      {/* Mart Rebuild */}
      <AccordionItem value="rebuild">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-rose-600" />
            Mart Rebuild
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <SectionLabel>When to rebuild</SectionLabel>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside mb-3">
            <li>After uploading new sales, calls, or leads data</li>
            <li>After changing the attribution window</li>
            <li>After updating targets, costs, or incentive tiers</li>
            <li>If dashboard numbers appear stale or inconsistent</li>
          </ul>

          <SectionLabel>Attribution Window</SectionLabel>
          <p className="text-muted-foreground text-xs mb-2">
            Set in the Build tab on the Data Hub page. Default is <strong>14 days</strong>. The value used in the last rebuild is shown in the top bar as <span className="font-mono font-semibold">N-day attribution</span>.
          </p>
          <Formula>Order is attributed  IF  order_date ≤ first_connected_date + N days</Formula>
          <Note>Increasing the window increases conversion counts. Decreasing it reduces them. A rebuild is required for changes to take effect.</Note>

          <SectionLabel>What rebuild does</SectionLabel>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Drops and recreates <code>mart_telesales_orders</code> — assigns customer_type to every order</li>
            <li>Drops and recreates <code>mart_performance_cmg</code> — CMG-level KPIs per month</li>
            <li>Drops and recreates <code>mart_performance_month</code> — month-level incentive, cost, ROI</li>
          </ol>
        </AccordionContent>
      </AccordionItem>

    </Accordion>
  )
}

// ─── Main HelpSheet component ──────────────────────────────────────────────────

interface HelpSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
}

export function HelpSheet({ open, onOpenChange, isAdmin }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle className="text-base">Help &amp; User Guide</SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Explains calculations, values, and data definitions used across the dashboard.
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-6">

            {/* All Users section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">All Users</span>
              </div>
              <AllUsersContent />
            </div>

            {/* Admin section */}
            {isAdmin && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-rose-600" />
                    <span className="text-sm font-semibold">Admin Guide</span>
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Admin only</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Data upload requirements and mart rebuild instructions.
                  </p>
                  <AdminContent />
                </div>
              </>
            )}

          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
