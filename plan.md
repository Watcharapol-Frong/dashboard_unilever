# Makro × Unilever × Telesales Dashboard — Project Plan

> อัปเดตล่าสุด: 2026-05-11  
> สถานะปัจจุบัน: Upload pipeline สมบูรณ์ · Upload UI ครบ (Tabs/Skeleton/Pagination/Progress cards) · Auth schema DB พร้อม · Dashboard UI (Mock data) พร้อม · Auth implementation + Gold views + Deploy ยังไม่เริ่ม

---

## 1. Overview

Dashboard ร่วม 3 บริษัท (Makro, Unilever, Telesales Company) ติดตาม KPI การสร้างลูกค้าใหม่และยอดขาย Unilever บน Makro Pro

**Core requirements:**
- Admin อัปโหลด CSV 8 ประเภท → ระบบ validate → ETL → Supabase
- Dashboard แสดง KPI, chart, funnel แบบ real-time กรองตาม date range
- Role-based access: `admin` เห็นทุกอย่าง, `viewer_telesales` เห็นเฉพาะข้อมูลบริษัทตัวเอง
- Login ด้วย Magic Link เท่านั้น (ไม่มี password)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI / Components | shadcn/ui + Tailwind CSS |
| Charts | @nivo/bar, @nivo/line, @nivo/pie, @nivo/sankey |
| Auth | Supabase Auth (Magic Link + Invite) |
| Database | Supabase (PostgreSQL) |
| CSV Parsing | Papa Parse (client preview + server ETL) |
| Data Fetching | SWR (auto-revalidate, isValidating for UX) |
| Deployment | Vercel (ยังไม่ได้ deploy) |

---

## 3. Architecture — Medallion Data Flow

```
CSV File (Admin upload)
        │
        ▼
[Bronze] Supabase Storage bucket: csv-uploads
        Folder: {table}/{channel}/{timestamp}_{type}.csv
        │
        ▼ (ETL ใน /api/upload/[type])
[Silver] Supabase PostgreSQL — typed tables (ดู Section 5)
        │  online_sales, offline_sales, leads, products,
        │  telesales_calls, targets, costs, incentives
        ▼ (Gold VIEW)
[Gold]   order_sales VIEW = UNION ALL (online_sales + offline_sales)
        (+ future: vw_daily_sales, vw_agent_performance ฯลฯ)
```

**Upload pipeline ทำงานอย่างไร:**
1. User เลือก file type → drag/drop CSV (max 50 MB)
2. Client parse header → validate ด้วย fingerprint (requiredHeaders / forbiddenHeaders)
3. Preview 1 แถวแรก → confirm
4. POST `/api/upload/{type}` → server parse → validate → upload to Storage → ETL → dedup → Upsert Silver (chunk 500 rows) → บันทึก upload_batches log
5. Progress card แสดง real-time upload % (XHR) → auto-dismiss 3 วินาที หลัง success
6. รองรับ concurrent upload สูงสุด 3 ไฟล์พร้อมกัน (queue เมื่อเกิน)

**Sliding-window upsert:** แต่ละ upload อาจครอบคลุม date range ซ้อนกับ upload ก่อน → ใช้ `UPSERT ON CONFLICT (composite key)` ทับข้อมูลเดิมเสมอ

---

## 4. Environment Variables

สร้างไฟล์ `.env.local` (ไม่ commit):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # ใช้ใน server routes เท่านั้น
NEXT_PUBLIC_APP_URL=http://localhost:3000
USE_MOCK_DATA=true                 # true = ใช้ mock, ลบ/false = ใช้ real DB
```

> ⚠️ **สำคัญ:** ค่า JWT key ต้องไม่มี single quotes ครอบ — เขียนตรงๆ ไม่ใส่เครื่องหมาย `'...'`  
> Next.js อ่าน single quotes เป็นส่วนหนึ่งของค่า ทำให้ Supabase client ได้รับ JWT ที่ invalid
>
> ✅ ถูก: `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...`  
> ❌ ผิด: `NEXT_PUBLIC_SUPABASE_ANON_KEY='eyJhbGci...'`

---

## 5. Silver Layer — Database Schema

### Migration files
```
supabase/migrations/
  20260510032319_silver_tables.sql             # สร้าง 8 tables เดิม
  20260510032924_fix_telesales_source_tab.sql  # rename source_tab → lead_customers
  20260510120000_auth_schema.sql               # user_profiles, invite_codes, audit_logs
  20260510150000_split_order_sales.sql         # แยก order_sales → online_sales + offline_sales + VIEW
  20260510180000_fix_sales_composite_key.sql   # เปลี่ยน PK order_number → UNIQUE(order_number, prod_num)
