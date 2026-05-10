/**
 * Mock data for 12-week period: Feb 1 – Apr 26, 2026
 * All values are deterministic (seeded PRNG) — edit BASE_* constants to adjust scale.
 */

// ─── tuneable constants ────────────────────────────────────────────────────────
const TARGET_SALES_THB     = 3_000_000   // total sales target
const TARGET_CALLS         = 3_500       // total call target
const TARGET_NEW_CUSTOMERS = 200         // new customer target

const BASE_ONLINE_ORDERS_PER_DAY  = 5    // avg orders/day (online)
const BASE_ONLINE_AOV             = 2_200 // avg order value THB (online)
const BASE_OFFLINE_ORDERS_PER_DAY = 9    // avg orders/day (offline)
const BASE_OFFLINE_AOV            = 3_500 // avg order value THB (offline)
const BASE_CALLS_PER_WEEKDAY      = 60   // avg calls/weekday

// ─── weekly multiplier (index 0 = week 1) ────────────────────────────────────
const WEEK_MULTIPLIER = [0.70, 0.82, 0.92, 1.00, 1.12, 1.28, 1.35, 1.22, 1.10, 1.00, 0.90, 0.85]

// ─── call status distribution (must sum to 1) ─────────────────────────────────
const CALL_STATUS_DIST: [string, number][] = [
  ['No Answer',     0.35],
  ['Contacted',     0.25],
  ['Interested',    0.20],
  ['Not Interested',0.12],
  ['Ordered',       0.08],
]

// ─── seeded PRNG (LCG) ───────────────────────────────────────────────────────
function makePrng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
const rng = makePrng(20260201)

const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length)]
const randInt = (lo: number, hi: number) => Math.floor(rng() * (hi - lo + 1)) + lo
const randBetween = (lo: number, hi: number) => rng() * (hi - lo) + lo
const uid = (prefix: string, n: number) => `${prefix}${String(n).padStart(6, '0')}`

// ─── reference data ───────────────────────────────────────────────────────────
export const PRODUCTS = [
  { sku: 'UL-SL-750',   brand: 'Sunlight',  category: 'Dishwash',     name: 'Sunlight Lemon 750ml',         unitPrice: 59  },
  { sku: 'UL-SL-5L',    brand: 'Sunlight',  category: 'Dishwash',     name: 'Sunlight 5L Refill',           unitPrice: 285 },
  { sku: 'UL-OMO-3KG',  brand: 'OMO',       category: 'Detergent',    name: 'OMO Active 3kg',               unitPrice: 249 },
  { sku: 'UL-OMO-9KG',  brand: 'OMO',       category: 'Detergent',    name: 'OMO Matic Front 9kg',          unitPrice: 649 },
  { sku: 'UL-COM-1L',   brand: 'Comfort',   category: 'Fabric Care',  name: 'Comfort Blue 1L',              unitPrice: 89  },
  { sku: 'UL-COM-3L',   brand: 'Comfort',   category: 'Fabric Care',  name: 'Comfort 3L Refill',            unitPrice: 219 },
  { sku: 'UL-DOM-500',  brand: 'Domestos',  category: 'Toilet Care',  name: 'Domestos Thick Bleach 500ml',  unitPrice: 79  },
  { sku: 'UL-CIF-500',  brand: 'Cif',       category: 'Surface Care', name: 'Cif Cream Cleaner 500ml',      unitPrice: 89  },
  { sku: 'UL-SUR-750',  brand: 'Surf',      category: 'Detergent',    name: 'Surf Excel 750g',              unitPrice: 69  },
  { sku: 'UL-VIM-500',  brand: 'Vim',       category: 'Surface Care', name: 'Vim Dishwash Bar 500g',        unitPrice: 45  },
] as const

const CUSTOMER_PREFIXES = ['บจก.', 'ร้าน', 'ห้าง', 'หจก.']
const CUSTOMER_WORDS = [
  'สยามพาณิชย์','มหาสมุทร','ทองไทย','เจริญทรัพย์','สมบูรณ์ผล',
  'รุ่งเรือง','ไพศาล','สุขสวัสดิ์','ชัยพฤกษ์','วิไลทรัพย์',
  'ภูมิใจ','นวลจันทร์','พิมพา','เอกสิน','กิจเจริญ',
  'ธนบดี','สิริมงคล','อนันต์ผล','พานิชย์ดี','ทวีโชค',
]

function customerName(i: number) {
  return `${CUSTOMER_PREFIXES[i % 4]}${CUSTOMER_WORDS[i % CUSTOMER_WORDS.length]}`
}

