"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard, PhoneCall, TrendingUp, Package, PiggyBank,
  Upload, DatabaseZap, Shield, Users, Clock, Download, Languages, Sparkles,
} from "lucide-react"
import type { Lang } from "@/context/LanguageContext"

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

function AllUsersContent({ lang }: { lang: Lang }) {
  return (
    <Accordion type="multiple" className="w-full">

      {/* Language */}
      <AccordionItem value="language">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-[#003DA6]" />
            {lang === 'th' ? 'การเปลี่ยนภาษาของระบบ' : 'Changing the System Language'}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {lang === 'th'
              ? 'แดชบอร์ดรองรับ 2 ภาษา ได้แก่ ภาษาไทย (TH) และภาษาอังกฤษ (EN) สามารถเปลี่ยนได้ตลอดเวลา'
              : 'The dashboard supports two languages — Thai (TH) and English (EN). You can switch at any time without losing your current filters or navigation.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'วิธีเปลี่ยนภาษา' : 'How to switch'}</SectionLabel>
          <ol className="space-y-2 list-decimal list-inside text-sm text-muted-foreground">
            <li>
              {lang === 'th'
                ? 'คลิกที่ชื่อผู้ใช้หรือรูปโปรไฟล์ ที่มุมซ้ายล่างของ Sidebar'
                : 'Click your name or profile picture at the bottom-left of the sidebar.'}
            </li>
            <li>
              {lang === 'th'
                ? 'เมนู Popup จะปรากฏขึ้น — มองหาแถว "Language"'
                : 'A popup menu will appear — look for the "Language" row.'}
            </li>
            <li>
              {lang === 'th'
                ? <>คลิกปุ่ม <span className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded">TH</span> หรือ <span className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded">EN</span> เพื่อเปลี่ยนภาษา</>
                : <>Click the <span className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded">TH</span> or <span className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded">EN</span> button to switch.</>}
            </li>
          </ol>

          <Note>
            {lang === 'th'
              ? 'ระบบจดจำภาษาที่เลือกไว้ในเบราว์เซอร์ ครั้งต่อไปที่เปิดหน้าเว็บจะแสดงภาษาเดิมโดยอัตโนมัติ'
              : 'Your language preference is saved in the browser. The next time you open the dashboard, it will automatically use the language you last selected.'}
          </Note>
        </AccordionContent>
      </AccordionItem>

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
            {lang === 'th'
              ? 'หน้าภาพรวมโครงการ ดูยอดขาย HOC เทียบ Target ลูกค้าใหม่/ประจำ และ ROI'
              : 'A single-screen summary of the entire programme — HOC Sales vs. Target, new and repeat customers, call activity, and programme ROI.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'ช่วงข้อมูลอ้างอิงจาก' : 'Date basis'}</SectionLabel>
          <p>
            <PageBadge>{lang === 'th' ? 'วันที่สั่งซื้อ (Order Date)' : 'Order Date'}</PageBadge>
            {' '}{lang === 'th' ? '— เลือกช่วงเวลาโดยคลิก chip เดือน' : '— use the month chips to select the period you want to review.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'KPI แต่ละตัวหมายถึงอะไร' : 'What each KPI means'}</SectionLabel>
          <Term label="HOC Sales">
            {lang === 'th'
              ? 'ยอดขายสินค้า Unilever HOC จากลูกค้าที่ทีม Telesales โทรหา (online + offline)'
              : 'Total revenue from Unilever HOC products ordered by customers the telesales team called, within the selected period (online + offline combined).'}
          </Term>
          <Term label="Achievement %">
            {lang === 'th'
              ? 'ยอดขายจริง ÷ เป้าหมาย × 100'
              : 'HOC Sales ÷ Target × 100 — how close the team is to hitting the monthly goal.'}
          </Term>
          <Term label={lang === 'th' ? 'ลูกค้าใหม่' : 'New Customers'}>
            {lang === 'th'
              ? 'ลูกค้าที่ซื้อ HOC ครั้งแรกหลังจากถูกโทรหา'
              : 'Customers placing their first-ever HOC order after being contacted by telesales.'}
          </Term>
          <Term label={lang === 'th' ? 'ลูกค้าประจำ' : 'Repeat Customers'}>
            {lang === 'th'
              ? 'ลูกค้าที่เคยซื้อแล้วและกลับมาซื้อซ้ำ'
              : 'Customers who already bought before and placed another order within the selected period.'}
          </Term>
          <Term label={lang === 'th' ? 'การโทรทั้งหมด' : 'Total Calls'}>
            {lang === 'th'
              ? 'จำนวนลูกค้าที่ถูกโทรหาในช่วงนั้น'
              : 'Number of customers contacted during the period, based on call records.'}
          </Term>
          <Term label="Program ROI">
            {lang === 'th'
              ? 'ยอดขาย ÷ ค่าใช้จ่ายรวม (incentive + เงินเดือน) — ROI 3x = ลงทุน 1 บาทได้ 3 บาท'
              : 'HOC Sales ÷ Total Programme Cost (incentives + agent salaries + supervisor salaries). ROI of 3× means every ฿1 spent returned ฿3 in sales.'}
          </Term>

          <SectionLabel>{lang === 'th' ? 'วิธีใช้ Filter' : 'Using the filters'}</SectionLabel>
          <Term label={lang === 'th' ? 'chip เดือน' : 'Month chips'}>
            {lang === 'th'
              ? 'คลิก 1 เดือนเพื่อเลือก คลิกเดือนอื่นเพื่อเลือกช่วง คลิกเดือนเดิมซ้ำเพื่อยกเลิก'
              : 'Click a month to select it; click another month to set a range; click the same month again to clear.'}
          </Term>
          <Term label="Segment">
            {lang === 'th'
              ? 'กรองเฉพาะกลุ่มลูกค้า เช่น FOOD RETAILER, HORECA, END USER'
              : 'Narrow down to a specific customer group — FOOD RETAILER, HORECA, END USER, etc.'}
          </Term>
          <Term label="Channel">
            {lang === 'th'
              ? 'กรอง Online หรือ Offline'
              : 'Filter to Online or Offline to compare the two sales channels.'}
          </Term>
        </AccordionContent>
      </AccordionItem>

      {/* Sales */}
      <AccordionItem value="sales">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#003DA6]" />
            {lang === 'th' ? 'ยอดขาย' : 'Sales'}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {lang === 'th'
              ? 'ยอดขาย HOC แบบละเอียด ดู online/offline เทรนด์รายเดือน และผลงาน agent'
              : 'Detailed breakdown of HOC sales — how much came from online vs. offline, how the trend looks over time, and how each agent is performing.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'ช่วงข้อมูลอ้างอิงจาก' : 'Date basis'}</SectionLabel>
          <p>
            <PageBadge>{lang === 'th' ? 'วันที่สั่งซื้อ (Order Date)' : 'Order Date'}</PageBadge>
            {' '}{lang === 'th' ? '— เลือกช่วงเวลาด้วย chip เดือนหรือ date picker' : '— use month chips or the date picker to set the period.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'KPI แต่ละตัวหมายถึงอะไร' : 'What each KPI means'}</SectionLabel>
          <Term label={lang === 'th' ? 'ยอดขายรวม' : 'Total Sales'}>
            {lang === 'th'
              ? 'ยอดขายรวมในช่วงที่เลือก ปรับตาม Conversion filter'
              : 'Combined revenue for the selected period, adjusted by the Conversion filter (All / Converted / Not Converted).'}
          </Term>
          <Term label={lang === 'th' ? 'มูลค่าสั่งซื้อเฉลี่ย' : 'Avg Order Value'}>
            {lang === 'th'
              ? 'ยอดขายเฉลี่ยต่อ 1 คำสั่งซื้อ'
              : 'Average revenue per order in the selected view.'}
          </Term>
          <Term label={lang === 'th' ? 'ลูกค้าใหม่' : 'New Customers'}>
            {lang === 'th'
              ? 'ลูกค้าใหม่ที่ซื้อ HOC ครั้งแรก (นับเฉพาะที่ convert)'
              : 'First-time HOC buyers — always counts converted customers only.'}
          </Term>
          <Term label={lang === 'th' ? 'ลูกค้าประจำ' : 'Repeat Customers'}>
            {lang === 'th'
              ? 'ลูกค้าที่กลับมาซื้อซ้ำ (นับเฉพาะที่ convert)'
              : 'Customers who came back to buy again — always counts converted customers only.'}
          </Term>

          <SectionLabel>{lang === 'th' ? 'Filter Conversion' : 'Conversion filter'}</SectionLabel>
          <Term label={lang === 'th' ? 'ลูกค้าทั้งหมด' : 'All Customers'}>
            {lang === 'th'
              ? 'ยอดขายทั้งหมด ทั้งที่ convert และยังไม่ convert'
              : 'Shows total sales including both converted and not-converted orders.'}
          </Term>
          <Term label={lang === 'th' ? 'Converted เท่านั้น' : 'Converted Only'}>
            {lang === 'th'
              ? 'เฉพาะยอดขายจากลูกค้าที่สั่งซื้อภายใน attribution window'
              : 'Only sales from customers who ordered within the attribution window.'}
          </Term>
          <Term label={lang === 'th' ? 'ไม่ Converted' : 'Not Converted'}>
            {lang === 'th'
              ? 'เฉพาะยอดขายจากลูกค้าที่สั่งซื้อนอก attribution window'
              : 'Only sales from customers who ordered outside the attribution window.'}
          </Term>

          <SectionLabel>Agent Leaderboard</SectionLabel>
          <p>
            {lang === 'th'
              ? 'จัดอันดับ agent ตามยอดขาย HOC — ตัดรายชื่อที่ยอด = 0 ออก Conv. Rate = ลูกค้าที่ convert ÷ ลูกค้าที่โทรหา'
              : 'Ranks agents by HOC converted sales. Agents with zero sales are hidden automatically. Conv. Rate = converted customers ÷ total customers called during the period.'}
          </p>
          <Note>
            {lang === 'th'
              ? 'Agent Leaderboard ใช้ Segment filter ได้ แต่ Calls ไม่แยก Segment'
              : 'The leaderboard responds to the Segment filter, but call counts are not split by segment — call records do not carry segment information.'}
          </Note>
        </AccordionContent>
      </AccordionItem>

      {/* Telesales */}
      <AccordionItem value="telesales">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-[#003DA6]" />
            {lang === 'th' ? 'เทเลเซลส์' : 'Telesales'}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {lang === 'th'
              ? 'ติดตามประสิทธิภาพการโทร ดูว่าโทรไปกี่คน ติดต่อได้กี่คน สั่งซื้อกี่คน'
              : 'Tracks how effective the calling activity is — how many customers were called, how many were reached, and how many actually placed an order.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'ช่วงข้อมูลอ้างอิงจาก' : 'Date basis'}</SectionLabel>
          <p>
            <PageBadge>{lang === 'th' ? 'วันที่โทรติดต่อครั้งแรก (First Connected Date)' : 'First Connected Date'}</PageBadge>
            {' '}{lang === 'th' ? '— วันที่ติดต่อลูกค้าได้ครั้งแรก' : '— the date a customer was first successfully contacted, used for the funnel and call counts.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'Funnel 3 ขั้นตอน' : 'The 3-step funnel'}</SectionLabel>
          <Term label={lang === 'th' ? 'รายชื่อทั้งหมด' : 'Total Leads'}>
            {lang === 'th'
              ? 'ลูกค้าทั้งหมดในรายชื่อของทีม Telesales'
              : 'All customers on the telesales team\'s calling list.'}
          </Term>
          <Term label={lang === 'th' ? 'ติดต่อได้' : 'Reached'}>
            {lang === 'th'
              ? 'ลูกค้าที่โทรติดต่อสำเร็จ (ไม่ใช่ไม่รับสายหรือปิดเครื่อง)'
              : 'Customers who were successfully contacted (excludes no-answer and unreachable).'}
          </Term>
          <Term label={lang === 'th' ? 'สั่งซื้อแล้ว' : 'Ordered'}>
            {lang === 'th'
              ? 'ลูกค้าที่ถูกโทรแล้วสั่งซื้อสินค้า HOC'
              : 'Customers who were reached and then placed a HOC order.'}
          </Term>

          <SectionLabel>{lang === 'th' ? 'อัตราที่ควรดู' : 'Key rates'}</SectionLabel>
          <Term label={lang === 'th' ? 'อัตราการติดต่อ' : 'Reach Rate'}>
            {lang === 'th'
              ? 'ติดต่อได้ ÷ รายชื่อทั้งหมด — โทรติดกี่ %'
              : 'Reached ÷ Total Leads — what percentage of the list was actually spoken to.'}
          </Term>
          <Term label={lang === 'th' ? 'อัตราการ Convert' : 'Conversion Rate'}>
            {lang === 'th'
              ? 'สั่งซื้อ ÷ ติดต่อได้ — กี่ % ที่คุยแล้วซื้อ'
              : 'Ordered ÷ Reached — of those spoken to, how many went on to buy.'}
          </Term>
        </AccordionContent>
      </AccordionItem>

      {/* Products */}
      <AccordionItem value="products">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[#003DA6]" />
            {lang === 'th' ? 'สินค้า' : 'Products'}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {lang === 'th'
              ? 'ดูว่าสินค้าตัวไหนขายดี แบ่งตาม Brand, Class, Subclass'
              : 'Shows which products are selling, broken down by Brand, product category (Class), and sub-category (Subclass).'}
          </p>

          <SectionLabel>{lang === 'th' ? 'ช่วงข้อมูลอ้างอิงจาก' : 'Date basis'}</SectionLabel>
          <p>
            <PageBadge>{lang === 'th' ? 'วันที่สั่งซื้อ (Order Date) — นับเฉพาะคำสั่งซื้อที่ convert' : 'Order Date'}</PageBadge>
            {lang === 'th' ? '' : ' — counts converted orders only.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'วิธีใช้' : 'How to use'}</SectionLabel>
          <Term label={lang === 'th' ? 'แบรนด์' : 'Brand'}>
            {lang === 'th'
              ? 'ดูว่า Dove, Sunsilk, Knorr หรือแบรนด์ไหนขายดีสุด'
              : 'See which brand — Dove, Sunsilk, Knorr, etc. — is driving the most revenue.'}
          </Term>
          <Term label={lang === 'th' ? 'หมวดหมู่' : 'Class'}>
            {lang === 'th'
              ? 'ดูตามหมวดสินค้า เช่น Hair Care, Personal Care, Food'
              : 'View performance by product category such as Hair Care, Personal Care, or Food.'}
          </Term>
          <Term label={lang === 'th' ? 'ใหม่ vs ประจำ' : 'New vs Repeat'}>
            {lang === 'th'
              ? 'แยกยอดขายว่ามาจากลูกค้าใหม่หรือลูกค้าประจำ'
              : 'Split sales between first-time buyers and returning customers.'}
          </Term>
        </AccordionContent>
      </AccordionItem>

      {/* Incentives */}
      <AccordionItem value="incentives">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-[#003DA6]" />
            {lang === 'th' ? 'รางวัลจูงใจ' : 'Incentives'}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {lang === 'th'
              ? 'ดูค่าใช้จ่ายและ incentive ของโครงการ จ่าย incentive ไปเท่าไหร่ และคุ้มค่าแค่ไหน (ROI)'
              : 'Shows programme costs and incentive payouts — how much was paid out in bonuses, and whether the investment was worthwhile (ROI).'}
          </p>

          <SectionLabel>{lang === 'th' ? 'ช่วงข้อมูลอ้างอิงจาก' : 'Date basis'}</SectionLabel>
          <p>
            <PageBadge>{lang === 'th' ? 'เดือน (Month) — ดูรายเดือนเท่านั้น' : 'Month'}</PageBadge>
            {lang === 'th' ? '' : ' — monthly view only; day-level filtering is not available here.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'การคำนวณ Achievement %' : 'How Achievement determines the incentive'}</SectionLabel>
          <p>
            {lang === 'th'
              ? 'ระบบเปรียบยอดขาย HOC กับ Target แล้วหา tier สูงสุดที่ทำได้'
              : 'The system compares HOC Sales against the month\'s target, finds the highest incentive tier reached, and calculates the payout per agent head.'}
          </p>
          <Term label="Achievement ≥ 80%">
            {lang === 'th' ? 'ได้ rate ตาม tier 80%' : 'Qualifies for the 80% tier rate.'}
          </Term>
          <Term label="Achievement ≥ 100%">
            {lang === 'th' ? 'ได้ rate ตาม tier 100% (สูงกว่า)' : 'Qualifies for the 100% tier rate (higher payout).'}
          </Term>

          <SectionLabel>{lang === 'th' ? 'สูตรคำนวณ' : 'Calculations'}</SectionLabel>
          <Formula>Total Incentive = Agent Count × Incentive per Head</Formula>
          <Formula>Total Expense = Total Incentive + Agent Salaries + Supervisor Salaries</Formula>
          <Formula>ROI = HOC Sales ÷ Total Expense</Formula>

          <Note>
            {lang === 'th'
              ? 'ตั้งแต่ พ.ค. 2569 — กลุ่ม DISTRIBUTOR ไม่รวมในการคำนวณ Achievement และ ROI'
              : 'From May 2026 onwards — the DISTRIBUTOR segment is excluded from Achievement % and ROI calculations.'}
          </Note>
        </AccordionContent>
      </AccordionItem>

      {/* Attribution Window */}
      <AccordionItem value="attribution">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#003DA6]" />
            {lang === 'th' ? 'Attribution Window คืออะไร?' : 'What is the Attribution Window?'}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {lang === 'th'
              ? <>Attribution Window คือจำนวนวันที่ระบบจะนับว่า &ldquo;คำสั่งซื้อนี้เกิดจากการโทรของทีม Telesales&rdquo;</>
              : <><strong className="text-foreground">Attribution Window</strong> is the number of days the system uses to decide whether an order counts as a result of a telesales call.</>}
          </p>
          <p>
            {lang === 'th'
              ? 'เช่น ตั้งไว้ที่ 14 วัน: ถ้าลูกค้าสั่งซื้อภายใน 14 วันหลังจากถูกโทรหาครั้งแรก — คำสั่งซื้อนั้นนับเป็นผลงานของ Telesales'
              : <>For example, with a window of <strong className="text-foreground">14 days</strong>: if a customer places an order within 14 days of being first contacted, that order is credited to the telesales programme.</>}
          </p>
          <p>
            {lang === 'th'
              ? 'ถ้าสั่งซื้อหลัง 14 วัน — ไม่นับรวมใน HOC Sales, ยอดขาย Converted หรือจำนวนลูกค้าใหม่'
              : 'If the customer orders after 14 days, the order is not counted in HOC Sales, converted revenue, or new customer numbers.'}
          </p>
          <Note>
            {lang === 'th'
              ? <>ค่า Attribution Window แสดงที่มุมขวาบนทุกหน้า เช่น <span className="font-mono font-semibold">14-day attribution</span> — การเปลี่ยนค่านี้ต้อง Build Mart ใหม่ทุกครั้ง</>
              : <>To check the current value — look at the <strong>top-right corner of every page</strong>. You will see a badge like <span className="font-mono font-semibold">14-day attribution</span>. That number is what the system is currently using. Changing it requires a Mart Rebuild — all historical numbers will recalculate.</>}
          </Note>
        </AccordionContent>
      </AccordionItem>

      {/* AI Assistant */}
      <AccordionItem value="ai-assistant">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#003DA6]" />
            {lang === 'th' ? 'ผู้ช่วย AI (AI Assistant)' : 'AI Assistant Guide'}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {lang === 'th'
              ? 'ระบบแชทผู้ช่วยวิเคราะห์ข้อมูลเชิงลึกสำหรับผู้บริหาร สามารถสอบถามสถิติต่าง ๆ จากฐานข้อมูล CockroachDB โดยใช้ภาษาพูดธรรมชาติได้ทันที'
              : 'An intelligent companion for query analysis, allowing you to fetch operational metrics directly from the CockroachDB database using natural language.'}
          </p>

          <SectionLabel>{lang === 'th' ? 'ขอบเขตข้อมูล (Data Scope)' : 'Data Scope Focus'}</SectionLabel>
          <p>
            {lang === 'th'
              ? <>ระบบผู้ช่วย AI ถูกตั้งค่าให้อ้างอิงและสรุปผลยอดขาย **Unilever Homecare** (สินค้ากลุ่มผงซักฟอก น้ำยาปรับผ้านุ่ม น้ำยาล้างจาน น้ำยาทำความสะอาด) เป็นค่าเริ่มต้น เว้นแต่ผู้ใช้งานจะระบุให้สรุปยอดขายทั้งหมดทุกแบรนด์อย่างเจาะจง</>
              : <>The AI assistant prioritizes **Unilever Homecare Sales** (Detergent, Softener, Dishwash, and Cleaning Chemicals) as the default data scope for any sales summary requests, unless you explicitly ask for overall/total sales metrics.</>}
          </p>

          <SectionLabel>{lang === 'th' ? 'ฟีเจอร์และการใช้งาน' : 'Features & Controls'}</SectionLabel>
          <Term label={lang === 'th' ? 'การปรับขนาดหน้าต่าง' : 'Resizing'}>
            {lang === 'th'
              ? 'ลากจากขอบซ้ายสุดของแผงหน้าต่างแชทเพื่อยืดขยายหน้าต่างให้กว้างขึ้น เพื่อให้อ่านตารางและข้อมูลรายละเอียดยอดขายสะดวกขึ้น'
              : 'Drag the left edge of the chatbox horizontally to expand the window width for easier reading of database tables.'}
          </Term>
          <Term label={lang === 'th' ? 'การรีเซ็ตการสนทนา' : 'Resetting Chat'}>
            {lang === 'th'
              ? 'คลิกปุ่มรีเฟรช 🔄 ที่หัวข้อแชท (Header) เพื่อล้างหน้าต่างสนทนาและล้างหน่วยความจำเดิมของ AI เพื่อเริ่มต้นหัวข้อใหม่'
              : 'Click the refresh button 🔄 in the chat header to reset conversation history and start a fresh session.'}
          </Term>
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
  lang: Lang
}

export function HelpSheet({ open, onOpenChange, isAdmin, lang }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle className="text-base">
            {lang === 'th' ? 'คู่มือการใช้งาน' : 'Help & User Guide'}
          </SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === 'th'
              ? 'แต่ละหน้าดูข้อมูลอะไร และช่วงวันที่คำนวณจากอะไร'
              : 'What each page shows and which date range it uses.'}
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-6">

            {/* All Users section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">
                  {lang === 'th' ? 'หน้าต่าง ๆ ในแดชบอร์ด' : 'Dashboard Pages'}
                </span>
              </div>
              <AllUsersContent lang={lang} />
            </div>

            {/* Admin section */}
            {isAdmin && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-rose-600" />
                    <span className="text-sm font-semibold">
                      {lang === 'th' ? 'คู่มือผู้ดูแลระบบ' : 'Admin Guide'}
                    </span>
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      {lang === 'th' ? 'เฉพาะผู้ดูแลระบบ' : 'Admin only'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {lang === 'th'
                      ? 'ข้อกำหนดการอัปโหลดข้อมูลและคำแนะนำการ Build Mart'
                      : 'Data upload requirements and mart rebuild instructions.'}
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