```

### วิธี apply migrations
```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

### Tables

#### upload_batches (audit log — referenced โดยทุก table)
| column | type | note |
|---|---|---|
| id | uuid PK | auto |
| table_name | text | ชื่อ silver table ที่ import |
| filename | text | ชื่อไฟล์ต้นฉบับ |
| storage_path | text | path ใน Storage bucket |
| row_count | integer | จำนวน row ที่ import สำเร็จ (หลัง dedup) |
| error_count | integer | จำนวน row ที่ error |
| status | text | `success` / `partial` / `failed` |
| uploaded_at | timestamptz | |

#### online_sales
| column | type | note |
|---|---|---|
| id | uuid PK | surrogate key (auto) |
| order_number | text | UNIQUE constraint ร่วมกับ prod_num |
| order_date | date NOT NULL | |
| mmid | text | รหัสลูกค้า Makro |
| mobile | text | |
| dynamic_cmg | text | กลุ่ม CMG |
| prod_num | text | UNIQUE constraint ร่วมกับ order_number |
| sales_qty | numeric(10,2) | จาก `Qty Sold (Online)` |
| sales_in_vat | numeric(14,4) | จาก `Sales In VAT` |
| is_in_paid_report | boolean | |
| batch_id | uuid FK | |
| updated_at | timestamptz | |

UNIQUE: `(order_number, prod_num)` · Index: order_date, mmid, prod_num, dynamic_cmg

#### offline_sales
| column | type | note |
|---|---|---|
| id | uuid PK | surrogate key (auto) |
| order_number | text | UNIQUE ร่วมกับ prod_num |
| order_date | date NOT NULL | จาก `TRANSACTION_DATE` |
| mmid | text | |
| mobile | text | |
| dynamic_cmg | text | |
| prod_num | text | UNIQUE ร่วมกับ order_number |
| sales_qty | numeric(10,2) | |
| sales_in_vat | numeric(14,4) | `Sales Ex VAT × 1.07` |
| batch_id | uuid FK | |
| updated_at | timestamptz | |

UNIQUE: `(order_number, prod_num)` · Index: order_date, mmid, prod_num, dynamic_cmg

> ⚠️ **สำคัญ:** conflict key ต้องเป็น composite `(order_number, prod_num)` ไม่ใช่แค่ `order_number`  
> เพราะ 1 order มีหลาย line items (product SKU) — ถ้าใช้แค่ order_number จะ upsert ทับกัน ทำให้ยอดขายผิด

#### order_sales (Gold VIEW)
```sql
-- UNION ALL ของ online_sales + offline_sales
-- channel derive จาก source table ('Online' / 'Offline')
SELECT ..., 'Online' AS channel FROM online_sales
UNION ALL
SELECT ..., 'Offline' AS channel FROM offline_sales
```

#### leads
| column | type | note |
|---|---|---|
| mmid | text PK | |
| cust_name | text | |
| mobile | text | |
| lead_customers | text | กลุ่ม lead (เช่น "Wave 1") |
| batch_id, updated_at | | |

#### products
| column | type | note |
|---|---|---|
| prod_num | text PK | |
| product_name_th / en | text | |
| brands | text | แบรนด์ Unilever |
| senior_buyer_name / buyer_name | text | |
| class_name / subclass | text | หมวดหมู่ |
| is_1px | boolean | |
| url_makro_pro | text | |
| batch_id, updated_at | | |