// 120 returning customers (existed before Feb 2026), 130 new customers (first order in period)
export const CUSTOMERS = [
  ...Array.from({ length: 120 }, (_, i) => ({ id: `CUST${String(i + 1).padStart(4, '0')}`, name: customerName(i), isNew: false })),
  ...Array.from({ length: 130 }, (_, i) => ({ id: `CUST${String(i + 121).padStart(4, '0')}`, name: customerName(i + 120), isNew: true })),
]
const returning = CUSTOMERS.filter(c => !c.isNew)
const newCusts  = CUSTOMERS.filter(c => c.isNew)

const AGENTS = [
  { name: 'สมชาย ดีใจ',    company: 'Telesales Co. A' },
  { name: 'วิภา รุ่งเรือง',  company: 'Telesales Co. A' },
  { name: 'ธนา พัฒนา',     company: 'Telesales Co. A' },
  { name: 'นิตยา ใจดี',    company: 'Telesales Co. B' },
  { name: 'ประสิทธิ์ มงคล', company: 'Telesales Co. B' },
]

// ─── helpers ──────────────────────────────────────────────────────────────────
function isoDate(d: Date) { return d.toISOString().split('T')[0] }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }

function weekIndex(d: Date, start: Date) {
  return Math.floor((d.getTime() - start.getTime()) / (7 * 86400000))
}

function pickCallStatus(): string {
  const r = rng()
  let acc = 0
  for (const [status, prob] of CALL_STATUS_DIST) {
    acc += prob
    if (r < acc) return status
  }
  return 'Contacted'
}

// ─── generate records ─────────────────────────────────────────────────────────
const START = new Date('2026-02-01')
const END   = new Date('2026-04-26')

export type MockSale = {
  id: string; order_id: string; order_date: string
  customer_id: string; customer_name: string
  product_sku: string; product_brand: string; product_category: string
  qty: number; sales_amount: number; channel: string
  upload_batch: string
}

export type MockCall = {
  id: string; customer_id: string; call_date: string
  call_status: string; agent_name: string; agent_company: string
  call_duration_sec: number; upload_batch: string
}

export type MockLead = {
  id: string; customer_id: string; customer_name: string
  mobile: string; segment: string; assigned_company: string
  assigned_date: string; status: string; upload_batch: string
}

const salesOnline: MockSale[]  = []
const salesOffline: MockSale[] = []
const calls: MockCall[]        = []
const leads: MockLead[]        = []

let orderCounter = 1
let callCounter  = 1
let leadCounter  = 1

// Track first-purchase date for each new customer (to determine "new" in any sub-period)
const newCustFirstDate: Record<string, string> = {}

for (let offset = 0; offset < 84; offset++) {
  const day = addDays(START, offset)
  const dow = day.getDay() // 0=Sun,6=Sat
  const iso = isoDate(day)
  const wi  = Math.min(weekIndex(day, START), 11)
  const mult = WEEK_MULTIPLIER[wi]

  // ── Online orders ──────────────────────────────────────────────────────────
  const onlineCount = Math.round(BASE_ONLINE_ORDERS_PER_DAY * mult * (dow === 0 ? 0.4 : dow === 6 ? 0.6 : 1))
  for (let j = 0; j < onlineCount; j++) {
    const prod = pick([...PRODUCTS])
    // Mix returning/new: 55% returning early, shifts toward new over time
    const useNew = rng() < (0.25 + wi * 0.05)
    const cust = useNew ? pick(newCusts) : pick(returning)
    const qty = randInt(1, 12)
    const amount = Math.round(prod.unitPrice * qty * randBetween(0.9, 1.15))
    const oid = uid('SO', orderCounter++)
    salesOnline.push({
      id: uid('so', orderCounter), order_id: oid, order_date: iso,
      customer_id: cust.id, customer_name: cust.name,
      product_sku: prod.sku, product_brand: prod.brand, product_category: prod.category,
      qty, sales_amount: amount, channel: 'online', upload_batch: 'mock',
    })
    if (cust.isNew && !newCustFirstDate[cust.id]) newCustFirstDate[cust.id] = iso
  }

  // ── Offline orders ─────────────────────────────────────────────────────────
  const offlineCount = Math.round(BASE_OFFLINE_ORDERS_PER_DAY * mult * (dow === 0 ? 0.3 : dow === 6 ? 0.5 : 1))
  for (let j = 0; j < offlineCount; j++) {
    const prod = pick([...PRODUCTS])
    const useNew = rng() < (0.20 + wi * 0.04)
    const cust = useNew ? pick(newCusts) : pick(returning)
    const qty = randInt(2, 24)
    const amount = Math.round(prod.unitPrice * qty * randBetween(0.88, 1.20))
    const oid = uid('OF', orderCounter++)
    salesOffline.push({
      id: uid('of', orderCounter), order_id: oid, order_date: iso,
      customer_id: cust.id, customer_name: cust.name,
      product_sku: prod.sku, product_brand: prod.brand, product_category: prod.category,
      qty, sales_amount: amount, channel: 'offline', upload_batch: 'mock',
    })
    if (cust.isNew && !newCustFirstDate[cust.id]) newCustFirstDate[cust.id] = iso
  }

  // ── Telesales calls (weekdays + Saturday only) ─────────────────────────────
  if (dow !== 0) {
    const callCount = Math.round(BASE_CALLS_PER_WEEKDAY * mult * (dow === 6 ? 0.5 : 1))
    for (let j = 0; j < callCount; j++) {
      const cust = pick(CUSTOMERS)
      const agent = pick(AGENTS)
      calls.push({
        id: uid('CL', callCounter++), customer_id: cust.id, call_date: iso,
        call_status: pickCallStatus(),
        agent_name: agent.name, agent_company: agent.company,
        call_duration_sec: randInt(20, 480), upload_batch: 'mock',
      })
    }
  }
}

