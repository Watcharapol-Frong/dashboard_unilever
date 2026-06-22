'use client'

import { useState, useMemo, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard, ShoppingCart, Phone, Users, Database,
  BookOpen, Settings, HelpCircle, MessageSquarePlus,
  Search, ImagePlus, X, CheckCircle2, Loader2,
} from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { t } from '@/lib/i18n'

// ── Content ───────────────────────────────────────────────────────────────────

const PAGES = [
  {
    icon: LayoutDashboard,
    en: { title: 'Overview', audience: 'Manager / Supervisor', desc: 'Top-level KPI snapshot — HOC Sales, Achievement, Buyers, ROI, Telesales trend, Agent Leaderboard, and Product Bubble Map. Best used for the morning check.', filters: 'Date range, CMG' },
    th: { title: 'ภาพรวม', audience: 'ผู้จัดการ / หัวหน้างาน', desc: 'ภาพรวม KPI หลัก — ยอดขาย HOC, ผลสำเร็จ, ลูกค้า, ROI, แนวโน้ม Telesales, อันดับ Agent และ Bubble Map สินค้า เหมาะสำหรับการเช็คตอนเช้า', filters: 'ช่วงเวลา, CMG' },
  },
  {
    icon: ShoppingCart,
    en: { title: 'Order Sales', audience: 'Sales Manager / Account Manager', desc: 'HOC sales trend (online/offline), channel breakdown, new vs. repeat customers, and agent leaderboard by sales. All figures show converted orders only.', filters: 'Date range, CMG' },
    th: { title: 'ยอดขาย', audience: 'ผู้จัดการฝ่ายขาย / Account Manager', desc: 'แนวโน้มยอดขาย HOC (ออนไลน์/ออฟไลน์), แยกช่องทาง, ลูกค้าใหม่ vs ประจำ และอันดับ Agent ตามยอดขาย ตัวเลขทั้งหมดแสดงเฉพาะออเดอร์ Converted', filters: 'ช่วงเวลา, CMG' },
  },
  {
    icon: Phone,
    en: { title: 'Telesales', audience: 'Telesales Supervisor / Team Lead', desc: 'Call-centre performance — Reach Rate, Conversion Rate, Conversion Funnel (Total Calls → Reached → Interested → Converted), Call Status by Tier, and Agent Leaderboard.', filters: 'Date range, Channel, CMG, Agent' },
    th: { title: 'Telesales', audience: 'หัวหน้า Telesales / Team Lead', desc: 'ผลการทำงาน Call Centre — อัตราติดต่อ, อัตรา Convert, Conversion Funnel (การโทรทั้งหมด → ติดต่อได้ → สนใจ → Convert), สถานะโทรตาม Tier และอันดับ Agent', filters: 'ช่วงเวลา, ช่องทาง, CMG, Agent' },
  },
  {
    icon: Users,
    en: { title: 'Leads', audience: 'Admin / Telesales Supervisor', desc: 'Full lead list with contact badge, conversion badge, HOC orders and HOC sales per customer. KPI cards always show global totals regardless of table filters.', filters: 'Tier, Contact, Conversion, CMG, Agent, Search' },
    th: { title: 'รายชื่อลูกค้า', audience: 'Admin / หัวหน้า Telesales', desc: 'รายชื่อ Lead ทั้งหมดพร้อม badge การติดต่อ, badge การ Convert, คำสั่งซื้อและยอดขาย HOC ต่อลูกค้า การ์ด KPI แสดงยอดรวมทั้งหมดเสมอ ไม่ถูกกรองโดย filter ของตาราง', filters: 'Tier, การติดต่อ, การ Convert, CMG, Agent, ค้นหา' },
  },
  {
    icon: Database,
    en: { title: 'Data Hub', audience: 'Admin only', desc: 'Upload CSV data files, view upload history, monitor ETL status, and trigger Build Mart. Build Mart rebuilds all aggregated tables and takes 2–5 minutes via GitHub Actions.', filters: '—' },
    th: { title: 'Data Hub', audience: 'Admin เท่านั้น', desc: 'อัพโหลดไฟล์ CSV, ดูประวัติการอัพโหลด, ตรวจสอบสถานะ ETL และเรียก Build Mart การ Build Mart จะ rebuild ตารางสรุปทั้งหมดใช้เวลา 2–5 นาทีผ่าน GitHub Actions', filters: '—' },
  },
]