#### telesales_calls
| column | type | note |
|---|---|---|
| mmid | text PK | 1 row ต่อลูกค้า (upsert) |
| mobile | text | |
| first_connected_date | date | จาก col `first_conected_date` (typo ในต้นฉบับ) |
| call_status | text | |
| reason_group / reason_subgroup | text | |
| contact_note | text | |
| agent | text | |
| lead_customers | text | จาก col `source_tab` |
| batch_id, updated_at | | |

#### targets
PK: `(month, dynamic_cmg)` · month: `"Feb 2026"` → `2026-02-01`

#### costs
PK: `month` · month: `"Feb 2026"` → `2026-02-01`

#### incentives
PK: `tier` (numeric, เช่น `1.10` = 110%)

---

## 6. Upload Config & ETL

### `src/lib/upload/config.ts`
กำหนด 8 file types พร้อม:
- `requiredHeaders` — fingerprint ที่ต้องมี
- `forbiddenHeaders` — ป้องกัน upload ผิดประเภท (เช่น เลือก Online แต่ส่ง Offline ไฟล์)
- `conflictKey` — ใช้ใน upsert
- `storageFolder` / `storageFilename`

| type | label | table | conflict key |
|---|---|---|---|
| `online_sales` | Online Sales | online_sales | order_number,prod_num |
| `offline_sales` | Offline Sales | offline_sales | order_number,prod_num |
| `leads` | Lead Customers | leads | mmid |
| `products` | Products | products | prod_num |
| `telesales` | Telesales Calls | telesales_calls | mmid |
| `targets` | Targets | targets | month,dynamic_cmg |
| `costs` | Costs | costs | month |
| `incentives` | Incentives | incentives | tier |

### `src/lib/upload/etl.ts`
ETL transforms โดดเด่น:
- **online_sales prod_num:** จาก col `ITEM_ID`
- **Offline sales_in_vat:** `Math.round(Sales_Ex_VAT × 1.07 × 10000) / 10000`
- **month field:** `"Feb 2026"` → `"2026-02-01"` (via `parseMonth()`)
- **telesales source_tab** → stored as `lead_customers`
- **telesales first_conected_date** (typo ในต้นฉบับ) → `first_connected_date`
- **incentives tier:** lowercase `tier` (ไม่ใช่ `Tier`)
- **Dedup ก่อน upsert:** Map ตาม composite key → keep last occurrence ป้องกัน "ON CONFLICT DO UPDATE cannot affect row a second time"
- **Null guard:** row ที่ `order_date` เป็น null → skip (error log)

### CSV ต้นฉบับ — required headers

**Online Sales:** `order_number`, `ITEM_ID`, `Sales In VAT`  
**Offline Sales:** `sls_trx_id`, `TRANSACTION_DATE`, `Sales Ex VAT`  
**Leads:** `mmid`, `lead_customers`  
**Products:** `prod_num`, `brands`  
**Telesales:** `mmid`, `call_status`, `agent`  
**Targets:** `month`, `dynamic_cmg`, `sales_target`  
**Costs:** `month`, `cost_per_agent`  
**Incentives:** `tier`, `incentive_per_head`

---

## 7. Storage Bucket

Bucket: `csv-uploads` (private, ใน Supabase Storage)

```
csv-uploads/
  order_sales/online/{timestamp}_online_sales.csv
  order_sales/offline/{timestamp}_offline_sales.csv
  leads/{timestamp}_leads.csv
  products/{timestamp}_products.csv
  telesales/{timestamp}_telesales.csv
  targets/{timestamp}_targets.csv
  costs/{timestamp}_costs.csv
  incentives/{timestamp}_incentives.csv
```

timestamp format: `20260510T143022` (auto-generated ตอน upload)

**สถานะ:** ✅ Bucket `csv-uploads` สร้างแล้วใน Supabase

---

## 8. API Routes

