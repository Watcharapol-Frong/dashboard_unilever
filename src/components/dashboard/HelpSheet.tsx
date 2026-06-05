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
            หน้าภาพรวมโครงการทั้งหมด ดูได้ในคลิกเดียวว่าตอนนี้โครงการเป็นอย่างไร ยอดขาย HOC เทียบ Target ได้เท่าไหร่ ลูกค้าใหม่/ลูกค้าประจำมีกี่คน และ ROI ของโครงการ
          </p>

          <SectionLabel>ช่วงข้อมูลอ้างอิงจาก</SectionLabel>
          <p>
            <PageBadge>วันที่สั่งซื้อ (Order Date)</PageBadge>
            {' '}ใช้เป็นหลัก — เลือก month chip เพื่อกรองช่วงเวลาที่ต้องการดู
          </p>

          <SectionLabel>KPI แต่ละตัวหมายถึงอะไร</SectionLabel>
          <Term label="HOC Sales">ยอดขายสินค้า Unilever HOC จากลูกค้าที่ทีม Telesales โทรหาและสั่งซื้อภายในช่วงที่กำหนด (online + offline รวมกัน)</Term>
          <Term label="Achievement %">ยอดขายจริง ÷ เป้าหมาย × 100 — บอกว่าทำได้กี่ % ของ target</Term>
          <Term label="New Customers">ลูกค้าที่ซื้อสินค้า HOC ครั้งแรก ภายหลังจากที่ทีม telesales โทรหา</Term>
          <Term label="Repeat Customers">ลูกค้าที่เคยซื้อแล้ว และกลับมาซื้อซ้ำอีกครั้งภายในช่วงที่กำหนด</Term>
          <Term label="Total Calls">จำนวนลูกค้าที่ถูกโทรหาในช่วงนั้น (นับจากบันทึกการโทร)</Term>
          <Term label="Program ROI">ยอดขายที่นับได้ ÷ ค่าใช้จ่ายทั้งหมด (incentive + เงินเดือน agent + supervisor) — ถ้า ROI = 3x หมายความว่าทุก 1 บาทที่ลงทุนได้กลับมา 3 บาท</Term>

          <SectionLabel>วิธีใช้ Filter</SectionLabel>
          <Term label="Month chips">คลิก 1 เดือนเพื่อเลือก คลิกเดือนอื่นเพื่อเลือกช่วง (range) คลิกเดือนเดิมซ้ำเพื่อยกเลิก</Term>
          <Term label="Segment">กรองเฉพาะกลุ่มลูกค้า เช่น FOOD RETAILER, HORECA, END USER</Term>
          <Term label="Channel">กรอง Online หรือ Offline เพื่อแยกดูยอดขายแต่ละช่องทาง</Term>
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
            หน้าวิเคราะห์ยอดขาย HOC แบบละเอียด ดูได้ว่ายอดมาจาก online/offline เท่าไหร่ เทรนด์รายเดือนเป็นอย่างไร และ agent แต่ละคนทำผลงานได้แค่ไหน
          </p>

          <SectionLabel>ช่วงข้อมูลอ้างอิงจาก</SectionLabel>
          <p>
            <PageBadge>วันที่สั่งซื้อ (Order Date)</PageBadge>
            {' '}— เลือก month chip หรือ date picker เพื่อกำหนดช่วงเวลา
          </p>

          <SectionLabel>KPI แต่ละตัวหมายถึงอะไร</SectionLabel>
          <Term label="Total Sales">ยอดขายรวมทั้งหมดในช่วงที่เลือก ขึ้นอยู่กับ Filter Conversion ที่เลือก (All / Converted / Not Converted)</Term>
          <Term label="Avg Order Value">ยอดขายเฉลี่ยต่อ 1 คำสั่งซื้อ</Term>
          <Term label="New Customers">ลูกค้าใหม่ที่ซื้อสินค้า HOC ครั้งแรก (นับเฉพาะที่ convert แล้วเสมอ)</Term>
          <Term label="Repeat Customers">ลูกค้าที่กลับมาซื้อซ้ำ (นับเฉพาะที่ convert แล้วเสมอ)</Term>

          <SectionLabel>Filter Conversion</SectionLabel>
          <Term label="All Customers">แสดงยอดขายทั้งหมด ทั้งที่ convert และยังไม่ convert</Term>
          <Term label="Converted Only">เฉพาะยอดขายจากลูกค้าที่สั่งซื้อภายในช่วงเวลาที่นับ (attribution window)</Term>
          <Term label="Not Converted">เฉพาะยอดขายจากลูกค้าที่สั่งซื้อนอกช่วงเวลาที่นับ</Term>

          <SectionLabel>Agent Leaderboard</SectionLabel>
          <p>จัดอันดับ agent ตามยอดขาย HOC ที่ convert ได้ — ตัดรายชื่อที่ยอดขาย = 0 ออกอัตโนมัติ Conv. Rate คำนวณจาก ลูกค้าที่ convert ÷ ลูกค้าทั้งหมดที่โทรหาในช่วงนั้น</p>
          <Note>Agent Leaderboard ใช้ Segment filter ได้ แต่ Calls ไม่แยก Segment เพราะบันทึกการโทรไม่มีข้อมูล Segment</Note>
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
            หน้าติดตามประสิทธิภาพการโทร ดูได้ว่าโทรหาลูกค้าไปกี่คน ติดต่อได้กี่คน และสุดท้ายมีกี่คนที่สั่งซื้อจริง
          </p>

          <SectionLabel>ช่วงข้อมูลอ้างอิงจาก</SectionLabel>
          <p>
            <PageBadge>วันที่โทรติดต่อครั้งแรก (First Connected Date)</PageBadge>
            {' '}— ใช้เป็นหลักสำหรับ funnel และจำนวน calls
          </p>

          <SectionLabel>Funnel 3 ขั้นตอน</SectionLabel>
          <Term label="Total Leads">ลูกค้าทั้งหมดที่อยู่ในรายชื่อของทีม Telesales</Term>
          <Term label="Reached">ลูกค้าที่โทรหาแล้วติดต่อได้ (ไม่ใช่ "ไม่รับสาย" หรือ "ปิดเครื่อง")</Term>
          <Term label="Ordered">ลูกค้าที่โทรแล้วสั่งซื้อสินค้า HOC จริง</Term>

          <SectionLabel>อัตราที่ควรดู</SectionLabel>
          <Term label="Reach Rate">ติดต่อได้ ÷ รายชื่อทั้งหมด — บอกว่าโทรติดกี่ %</Term>
          <Term label="Conversion Rate">สั่งซื้อ ÷ ติดต่อได้ — บอกว่าลูกค้าที่คุยด้วยกลายเป็นผู้ซื้อกี่ %</Term>
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
            หน้าดูว่าสินค้าตัวไหนขายดี แบ่งตาม Brand, หมวดหมู่สินค้า (Class) และหมวดย่อย (Subclass)
          </p>

          <SectionLabel>ช่วงข้อมูลอ้างอิงจาก</SectionLabel>
          <p>
            <PageBadge>วันที่สั่งซื้อ (Order Date)</PageBadge>
            {' '}— นับเฉพาะคำสั่งซื้อจากลูกค้าที่ convert แล้วเท่านั้น
          </p>

          <SectionLabel>วิธีใช้</SectionLabel>
          <Term label="Brand">ดูว่า Dove, Sunsilk, Knorr หรือแบรนด์ไหนขายได้มากที่สุด</Term>
          <Term label="Class">ดูตามหมวดสินค้า เช่น Hair Care, Personal Care, Food</Term>
          <Term label="New vs Repeat">แยกยอดขายว่ามาจากลูกค้าใหม่หรือลูกค้าประจำ</Term>
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
            หน้าดูค่าใช้จ่ายและ incentive ของโครงการ คำนวณว่าจ่าย incentive ไปเท่าไหร่ และคุ้มค่าเพียงใด (ROI)
          </p>

          <SectionLabel>ช่วงข้อมูลอ้างอิงจาก</SectionLabel>
          <p>
            <PageBadge>เดือน (Month)</PageBadge>
            {' '}— รายงานระดับเดือน ไม่สามารถกรองรายวันได้
          </p>

          <SectionLabel>การคำนวณ Achievement %</SectionLabel>
          <p>
            ระบบจะเปรียบยอดขาย HOC กับ Target ของเดือนนั้น แล้วหา tier ที่สูงที่สุดที่ทำได้ เพื่อคำนวณ incentive ต่อหัว
          </p>
          <Term label="Achievement ≥ 80%">ได้ rate ตาม tier 80%</Term>
          <Term label="Achievement ≥ 100%">ได้ rate ตาม tier 100% (สูงกว่า)</Term>

          <SectionLabel>สูตรคำนวณ</SectionLabel>
          <Formula>Incentive รวม = จำนวน Agent × Incentive ต่อหัว</Formula>
          <Formula>ค่าใช้จ่ายรวม = Incentive + เงินเดือน Agent + เงินเดือน Supervisor</Formula>
          <Formula>ROI = ยอดขาย HOC ÷ ค่าใช้จ่ายรวม</Formula>

          <Note>
            ตั้งแต่ พ.ค. 2569 เป็นต้นไป — กลุ่ม DISTRIBUTOR ไม่รวมอยู่ในการคำนวณ Achievement และ ROI
          </Note>
        </AccordionContent>
      </AccordionItem>

      {/* Attribution Window */}
      <AccordionItem value="attribution">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#003DA6]" />
            Attribution Window คืออะไร?
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Attribution Window</strong> คือจำนวนวันที่ระบบจะนับว่า "คำสั่งซื้อนี้เกิดจากการโทรของทีม Telesales"
          </p>
          <p>
            เช่น ถ้าตั้งไว้ที่ <strong className="text-foreground">14 วัน</strong> หมายความว่า ถ้าลูกค้าสั่งซื้อภายใน 14 วันหลังจากที่ถูกโทรหาครั้งแรก — คำสั่งซื้อนั้นจะถูกนับเป็นผลงานของ Telesales
          </p>
          <p>
            ถ้าลูกค้าสั่งซื้อหลังจาก 14 วัน — จะไม่นับรวมใน HOC Sales, ยอดขาย Converted หรือจำนวนลูกค้าใหม่
          </p>
          <Note>
            ค่า Attribution Window ที่ใช้อยู่แสดงที่แถบด้านบน — การเปลี่ยนค่านี้ต้อง Build Mart ใหม่ทุกครั้ง
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
          <SheetTitle className="text-base">คู่มือการใช้งาน</SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            แต่ละหน้าดูข้อมูลอะไร และช่วงวันที่คำนวณจากอะไร
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-6">

            {/* All Users section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">หน้าต่าง ๆ ในแดชบอร์ด</span>
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