const METRICS = [
  { key: 'HOC Order',        formula: '—',                                   en: 'An order where the product has an English product name in the product master. Only HOC orders appear in the dashboard.', th: 'ออเดอร์ที่สินค้ามีชื่อภาษาอังกฤษในฐานข้อมูลสินค้า เฉพาะออเดอร์ HOC เท่านั้นที่แสดงในแดชบอร์ด' },
  { key: 'Converted',        formula: 'new_customer + retention',             en: 'Orders within the attribution window after first contact. Counts as a telesales success.', th: 'ออเดอร์ภายใน attribution window หลังการติดต่อครั้งแรก นับเป็นความสำเร็จของ Telesales' },
  { key: 'Reached',          formula: '—',                                   en: 'Customer answered the call. Excludes: no answer (ไม่รับสาย) and unreachable (ปิดเครื่อง).', th: 'ลูกค้ารับสาย ไม่รวม: ไม่รับสาย และปิดเครื่อง/ติดต่อไม่ได้' },
  { key: 'Interested',       formula: 'Reached − (ไม่สะดวกคุย + ยังไม่ต้องการ)', en: 'Reached customers who did not decline to engage. Excludes "not convenient" and "not ready to buy".', th: 'ลูกค้าที่รับสายและไม่ปฏิเสธการสนทนา ไม่รวมสถานะ ไม่สะดวกคุย และ ยังไม่ต้องการสินค้า' },
  { key: 'Reach Rate',       formula: 'Reached ÷ Total Calls',               en: 'Percentage of call attempts where the customer answered.', th: 'สัดส่วนของการโทรที่ลูกค้ารับสาย' },
  { key: 'Conversion Rate',  formula: 'Converted ÷ Reached',                 en: 'Of all customers who answered, how many placed an HOC order within the window. Unanswered calls are excluded.', th: 'จากลูกค้าที่รับสายทั้งหมด มีกี่คนที่สั่งซื้อ HOC ภายใน window ไม่นับการโทรที่ไม่มีคนรับ' },
  { key: 'New Customer',     formula: 'customer_type = new_customer',        en: 'First-ever HOC order placed within the attribution window.', th: 'การสั่งซื้อ HOC ครั้งแรกที่อยู่ภายใน attribution window' },
  { key: 'Repeat Customer',  formula: 'customer_type = retention',           en: 'Reordered HOC products within the attribution window.', th: 'สั่งซื้อ HOC ซ้ำภายใน attribution window' },
  { key: 'Attribution Window', formula: 'order_date ≤ first_contact + N days', en: 'Time window after first contact in which an order counts as converted. Default: 14 days, configurable at Build Mart time.', th: 'ช่วงเวลาหลังการติดต่อครั้งแรกที่ออเดอร์นับว่า convert ค่าเริ่มต้น 14 วัน ปรับได้ตอน Build Mart' },
  { key: 'ROI',              formula: 'HOC Sales ÷ Total Expense',           en: 'Programme-level ROI. Not split by CMG — covers all segments regardless of filters.', th: 'ROI ระดับโปรแกรม ไม่แยกตาม CMG ครอบคลุมทุกกลุ่มเสมอ' },
]