| method | path | description |
|---|---|---|
| POST | `/api/upload/[type]` | รับ CSV → validate → Storage → ETL → upsert Silver |
| GET | `/api/upload/history` | ดึง upload_batches 50 รายการล่าสุด |
| GET | `/api/upload/status` | summary ของแต่ละ Silver table (rows, dates, totals) |
| DELETE | `/api/dev/reset` | DEV ONLY — truncate ทุก table + ลบ Storage files |
| GET | `/api/kpi/overview` | KPI cards + daily sales trend |
| GET | `/api/kpi/sales` | Sales performance + recent orders |
| GET | `/api/kpi/telesales` | Call stats + Sankey funnel data |
| GET | `/api/kpi/products` | Top SKUs + brand breakdown |
| GET | `/api/kpi/leads` | Lead list + status counts |
| GET | `/api/targets` | Targets per month/CMG |
| POST | `/api/invite` | Admin invite user (Supabase magic link) |

> ⚠️ **PostgREST 1000-row cap:** ทุก query ที่ต้องการ count หรือ aggregate ต้องใช้ `{ count: 'exact' }` และดึงค่าจาก `.count` ไม่ใช่ `data.length` — ไม่เช่นนั้น Supabase จะคืนแค่ 1,000 แถว  
> สำหรับ sum aggregate ใช้ Supabase RPC function `get_sales_totals()` แทน JS reduce

### Supabase Functions ที่ต้องสร้างใน SQL Editor

```sql
-- Reset all Silver tables (dev)
CREATE OR REPLACE FUNCTION reset_all_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  TRUNCATE online_sales, offline_sales, leads, products,
           telesales_calls, targets, costs, incentives,
           upload_batches CASCADE;
END;
$$;

-- Aggregate sales totals (bypass PostgREST row limit)
CREATE OR REPLACE FUNCTION get_sales_totals()
RETURNS TABLE (channel text, total_rows bigint, total_sales numeric)
LANGUAGE sql STABLE AS $$
  SELECT 'online'::text,  COUNT(*), COALESCE(SUM(sales_in_vat), 0) FROM online_sales
  UNION ALL
  SELECT 'offline'::text, COUNT(*), COALESCE(SUM(sales_in_vat), 0) FROM offline_sales;
$$;
```

All KPI routes check `USE_MOCK_DATA` env var → ถ้า `true` ใช้ `src/lib/mock/data.ts`, ถ้า `false` query Silver tables จริง

---

## 9. File Structure

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx              # Magic link request form
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # Sidebar + TopBar wrapper
│   │   ├── overview/page.tsx           # Summary KPIs + sales trend
│   │   ├── sales/page.tsx              # Sales performance + target gauge
│   │   ├── telesales/page.tsx          # Call stats + Sankey funnel
│   │   ├── products/page.tsx           # SKU/brand breakdown
│   │   ├── leads/page.tsx              # Lead list + status pie
│   │   ├── incentives/page.tsx         # Incentive tracking
│   │   ├── upload/page.tsx             # CSV upload + Tabs (Overview/Data Status/History)
│   │   └── settings/page.tsx           # Targets + invite users
│   ├── api/
│   │   ├── upload/[type]/route.ts      # Upload pipeline (8 steps)
│   │   ├── upload/history/route.ts     # Upload audit log (50 รายการ)
│   │   ├── upload/status/route.ts      # Silver table summaries (RPC aggregate)
│   │   ├── dev/reset/route.ts          # DEV ONLY — wipe all data
│   │   ├── dev/check-sales/route.ts    # DEV — debug sales data
│   │   ├── kpi/overview/route.ts
│   │   ├── kpi/sales/route.ts
│   │   ├── kpi/telesales/route.ts
│   │   ├── kpi/products/route.ts
│   │   ├── kpi/leads/route.ts
│   │   ├── targets/route.ts
│   │   ├── invite/route.ts
│   │   └── incentives/route.ts
│   └── auth/callback/route.ts          # Supabase magic link callback
│
├── components/
│   ├── charts/
│   │   ├── NivoBar.tsx
│   │   ├── NivoLine.tsx
│   │   ├── NivoPie.tsx
│   │   └── SankeyFunnel.tsx
│   ├── dashboard/
│   │   ├── KpiCard.tsx
│   │   ├── TargetGaugeBar.tsx
│   │   ├── RadialGauge.tsx
│   │   └── DataTable.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx                  # ซ่อน date filter + Print/PDF บนหน้า /upload, /settings
│   └── ui/                             # shadcn/ui: card, badge, button, skeleton, tabs, ...
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client (anon key)
│   │   └── server.ts                   # Server client (service role + cache:'no-store')
│   ├── upload/
│   │   ├── config.ts                   # 8 file type configs (composite conflict keys)
│   │   └── etl.ts                      # Row transform + null guard + dedup logic
│   ├── mock/data.ts
│   └── utils.ts
│
├── context/
│   ├── DateRangeContext.tsx
│   └── SidebarContext.tsx
├── hooks/
│   └── useKpi.ts
├── types/index.ts
└── middleware.ts                       # TODO: Supabase session check

