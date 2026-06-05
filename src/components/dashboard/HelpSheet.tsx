"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard, PhoneCall, TrendingUp, Package, PiggyBank,
  Upload, DatabaseZap, Shield, Users, Clock, Download,
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

function TemplateDownload({ fileKey, label }: { fileKey: string; label: string }) {
  return (
    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs mt-1 mb-3" asChild>
      <a href={`/api/data/template/${fileKey}`} download>
        <Download className="h-3 w-3" />
        Download {label} template (.xlsx)
      </a>
    </Button>
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

function PageBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-blue-50 text-[#003DA6] text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-100">
      {children}
    </span>
  )
}

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
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            A single-screen summary of the entire programme — HOC Sales vs. Target, new and repeat customers, call activity, and programme ROI.
          </p>

          <SectionLabel>Date basis</SectionLabel>
          <p>
            <PageBadge>Order Date</PageBadge>
            {' '}— use the month chips to select the period you want to review.
          </p>

          <SectionLabel>What each KPI means</SectionLabel>
          <Term label="HOC Sales">Total revenue from Unilever HOC products ordered by customers the telesales team called, within the selected period (online + offline combined).</Term>
          <Term label="Achievement %">HOC Sales ÷ Target × 100 — how close the team is to hitting the monthly goal.</Term>
          <Term label="New Customers">Customers placing their first-ever HOC order after being contacted by telesales.</Term>
          <Term label="Repeat Customers">Customers who already bought before and placed another order within the selected period.</Term>
          <Term label="Total Calls">Number of customers contacted during the period, based on call records.</Term>
          <Term label="Program ROI">HOC Sales ÷ Total Programme Cost (incentives + agent salaries + supervisor salaries). ROI of 3× means every ฿1 spent returned ฿3 in sales.</Term>

          <SectionLabel>Using the filters</SectionLabel>
          <Term label="Month chips">Click a month to select it; click another month to set a range; click the same month again to clear.</Term>
          <Term label="Segment">Narrow down to a specific customer group — FOOD RETAILER, HORECA, END USER, etc.</Term>
          <Term label="Channel">Filter to Online or Offline to compare the two sales channels.</Term>
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
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Detailed breakdown of HOC sales — how much came from online vs. offline, how the trend looks over time, and how each agent is performing.
          </p>

          <SectionLabel>Date basis</SectionLabel>
          <p>
            <PageBadge>Order Date</PageBadge>
            {' '}— use month chips or the date picker to set the period.
          </p>

          <SectionLabel>What each KPI means</SectionLabel>
          <Term label="Total Sales">Combined revenue for the selected period, adjusted by the Conversion filter (All / Converted / Not Converted).</Term>
          <Term label="Avg Order Value">Average revenue per order in the selected view.</Term>
          <Term label="New Customers">First-time HOC buyers — always counts converted customers only.</Term>
          <Term label="Repeat Customers">Customers who came back to buy again — always counts converted customers only.</Term>

          <SectionLabel>Conversion filter</SectionLabel>
          <Term label="All Customers">Shows total sales including both converted and not-converted orders.</Term>
          <Term label="Converted Only">Only sales from customers who ordered within the attribution window.</Term>
          <Term label="Not Converted">Only sales from customers who ordered outside the attribution window.</Term>

          <SectionLabel>Agent Leaderboard</SectionLabel>
          <p>Ranks agents by HOC converted sales. Agents with zero sales are hidden automatically. Conv. Rate = converted customers ÷ total customers called during the period.</p>
          <Note>The leaderboard responds to the Segment filter, but call counts are not split by segment — call records do not carry segment information.</Note>
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
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Tracks how effective the calling activity is — how many customers were called, how many were reached, and how many actually placed an order.
          </p>

          <SectionLabel>Date basis</SectionLabel>
          <p>
            <PageBadge>First Connected Date</PageBadge>
            {' '}— the date a customer was first successfully contacted, used for the funnel and call counts.
          </p>

          <SectionLabel>The 3-step funnel</SectionLabel>
          <Term label="Total Leads">All customers on the telesales team&apos;s calling list.</Term>
          <Term label="Reached">Customers who were successfully contacted (excludes no-answer and unreachable).</Term>
          <Term label="Ordered">Customers who were reached and then placed a HOC order.</Term>

          <SectionLabel>Key rates</SectionLabel>
          <Term label="Reach Rate">Reached ÷ Total Leads — what percentage of the list was actually spoken to.</Term>
          <Term label="Conversion Rate">Ordered ÷ Reached — of those spoken to, how many went on to buy.</Term>
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
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Shows which products are selling, broken down by Brand, product category (Class), and sub-category (Subclass).
          </p>

          <SectionLabel>Date basis</SectionLabel>
          <p>
            <PageBadge>Order Date</PageBadge>
            {' '}— counts converted orders only.
          </p>

          <SectionLabel>How to use</SectionLabel>
          <Term label="Brand">See which brand — Dove, Sunsilk, Knorr, etc. — is driving the most revenue.</Term>
          <Term label="Class">View performance by product category such as Hair Care, Personal Care, or Food.</Term>
          <Term label="New vs Repeat">Split sales between first-time buyers and returning customers.</Term>
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
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Shows programme costs and incentive payouts — how much was paid out in bonuses, and whether the investment was worthwhile (ROI).
          </p>

          <SectionLabel>Date basis</SectionLabel>
          <p>
            <PageBadge>Month</PageBadge>
            {' '}— monthly view only; day-level filtering is not available here.
          </p>

          <SectionLabel>How Achievement determines the incentive</SectionLabel>
          <p>
            The system compares HOC Sales against the month&apos;s target, finds the highest incentive tier reached, and calculates the payout per agent head.
          </p>
          <Term label="Achievement ≥ 80%">Qualifies for the 80% tier rate.</Term>
          <Term label="Achievement ≥ 100%">Qualifies for the 100% tier rate (higher payout).</Term>

          <SectionLabel>Calculations</SectionLabel>
          <Formula>Total Incentive = Agent Count × Incentive per Head</Formula>
          <Formula>Total Expense = Total Incentive + Agent Salaries + Supervisor Salaries</Formula>
          <Formula>ROI = HOC Sales ÷ Total Expense</Formula>

          <Note>
            From May 2026 onwards — the DISTRIBUTOR segment is excluded from Achievement % and ROI calculations.
          </Note>
        </AccordionContent>
      </AccordionItem>

      {/* Attribution Window */}
      <AccordionItem value="attribution">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#003DA6]" />
            What is the Attribution Window?
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The <strong className="text-foreground">Attribution Window</strong> is the number of days the system uses to decide whether an order counts as a result of a telesales call.
          </p>
          <p>
            For example, with a window of <strong className="text-foreground">14 days</strong>: if a customer places an order within 14 days of being first contacted, that order is credited to the telesales programme.
          </p>
          <p>
            If the customer orders after 14 days, the order is not counted in HOC Sales, converted revenue, or new customer numbers.
          </p>
          <Note>
            To check the current value — look at the <strong>top-right corner of every page</strong>. You will see a badge like <span className="font-mono font-semibold">14-day attribution</span>. That number is what the system is currently using. Changing it requires a Mart Rebuild — all historical numbers will recalculate.
          </Note>
        </AccordionContent>
      </AccordionItem>

    </Accordion>
  )
}