const FAQS = [
  { en: { q: 'Data is not updating after I uploaded a file', a: 'After uploading CSV files in Data Hub, you must run Build Mart. Go to Data Hub → Build Mart tab → click Build. Wait 2–5 minutes for the rebuild to complete.' }, th: { q: 'ข้อมูลไม่อัพเดตหลังจากอัพโหลดไฟล์', a: 'หลังอัพโหลดไฟล์ CSV ใน Data Hub ต้องรัน Build Mart ไปที่ Data Hub → แถบ Build Mart → คลิก Build รอ 2–5 นาทีให้ rebuild เสร็จ' } },
  { en: { q: 'Conversion Rate is showing 0% or —', a: 'This usually means no customers were Reached in the selected period. Try widening the date range or clearing the filters.' }, th: { q: 'Conversion Rate แสดงเป็น 0% หรือ —', a: 'โดยปกติหมายความว่าไม่มีลูกค้าที่ติดต่อได้ (Reached) ในช่วงเวลาที่เลือก ลองขยายช่วงวันหรือ reset filter' } },
  { en: { q: 'Interested, Not Converted shows 0', a: 'This means all customers who engaged (Interested stage) went on to place an HOC order. This is a genuinely positive result.' }, th: { q: 'Interested, Not Converted แสดงเป็น 0', a: 'หมายความว่าลูกค้าทุกคนที่ผ่านขั้น Interested ได้สั่งซื้อ HOC ทั้งหมด นี่คือผลลัพธ์ที่ดีมาก' } },
  { en: { q: 'Why does the ROI not change when I filter by CMG?', a: 'ROI is calculated at the programme level. Agent costs and incentives are shared across all segments, so it cannot be split by CMG or channel.' }, th: { q: 'ทำไม ROI ไม่เปลี่ยนเมื่อกรองตาม CMG?', a: 'ROI คำนวณระดับโปรแกรม ค่าใช้จ่าย Agent และ Incentive เป็นส่วนกลาง ไม่สามารถแยกตาม CMG หรือช่องทางได้' } },
  { en: { q: 'The Freshness Bar shows an amber warning', a: 'The mart data is more than 24 hours old. Go to Data Hub → Build Mart and trigger a rebuild to refresh the data.' }, th: { q: 'แถบ Freshness แสดงสีเหลือง', a: 'ข้อมูล mart เก่ากว่า 24 ชั่วโมง ไปที่ Data Hub → Build Mart และกด Build เพื่อรีเฟรชข้อมูล' } },
]

const ADMIN_STEPS = {
  upload: {
    en: ['Go to Data Hub → click Upload', 'Select the file type (Online Sales, Offline Sales, Leads, etc.)', 'Choose your CSV file → Upload', 'Check the History tab — status should show Pass', 'Repeat for each file type needed', 'Run Build Mart when all uploads are done'],
    th: ['ไปที่ Data Hub → คลิก Upload', 'เลือกประเภทไฟล์ (Online Sales, Offline Sales, Leads ฯลฯ)', 'เลือกไฟล์ CSV → Upload', 'ตรวจสอบแถบ History — สถานะควรแสดง Pass', 'ทำซ้ำสำหรับแต่ละประเภทไฟล์ที่ต้องการ', 'รัน Build Mart เมื่ออัพโหลดครบทุกไฟล์'],
  },
  build: {
    en: ['Go to Data Hub → Build Mart tab', 'Select the attribution window (default: 14 days)', 'Click Build — this triggers a GitHub Actions workflow', 'Wait 2–5 minutes for the build to complete', 'All dashboard pages refresh automatically when done'],
    th: ['ไปที่ Data Hub → แถบ Build Mart', 'เลือก attribution window (ค่าเริ่มต้น: 14 วัน)', 'คลิก Build — จะเรียก GitHub Actions workflow', 'รอ 2–5 นาทีให้ build เสร็จสมบูรณ์', 'หน้าแดชบอร์ดทั้งหมดจะรีเฟรชอัตโนมัติเมื่อเสร็จ'],
  },
}