supabase/
└── migrations/
    ├── 20260510032319_silver_tables.sql
    ├── 20260510032924_fix_telesales_source_tab.sql
    ├── 20260510120000_auth_schema.sql
    ├── 20260510150000_split_order_sales.sql
    └── 20260510180000_fix_sales_composite_key.sql
```

---

## 10. Current Status

### เสร็จแล้ว ✅

#### Frontend & Components
- [x] Next.js 14 + TypeScript + Tailwind + shadcn/ui bootstrap
- [x] Sidebar, TopBar, DateRangePicker layout
- [x] TopBar: ซ่อน date filter + Print/PDF บนหน้า `/upload` และ `/settings` โดยอัตโนมัติ
- [x] Dashboard pages ทุกหน้า — ใช้ Mock data
- [x] Charts: NivoBar, NivoLine, NivoPie, SankeyFunnel
- [x] KpiCard, TargetGaugeBar, DataTable components

#### Upload System (สมบูรณ์)
- [x] Silver schema: online_sales + offline_sales (แยกจาก order_sales) + 6 tables อื่น
- [x] order_sales Gold VIEW = UNION ALL online_sales + offline_sales
- [x] Storage bucket `csv-uploads` — private
- [x] `src/lib/upload/config.ts` — 8 file types, composite conflict keys `(order_number, prod_num)`
- [x] `src/lib/upload/etl.ts` — ETL + dedup + null guard + tier lowercase fix
- [x] Extra columns: เก็บใน Storage, ไม่ import ลง DB
- [x] `POST /api/upload/[type]` — 8-step pipeline
- [x] `GET /api/upload/history` — 50 รายการล่าสุด
- [x] `GET /api/upload/status` — ใช้ `count:'exact'` + RPC `get_sales_totals()` แก้ PostgREST 1000-row cap
- [x] `DELETE /api/dev/reset` — DEV ONLY: truncate all + clear Storage
- [x] All server API routes ใช้ `createServiceClient()` (service role key + `cache:'no-store'`)

#### Upload Page UI (สมบูรณ์)
- [x] File type selector (3 buttons + dropdown สำหรับ Other Types)
- [x] Drag-drop + file validation (header fingerprint, 50MB limit)
- [x] Preview 1 แถวแรก + extra column warning
- [x] **Concurrent upload** สูงสุด 3 ไฟล์พร้อมกัน (queue เมื่อเกิน)
- [x] **Progress card** (XHR real-time %) — auto-dismiss 3 วินาที (success), manual dismiss (failed)
- [x] Max 2 cards visible + scroll เมื่อมีมากกว่า 2
- [x] Error summary groupby type (ไม่แสดง individual row errors)
- [x] **Tabs** (Overview / Data Status / History)
  - Overview: Sales Summary, Leads & Telesales, Products & Targets, Upload Activity
  - Data Status: table 8 แถว (rows, details, date range, last updated, status icon)
  - History: table 10 rows/page + **pagination** (first/prev/pages/next/last, ellipsis)
- [x] **Skeleton loading** ทั้ง 3 tabs (แสดงตอน initial load)
- [x] **Refresh button**: ใช้ `isValidating` แทน `isLoading` → spinner หมุน + disabled ระหว่าง fetch
- [x] TabsList: ไม่มี badge ตัวเลข (ลบออกตาม UX)

#### Auth Schema (DB พร้อม — Next.js ยังไม่ implement)
- [x] `user_profiles`, `invite_codes`, `audit_logs` tables
- [x] `upload_batches.uploaded_by` — FK → auth.users (null จนกว่าจะ implement Auth)
- [x] `getSessionUserId()` — stub คืน null
- [x] `writeAuditLog()` — skip ถ้า userId null

---

### ยังไม่ได้ทำ ❌

#### Phase ถัดไป: Auth Implementation
> DB schema พร้อมแล้ว — ต้องทำฝั่ง Next.js

- [ ] หน้า `/register` — กรอก email + invite code → validate → ส่ง magic link
- [ ] หน้า `/login` — กรอก email → `supabase.auth.signInWithOtp()`
- [ ] `/auth/callback` — exchange code → session → insert `user_profiles`
- [ ] `middleware.ts` — check session, redirect `/login` ถ้าไม่มี session
- [ ] `getSessionUserId()` — เปลี่ยนจาก stub → ดึง JWT จาก request จริง
- [ ] Settings: สร้าง / revoke invite code, รายชื่อ user

#### Phase: Connect Real Data
- [ ] ลบ `USE_MOCK_DATA=true` → ต่อ KPI routes กับ Silver tables จริง
- [ ] ออกแบบ Gold Views (vw_daily_sales, vw_agent_performance ฯลฯ)
- [ ] RLS Policies (viewer เห็นเฉพาะ company ตัวเอง)

#### Phase: Deploy
- [ ] Push to GitHub → connect Vercel
- [ ] Add env vars ใน Vercel dashboard
- [ ] Test magic link ด้วย production URL

---

## 11. Gold Views (ออกแบบทีหลัง)

- `order_sales` VIEW สร้างแล้ว (UNION ALL online + offline)
- Future views: `vw_daily_sales`, `vw_agent_performance`, `vw_lead_funnel`, `vw_product_ranking`
- KPI routes จะ query Gold views แทน Silver tables โดยตรง

---

## 12. Auth & Roles

### DB Schema (apply แล้ว — migration: `20260510120000_auth_schema.sql`)

```sql
user_profiles: user_id (PK→auth.users), email, full_name, role, company, invited_by, last_seen
invite_codes:  code (UNIQUE), role, company, max_uses, use_count, expires_at, is_active, created_by
audit_logs:    user_id, action, entity_type, entity_id, metadata (jsonb)
```

**Roles:** `admin` (upload + manage) / `viewer` (read only, filtered by company)

### Flow (Next.js ยังไม่ implement)

```
Admin สร้าง invite code (role=viewer, company="Telesales A", max_uses=1)
  ↓