// ── Leads (one-time list of 300 customers assigned at start) ──────────────────
for (const cust of CUSTOMERS.slice(0, 250)) {
  const company = pick(AGENTS).company
  leads.push({
    id: uid('LD', leadCounter++), customer_id: cust.id, customer_name: cust.name,
    mobile: `08${randInt(10000000, 99999999)}`,
    segment: pick(['Modern Trade', 'Traditional Trade', 'HoReCa', 'Institution']),
    assigned_company: company, assigned_date: '2026-02-01',
    status: cust.isNew ? 'pending' : 'called', upload_batch: 'mock',
  })
}

// ─── exports ──────────────────────────────────────────────────────────────────
export const MOCK_SALES_ONLINE  = salesOnline
export const MOCK_SALES_OFFLINE = salesOffline
export const MOCK_CALLS         = calls
export const MOCK_LEADS         = leads
export const MOCK_NEW_CUST_FIRST_DATE = newCustFirstDate  // { custId: 'YYYY-MM-DD' }

export const MOCK_TARGET = {
  id: 'mock-target-1',
  period_label: 'Feb–Apr 2026 (12W)',
  period_start: '2026-02-01',
  period_end:   '2026-04-26',
  sales_target_thb:     TARGET_SALES_THB,
  new_customer_target:  TARGET_NEW_CUSTOMERS,
  call_target:          TARGET_CALLS,
  channel: 'all',
}

export const MOCK_PRODUCTS = PRODUCTS.map(p => ({
  product_sku: p.sku, product_name: p.name,
  product_brand: p.brand, product_category: p.category,
  unit_price: p.unitPrice, is_unilever: true, updated_at: '2026-02-01T00:00:00Z',
}))

// ─── query helpers (mirror Supabase filter patterns) ─────────────────────────

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to
}

export function querySalesOnline(from: string, to: string) {
  return MOCK_SALES_ONLINE.filter(r => inRange(r.order_date, from, to))
}

export function querySalesOffline(from: string, to: string) {
  return MOCK_SALES_OFFLINE.filter(r => inRange(r.order_date, from, to))
}

export function queryCalls(from: string, to: string) {
  return MOCK_CALLS.filter(r => inRange(r.call_date, from, to))
}

export function countNewCustomers(from: string, to: string, channel: string = 'all'): number {
  const onlineCusts = channel !== 'offline'
    ? new Set(MOCK_SALES_ONLINE.filter(r => inRange(r.order_date, from, to)).map(r => r.customer_id))
    : new Set<string>()
  const offlineCusts = channel !== 'online'
    ? new Set(MOCK_SALES_OFFLINE.filter(r => inRange(r.order_date, from, to)).map(r => r.customer_id))
    : new Set<string>()
  const allBuyers = new Set([...onlineCusts, ...offlineCusts])

  let count = 0
  for (const custId of allBuyers) {
    const firstDate = MOCK_NEW_CUST_FIRST_DATE[custId]
    // "new" = this customer's very first purchase falls within [from, to]
    if (firstDate && firstDate >= from && firstDate <= to) count++
  }
  return count
}

export function queryByDate(from: string, to: string): { date: string; online: number; offline: number }[] {
  const map: Record<string, { online: number; offline: number }> = {}
  for (const r of MOCK_SALES_ONLINE.filter(r => inRange(r.order_date, from, to))) {
    if (!map[r.order_date]) map[r.order_date] = { online: 0, offline: 0 }
    map[r.order_date].online += r.sales_amount
  }
  for (const r of MOCK_SALES_OFFLINE.filter(r => inRange(r.order_date, from, to))) {
    if (!map[r.order_date]) map[r.order_date] = { online: 0, offline: 0 }
    map[r.order_date].offline += r.sales_amount
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))
}