const PAGE_OPTIONS = ['Overview', 'Order Sales', 'Telesales', 'Leads', 'Data Hub', 'Raw Data', 'Other']
const TYPE_OPTIONS = [
  { value: 'bug',     labelEn: '🔴 Bug Report',       labelTh: '🔴 แจ้งปัญหา' },
  { value: 'feature', labelEn: '💡 Feature Request',  labelTh: '💡 ขอ Feature' },
  { value: 'other',   labelEn: '❓ Other',             labelTh: '❓ อื่นๆ' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function HelpClient() {
  const { lang } = useLanguage()
  const { user } = useUser()
  const isTh = lang === 'th'

  const [search, setSearch] = useState('')
  const [type, setType]             = useState('bug')
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [page, setPage]             = useState(PAGE_OPTIONS[0])
  const [image, setImage]           = useState<File | null>(null)
  const [preview, setPreview]       = useState<string | null>(null)
  const [sending, setSending]       = useState(false)
  const [sent, setSent]             = useState(false)
  const [error, setError]           = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const q = search.toLowerCase()
  const matchPage    = !q || isTh ? PAGES.some(p => p.th.title.toLowerCase().includes(q) || p.th.desc.toLowerCase().includes(q)) : PAGES.some(p => p.en.title.toLowerCase().includes(q) || p.en.desc.toLowerCase().includes(q))
  const matchMetric  = !q || METRICS.some(m => m.key.toLowerCase().includes(q) || (isTh ? m.th : m.en).toLowerCase().includes(q))
  const matchAdmin   = !q || (isTh ? 'ขั้นตอน upload build mart' : 'upload build mart steps admin').includes(q)
  const matchFaq     = !q || FAQS.some(f => (isTh ? f.th.q + f.th.a : f.en.q + f.en.a).toLowerCase().includes(q))

  const filteredPages   = useMemo(() => PAGES.filter(p => !q || (isTh ? p.th.title + p.th.desc : p.en.title + p.en.desc).toLowerCase().includes(q)), [q, isTh])
  const filteredMetrics = useMemo(() => METRICS.filter(m => !q || m.key.toLowerCase().includes(q) || (isTh ? m.th : m.en).toLowerCase().includes(q)), [q, isTh])
  const filteredFaqs    = useMemo(() => FAQS.filter(f => !q || (isTh ? f.th.q + f.th.a : f.en.q + f.en.a).toLowerCase().includes(q)), [q, isTh])

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError(isTh ? 'รูปขนาดเกิน 5 MB' : 'Image must be under 5 MB'); return }
    setImage(file)
    setPreview(URL.createObjectURL(file))
    setError('')
  }

  function removeImage() {
    setImage(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim()) {
      setError(isTh ? 'กรุณากรอกหัวข้อและรายละเอียด' : 'Please fill in title and description')
      return
    }
    setSending(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('type', type)
      fd.append('title', title)
      fd.append('description', description)
      fd.append('page', page)
      fd.append('reporter', user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Unknown')
      if (image) fd.append('image', image)

      const res = await fetch('/api/feedback', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      setSent(true)
      setTitle(''); setDescription(''); setImage(null); setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg === 'Email service not configured'
        ? (isTh ? 'ระบบ email ยังไม่ได้ตั้งค่า กรุณาติดต่อ admin' : 'Email service not configured. Please contact admin.')
        : (isTh ? `ส่งไม่สำเร็จ: ${msg}` : `Failed to send: ${msg}`)
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('help.title', lang)}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('help.subtitle', lang)}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={isTh ? 'ค้นหา...' : 'Search docs...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Accordion */}
      <Accordion type="multiple" className="space-y-2">

        {/* Dashboard Pages */}
        {matchPage && (
          <AccordionItem value="pages" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#003DA6]" />
                <span className="font-semibold">{t('help.pages', lang)}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Accordion type="multiple" className="space-y-1">
                {filteredPages.map((p, i) => {
                  const info = isTh ? p.th : p.en
                  return (
                    <AccordionItem key={i} value={`page-${i}`} className="border-0 border-t first:border-t-0">
                      <AccordionTrigger className="hover:no-underline py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <p.icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{info.title}</span>
                          <Badge variant="outline" className="text-[10px] font-normal ml-1">{info.audience}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground space-y-1 pb-3">
                        <p>{info.desc}</p>
                        <p className="text-xs"><span className="font-medium text-foreground">{isTh ? 'Filter:' : 'Filters:'}</span> {info.filters}</p>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Metric Definitions */}
        {matchMetric && (
          <AccordionItem value="metrics" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#003DA6]" />
                <span className="font-semibold">{isTh ? 'คำนิยาม Metric' : 'Metric Definitions'}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground text-xs">
                      <th className="pb-2 pr-4 font-medium">{isTh ? 'Metric' : 'Metric'}</th>
                      <th className="pb-2 pr-4 font-medium">{isTh ? 'สูตร' : 'Formula'}</th>
                      <th className="pb-2 font-medium">{isTh ? 'ความหมาย' : 'Meaning'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMetrics.map((m, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium whitespace-nowrap">{m.key}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground font-mono whitespace-nowrap">{m.formula}</td>
                        <td className="py-2 text-muted-foreground">{isTh ? m.th : m.en}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Admin Guide */}
        {matchAdmin && (
          <AccordionItem value="admin" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#003DA6]" />
                <span className="font-semibold">{t('help.adminGuide', lang)}</span>
                <Badge variant="secondary" className="text-[10px]">{t('help.adminOnly', lang)}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">{isTh ? 'วิธีอัพโหลดข้อมูล' : 'How to Upload Data'}</p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  {(isTh ? ADMIN_STEPS.upload.th : ADMIN_STEPS.upload.en).map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">{isTh ? 'วิธีรัน Build Mart' : 'How to Run Build Mart'}</p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  {(isTh ? ADMIN_STEPS.build.th : ADMIN_STEPS.build.en).map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* FAQ */}
        {matchFaq && (
          <AccordionItem value="faq" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-[#003DA6]" />
                <span className="font-semibold">FAQ</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Accordion type="multiple" className="space-y-1">
                {filteredFaqs.map((f, i) => {
                  const info = isTh ? f.th : f.en
                  return (
                    <AccordionItem key={i} value={`faq-${i}`} className="border-0 border-t first:border-t-0">
                      <AccordionTrigger className="hover:no-underline py-2 text-sm text-left">{info.q}</AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground pb-3">{info.a}</AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Feedback Form */}
        <AccordionItem value="feedback" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-[#003DA6]" />
              <span className="font-semibold">{isTh ? 'แจ้งปัญหา / ขอ Feature' : 'Report Issue / Feature Request'}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {sent ? (
              <div className="flex items-center gap-2 text-sm text-green-600 py-4">
                <CheckCircle2 className="h-4 w-4" />
                {isTh ? 'ส่งเรียบร้อยแล้ว ขอบคุณที่แจ้ง!' : 'Sent successfully. Thank you!'}
                <button className="ml-2 underline text-muted-foreground" onClick={() => setSent(false)}>
                  {isTh ? 'ส่งอีกครั้ง' : 'Send another'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 pt-1 pb-2">

                {/* Type */}
                <div className="flex gap-2">
                  {TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        type === opt.value
                          ? 'bg-[#003DA6] text-white border-[#003DA6]'
                          : 'border-border text-muted-foreground hover:border-[#003DA6]'
                      }`}
                    >
                      {isTh ? opt.labelTh : opt.labelEn}
                    </button>
                  ))}
                </div>

                {/* Page */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">{isTh ? 'หน้าที่เกิดปัญหา' : 'Page'}</label>
                  <select
                    value={page}
                    onChange={e => setPage(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {PAGE_OPTIONS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>

                {/* Title */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">{isTh ? 'หัวข้อ' : 'Title'}</label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={isTh ? 'สรุปปัญหาสั้นๆ...' : 'Brief summary...'} />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">{isTh ? 'รายละเอียด' : 'Description'}</label>
                  <Textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                    placeholder={isTh ? 'อธิบายปัญหาหรือ feature ที่ต้องการ...' : 'Describe the issue or the feature you need...'}
                  />
                </div>

                {/* Image */}
                <div className="space-y-2">
                  <label className="text-xs font-medium">{isTh ? 'แนบรูป (ไม่บังคับ, สูงสุด 5 MB)' : 'Attach screenshot (optional, max 5 MB)'}</label>
                  {preview ? (
                    <div className="relative w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt="preview" className="max-h-40 rounded-md border object-contain" />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute -top-2 -right-2 rounded-full bg-destructive text-white p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 border border-dashed rounded-md px-4 py-3 text-sm text-muted-foreground hover:border-[#003DA6] hover:text-[#003DA6] transition-colors"
                    >
                      <ImagePlus className="h-4 w-4" />
                      {isTh ? 'คลิกเพื่อเลือกรูป' : 'Click to select image'}
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} className="hidden" />
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <Button type="submit" disabled={sending} className="bg-[#003DA6] hover:bg-[#003DA6]/90">
                  {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isTh ? 'ส่ง' : 'Submit'}
                </Button>
              </form>
            )}
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </div>
  )
}