function AdminContent() {
  return (
    <Accordion type="multiple" className="w-full">

      {/* 1. Upload order */}
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
          <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
            <li><span className="font-semibold text-foreground">Products</span> — must exist before sales orders (prod_num lookup)</li>
            <li><span className="font-semibold text-foreground">Leads</span> — MMID master list</li>
            <li><span className="font-semibold text-foreground">Telesales Calls</span> — requires MMIDs from Leads</li>
            <li><span className="font-semibold text-foreground">Online Sales</span> — requires prod_num from Products</li>
            <li><span className="font-semibold text-foreground">Offline Sales</span> — requires prod_num from Products</li>
            <li><span className="font-semibold text-foreground">Targets</span> — monthly targets per segment</li>
            <li><span className="font-semibold text-foreground">Costs</span> — monthly cost per head</li>
            <li><span className="font-semibold text-foreground">Agent Headcount</span> — monthly FTE counts</li>
            <li><span className="font-semibold text-foreground">Incentive Tiers</span> — tier → rate mapping</li>
          </ol>
          <Note>After uploading new sales or calls data, always rebuild the mart to update all dashboard KPIs.</Note>
        </AccordionContent>
      </AccordionItem>

      {/* 2. Mart Rebuild — promoted to position 2 */}
      <AccordionItem value="rebuild">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-rose-600" />
            <span>Mart Rebuild</span>
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">Required after upload</Badge>
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
            <li>Drops and recreates <code>mart_performance_cmg</code> — segment-level KPIs per month</li>
            <li>Drops and recreates <code>mart_performance_month</code> — month-level incentive, cost, ROI</li>
          </ol>
        </AccordionContent>
      </AccordionItem>

      {/* 3. Leads */}
      <AccordionItem value="upload-leads">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">📋 Leads (MMID Master)</span>
        </AccordionTrigger>
        <AccordionContent>
          <TemplateDownload fileKey="leads" label="Leads" />
          <UploadTable rows={[
            { col: "mmid",               type: "TEXT", note: "Unique customer ID — primary key" },
            { col: "tier",               type: "TEXT", note: "e.g. Gold, Silver, Bronze" },
            { col: "lead_customers",     type: "TEXT", note: "Customer segment assigned to this lead" },
            { col: "senior_buyer_name",  type: "TEXT", note: "Senior buyer name (optional)" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* 4. Telesales Calls */}
      <AccordionItem value="upload-calls">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">📞 Telesales Calls</span>
        </AccordionTrigger>
        <AccordionContent>
          <TemplateDownload fileKey="telesales_calls" label="Telesales Calls" />
          <UploadTable rows={[
            { col: "mmid",                 type: "TEXT", note: "Must match an MMID in Leads" },
            { col: "agent",                type: "TEXT", note: "Agent name or ID" },
            { col: "call_status",          type: "TEXT", note: "Thai call status value (from CRM)" },
            { col: "first_connected_date", type: "DATE", note: "YYYY-MM-DD — first successful contact" },
          ]} />
          <Note>call_status must match exact Thai strings from the CRM system. Do not translate before uploading.</Note>
        </AccordionContent>
      </AccordionItem>

      {/* 5. Online Sales */}
      <AccordionItem value="upload-online">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">🛒 Online Sales</span>
        </AccordionTrigger>
        <AccordionContent>
          <TemplateDownload fileKey="online_sales" label="Online Sales" />
          <UploadTable rows={[
            { col: "order_number",  type: "TEXT",    note: "Unique order identifier" },
            { col: "order_date",    type: "DATE",    note: "YYYY-MM-DD" },
            { col: "mmid",          type: "TEXT",    note: "Must match an MMID in Leads" },
            { col: "prod_num",      type: "TEXT",    note: "Must match a prod_num in Products" },
            { col: "dynamic_cmg",   type: "TEXT",    note: "FOOD RETAILER / HORECA / DISTRIBUTOR / END USER" },
            { col: "sales_qty",     type: "NUMERIC", note: "Quantity sold" },
            { col: "sales_in_vat",  type: "NUMERIC", note: "Revenue including VAT (THB)" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* 6. Offline Sales */}
      <AccordionItem value="upload-offline">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">🏪 Offline Sales</span>
        </AccordionTrigger>
        <AccordionContent>
          <TemplateDownload fileKey="offline_sales" label="Offline Sales" />
          <UploadTable rows={[
            { col: "order_number",  type: "TEXT",    note: "Unique order identifier" },
            { col: "order_date",    type: "DATE",    note: "YYYY-MM-DD" },
            { col: "mmid",          type: "TEXT",    note: "Must match an MMID in Leads" },
            { col: "prod_num",      type: "TEXT",    note: "Must match a prod_num in Products" },
            { col: "dynamic_cmg",   type: "TEXT",    note: "FOOD RETAILER / HORECA / DISTRIBUTOR / END USER" },
            { col: "sales_qty",     type: "NUMERIC", note: "Quantity sold" },
            { col: "sales_in_vat",  type: "NUMERIC", note: "Revenue including VAT (THB)" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* 7. Products */}
      <AccordionItem value="upload-products">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">📦 Products Master</span>
        </AccordionTrigger>
        <AccordionContent>
          <TemplateDownload fileKey="products" label="Products" />
          <UploadTable rows={[
            { col: "prod_num",          type: "TEXT", note: "Unique SKU identifier — primary key" },
            { col: "product_name_th",   type: "TEXT", note: "Thai product name" },
            { col: "product_name_en",   type: "TEXT", note: "English product name" },
            { col: "brands",            type: "TEXT", note: "Brand name (e.g. Dove)" },
            { col: "class_name",        type: "TEXT", note: "Product category" },
            { col: "subclass",          type: "TEXT", note: "Sub-category" },
            { col: "senior_buyer_name", type: "TEXT", note: "Senior buyer (optional)" },
            { col: "buyer_name",        type: "TEXT", note: "Buyer (optional)" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* 8. Targets */}
      <AccordionItem value="upload-targets">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">🎯 Targets</span>
        </AccordionTrigger>
        <AccordionContent>
          <TemplateDownload fileKey="targets" label="Targets" />
          <UploadTable rows={[
            { col: "month",        type: "DATE",    note: "YYYY-MM-DD (first day of month)" },
            { col: "dynamic_cmg",  type: "TEXT",    note: "FOOD RETAILER / HORECA / DISTRIBUTOR / END USER" },
            { col: "sales_target", type: "NUMERIC", note: "Monthly target in THB" },
          ]} />
          <Note>Incentive achievement uses targets for FOOD RETAILER + HORECA only (from May 2026, DISTRIBUTOR excluded).</Note>
        </AccordionContent>
      </AccordionItem>

      {/* 9. Costs */}
      <AccordionItem value="upload-costs">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">💰 Costs (per head)</span>
        </AccordionTrigger>
        <AccordionContent>
          <TemplateDownload fileKey="costs" label="Costs" />
          <UploadTable rows={[
            { col: "month",               type: "DATE",    note: "YYYY-MM-DD" },
            { col: "cost_per_agent",      type: "NUMERIC", note: "Monthly salary per agent (THB)" },
            { col: "cost_per_supervisor", type: "NUMERIC", note: "Monthly salary per supervisor (THB)" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* 10. Agent Headcount */}
      <AccordionItem value="upload-headcount">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">👥 Agent Headcount</span>
        </AccordionTrigger>
        <AccordionContent>
          <TemplateDownload fileKey="agent_headcount" label="Agent Headcount" />
          <UploadTable rows={[
            { col: "month",            type: "DATE",    note: "YYYY-MM-DD" },
            { col: "agent_count",      type: "INTEGER", note: "Number of active agents" },
            { col: "supervisor_count", type: "INTEGER", note: "Number of supervisors" },
          ]} />
        </AccordionContent>
      </AccordionItem>

      {/* 11. Incentive Tiers */}
      <AccordionItem value="upload-incentives">
        <AccordionTrigger>
          <span className="flex items-center gap-2 text-sm">🏆 Incentive Tiers</span>
        </AccordionTrigger>
        <AccordionContent>
          <TemplateDownload fileKey="incentives" label="Incentive Tiers" />
          <UploadTable rows={[
            { col: "tier",               type: "NUMERIC", note: "Achievement threshold as decimal (0.8 = 80%)" },
            { col: "incentive_per_head", type: "NUMERIC", note: "Bonus per agent (THB)" },
          ]} />
          <p className="text-muted-foreground text-xs mt-2">
            System picks the <strong>highest tier ≤ achievement ratio</strong>. Example: achievement 115% with tiers at 0.8 and 1.0 → uses 1.0 tier rate.
          </p>
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
            What each page shows and which date range it uses.
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-6">

            {/* All Users section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Dashboard Pages</span>
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