ผู้ใช้เปิด /register → กรอก email + code → magic link
  ↓
/auth/callback → session → insert user_profiles → redirect /overview
  ↓
middleware.ts ตรวจ session ทุก request (TODO)
```

---

## 13. Known Issues & Notes

| เรื่อง | รายละเอียด |
|---|---|
| PostgREST 1000-row cap | ใช้ `{ count: 'exact' }` + `.count` field, ไม่ใช่ `data.length` |
| Sales aggregate | ใช้ RPC `get_sales_totals()` — ต้องสร้างใน Supabase SQL Editor |
| Composite conflict key | online/offline sales ต้องใช้ `(order_number, prod_num)` — migration 20260510180000 |
| Next.js fetch cache | ทุก API route ต้องมี `export const dynamic = 'force-dynamic'` + Supabase client ต้องมี `cache: 'no-store'` |
| isValidating vs isLoading | SWR: ใช้ `isValidating` สำหรับ loading indicator ระหว่าง refresh |

---

## 14. Local Dev

```bash
npm install
npm run dev        # http://localhost:3000
```

ตั้งค่า `.env.local` ก่อน (ดู Section 4)

```bash
# Apply DB migrations
npx supabase link --project-ref <ref>
npx supabase db push

# DEV: reset all data
curl -X DELETE http://localhost:3000/api/dev/reset
```
