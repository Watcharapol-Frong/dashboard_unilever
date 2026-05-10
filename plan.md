# Makro × Unilever × Telesales Dashboard — Project Plan

> อัปเดตล่าสุด: 2026-05-10  
> สถานะปัจจุบัน: Silver layer + Upload pipeline เสร็จแล้ว · Dashboard UI (Mock data) พร้อม · Gold views + Auth + Deploy ยังไม่เริ่ม

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
| Data Fetching | SWR (auto-revalidate) |
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
        │
        ▼ (TODO — ออกแบบหลัง UI finalize)
[Gold]   Supabase Views / Materialized Views
        (pre-aggregated สำหรับ dashboard queries)
```

**Upload pipeline ทำงานอย่างไร:**
1. User เลือก file type → drag/drop CSV
2. Client parse header → validate ด้วย fingerprint (requiredHeaders / forbiddenHeaders)
3. Preview 5 แถวแรก → confirm
4. POST `/api/upload/{type}` → server parse ทั้งไฟล์ → validate → upload to Storage → ETL → Upsert Silver (chunk 500 rows) → บันทึก upload_batches log
5. Status cards refresh อัตโนมัติหลัง upload สำเร็จ

**Sliding-window upsert:** แต่ละ upload อาจครอบคลุม date range ซ้อนกับ upload ก่อน → ใช้ `UPSERT ON CONFLICT (PK)` ทับข้อมูลเดิมเสมอ

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
  20260510032319_silver_tables.sql             # สร้าง 8 tables
  20260510032924_fix_telesales_source_tab.sql  # rename source_tab → lead_customers
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
| row_count | integer | จำนวน row ที่ import สำเร็จ |
| error_count | integer | จำนวน row ที่ error |
| status | text | `success` / `partial` / `failed` |
| uploaded_at | timestamptz | |

#### order_sales (Online + Offline รวมกัน)
| column | type | note |
|---|---|---|
| order_number | text PK | Online: `order_number` col / Offline: `sls_trx_id` col |
| order_date | date | |
| mmid | text | รหัสลูกค้า Makro |
| mobile | text | |
| dynamic_cmg | text | กลุ่ม CMG |
| prod_num | text | รหัสสินค้า (FK → products.prod_num) |
| sales_qty | integer | |
| sales_in_vat | numeric(14,4) | Online: ดึงตรงจาก col / Offline: `Sales Ex VAT × 1.07` |
| channel | text | `'Online'` หรือ `'Offline'` |
| is_in_paid_report | boolean | Online: TRUE/FALSE / Offline: NULL |
| batch_id | uuid FK | |

Index: order_date, mmid, prod_num, channel, dynamic_cmg

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
| product_name_th | text | |
| product_name_en | text | |
| brands | text | แบรนด์ Unilever |
| senior_buyer_name | text | |
| buyer_name | text | |
| class_name | text | หมวดหมู่ |
| subclass | text | |
| is_1px | boolean | |
| url_makro_pro | text | |
| batch_id, updated_at | | |

Index: brands

#### telesales_calls
| column | type | note |
|---|---|---|
| mmid | text PK | 1 row ต่อลูกค้า (upsert) |
| mobile | text | |
| first_connected_date | date | จาก col `first_conected_date` (typo ในต้นฉบับ) |
| call_status | text | Contacted / No Answer / Interested / Not Interested / Ordered |
| reason_group | text | |
| reason_subgroup | text | |
| contact_note | text | |
| agent | text | ชื่อ agent |
| lead_customers | text | จาก col `source_tab` ในไฟล์ต้นฉบับ |
| batch_id, updated_at | | |

Index: agent, call_status

#### targets
| column | type | note |
|---|---|---|
| month | date | "Feb 2026" → `2026-02-01` |
| dynamic_cmg | text | |
| sales_target | numeric(14,2) | |
| buying_target | numeric(14,2) | |
| contact_target | numeric(14,2) | |
| batch_id, updated_at | | |

PK: (month, dynamic_cmg) · Index: month

#### costs
| column | type | note |
|---|---|---|
| month | date PK | "Feb 2026" → `2026-02-01` |
| cost_per_agent | numeric(12,2) | |
| cost_per_supervisor | numeric(12,2) | |
| batch_id, updated_at | | |

#### incentives
| column | type | note |
|---|---|---|
| tier | numeric(5,2) PK | เช่น `1.10`, `1.20` (ระดับ achievement %) |
| incentive_per_head | numeric(12,2) | |
| batch_id, updated_at | | |

**Incentive tier matching query:** `WHERE achievement_pct >= tier ORDER BY tier DESC LIMIT 1`

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
| `online_sales` | Online Sales | order_sales | order_number |
| `offline_sales` | Offline Sales | order_sales | order_number |
| `leads` | Lead Customers | leads | mmid |
| `products` | Products | products | prod_num |
| `telesales` | Telesales Calls | telesales_calls | mmid |
| `targets` | Targets | targets | month,dynamic_cmg |
| `costs` | Costs | costs | month |
| `incentives` | Incentives | incentives | tier |

### `src/lib/upload/etl.ts`
ETL transforms โดดเด่น:
- **Offline sales_in_vat:** `Math.round(Sales_Ex_VAT × 1.07 × 10000) / 10000`
- **month field:** `"Feb 2026"` → `"2026-02-01"` (via `parseMonth()`)
- **telesales source_tab** → stored as `lead_customers`
- **telesales first_conected_date** (typo ในต้นฉบับ) → `first_connected_date`

### CSV ต้นฉบับ — required headers

**Online Sales:** `order_number`, `ITEM_ID`, `Sales In VAT`, `order_date`, `mmid`, `mobile`, `dynamic_cmg`, `Qty Sold (Online)`, `is_in_paid_sales_report`

**Offline Sales:** `sls_trx_id`, `TRANSACTION_DATE`, `Sales Ex VAT`, `mmid`, `mobile`, `dynamic_cmg`, `prod_num`, `sales_qty`

**Leads:** `mmid`, `cust_name`, `mobile`, `lead_customers`

**Products:** `prod_num`, `product_name_th`, `product_name_en`, `brands`, `senior_buyer_name`, `buyer_name`, `class_name`, `subclass`, `is1PX`, `url_makro_pro`

**Telesales:** `mmid`, `mobile`, `first_conected_date`, `call_status`, `reason_group`, `reason_subgroup`, `contact_note`, `agent`, `source_tab`

**Targets:** `month`, `dynamic_cmg`, `sales_target`, `buying_target`, `contact_target`

**Costs:** `month`, `cost_per_agent`, `cost_per_supervisor`

**Incentives:** `Tier`, `incentive_per_head`

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

**สถานะ:** ✅ Bucket `csv-uploads` สร้างแล้วใน Supabase (2026-05-10)

---

## 8. API Routes

| method | path | description |
|---|---|---|
| POST | `/api/upload/[type]` | รับ CSV → validate → Storage → ETL → upsert Silver |
| GET | `/api/upload/history` | ดึง upload_batches 50 รายการล่าสุด |
| GET | `/api/upload/status` | summary ของแต่ละ Silver table (rows, dates, totals) |
| GET | `/api/kpi/overview` | KPI cards + daily sales trend |
| GET | `/api/kpi/sales` | Sales performance + recent orders |
| GET | `/api/kpi/telesales` | Call stats + Sankey funnel data |
| GET | `/api/kpi/products` | Top SKUs + brand breakdown |
| GET | `/api/kpi/leads` | Lead list + status counts |
| GET | `/api/targets` | Targets per month/CMG |
| POST | `/api/invite` | Admin invite user (Supabase magic link) |

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
│   │   ├── overview/page.tsx           # Summary KPIs + sales trend (weekly agg)
│   │   ├── sales/page.tsx              # Sales performance + target gauge
│   │   ├── telesales/page.tsx          # Call stats + Sankey funnel
│   │   ├── products/page.tsx           # SKU/brand breakdown
│   │   ├── leads/page.tsx              # Lead list + status pie
│   │   ├── incentives/page.tsx         # Incentive tracking
│   │   ├── upload/page.tsx             # CSV upload + data status cards
│   │   └── settings/page.tsx           # Targets + invite users
│   ├── api/
│   │   ├── upload/[type]/route.ts      # Upload pipeline (7 steps)
│   │   ├── upload/history/route.ts     # Upload audit log
│   │   ├── upload/status/route.ts      # Silver table summaries
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
│   │   ├── NivoBar.tsx                 # @nivo/bar wrapper (supports tickRotation, valueFormat)
│   │   ├── NivoLine.tsx                # @nivo/line wrapper
│   │   ├── NivoPie.tsx                 # @nivo/pie wrapper
│   │   └── SankeyFunnel.tsx            # @nivo/sankey (telesales pipeline)
│   ├── dashboard/
│   │   ├── KpiCard.tsx                 # KPI card (icon, value, subtitle, comparison %)
│   │   ├── TargetGaugeBar.tsx          # Progress bar with % achievement + color coding
│   │   ├── RadialGauge.tsx             # Circular gauge
│   │   └── DataTable.tsx               # Sortable paginated table
│   ├── layout/
│   │   ├── Sidebar.tsx                 # Navigation sidebar
│   │   └── TopBar.tsx                  # Date range picker + header
│   └── ui/                             # shadcn/ui components (card, badge, button, skeleton...)
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client (anon key)
│   │   └── server.ts                   # Server Supabase client (service role)
│   ├── upload/
│   │   ├── config.ts                   # File type configs + header validation + storage paths
│   │   └── etl.ts                      # Row transform functions per file type
│   ├── mock/data.ts                    # Mock data (ใช้เมื่อ USE_MOCK_DATA=true)
│   └── utils.ts                        # formatTHB, formatNumber, formatDate, formatPct, cn
│
├── context/
│   ├── DateRangeContext.tsx            # Global date range state (90 days default)
│   └── SidebarContext.tsx
├── hooks/
│   └── useKpi.ts                       # SWR wrapper พร้อม date range params
├── types/index.ts                      # TypeScript types
└── middleware.ts                       # TODO: Supabase session check

supabase/
└── migrations/
    ├── 20260510032319_silver_tables.sql
    └── 20260510032924_fix_telesales_source_tab.sql
```

---

## 10. Current Status

### เสร็จแล้ว ✅
- [x] Next.js 14 + TypeScript + Tailwind + shadcn/ui bootstrap
- [x] Sidebar, TopBar, DateRangePicker layout
- [x] Dashboard pages ทุกหน้า (Overview, Sales, Telesales, Products, Leads, Incentives, Upload, Settings) — ใช้ Mock data
- [x] Charts: NivoBar (weekly aggregation), NivoLine, NivoPie, SankeyFunnel
- [x] KpiCard (รองรับ icon, subtitle, comparison %), TargetGaugeBar, DataTable components
- [x] Silver schema ใน Supabase: 8 tables + indexes + FK — **apply แล้ว (verified 2026-05-10)**
- [x] Storage bucket `csv-uploads` สร้างแล้วใน Supabase (private)
- [x] แก้ bug: single quotes ใน `.env.local` ทำให้ JWT invalid → ลบออกแล้ว
- [x] `src/lib/upload/config.ts` — 8 file types พร้อม header fingerprint
- [x] `src/lib/upload/etl.ts` — ETL transform ทุก file type
- [x] `POST /api/upload/[type]` — full 7-step pipeline
- [x] `GET /api/upload/history` — upload audit log
- [x] `GET /api/upload/status` — Silver table summary (rows, date ranges, totals)
- [x] Upload page UI: file type selector, drag-drop, header validation, 5-row preview, result, history table, Data Status cards (8 cards)
- [x] TypeScript clean build (0 errors)

### ยังไม่ได้ทำ ❌

#### Phase ถัดไป: Connect Real Data
- [ ] ลบ `USE_MOCK_DATA=true` → ต่อ KPI routes กับ Silver tables จริง
- [ ] ออกแบบ Gold Views หลัง Dashboard UI finalize
- [ ] RLS Policies บน Silver tables

#### Phase: Auth
- [ ] `middleware.ts` — check Supabase session, redirect `/login` ถ้าไม่มี session
- [ ] `/login` — ต่อ `supabase.auth.signInWithOtp()` (UI มีแล้ว)
- [ ] `/auth/callback` — exchange code → session
- [ ] `user_roles` table (admin / viewer_telesales + company)
- [ ] `/api/invite` — `supabase.auth.admin.inviteUserByEmail()`
- [ ] Settings page: user list + invite form (ต่อ backend)

#### Phase: Deploy
- [ ] Push to GitHub → connect Vercel
- [ ] Add env vars ใน Vercel dashboard
- [ ] Test magic link ด้วย production URL

---

## 11. Gold Views (ออกแบบทีหลัง)

Gold Views จะถูก implement หลังจาก Dashboard UI finalize แล้ว เพื่อ match กับ query patterns จริง

**แนวทาง:**
- สร้างเป็น PostgreSQL `VIEW` หรือ `MATERIALIZED VIEW` ใน Supabase
- ตัวอย่าง: `vw_daily_sales`, `vw_agent_performance`, `vw_lead_funnel`, `vw_product_ranking`
- KPI routes จะ query Gold views แทน Silver tables โดยตรง

---

## 12. Auth & Roles (ออกแบบไว้แล้ว ยังไม่ implement)

```sql
CREATE TABLE user_roles (
  user_id uuid REFERENCES auth.users PRIMARY KEY,
  role    text NOT NULL CHECK (role IN ('admin', 'viewer_telesales')),
  company text   -- สำหรับ viewer_telesales: filter scope
);
```

**Flow:**
1. Admin → Settings → กรอก email → `POST /api/invite` → Supabase ส่ง magic link
2. User คลิก link → `/auth/callback` → session สร้าง → insert `user_roles`
3. `middleware.ts` ตรวจ session ทุก request
4. `viewer_telesales` เห็นเฉพาะ telesales_calls / leads ที่ match `company`

---

## 13. Local Dev

```bash
npm install
npm run dev        # http://localhost:3000
```

ตั้งค่า `.env.local` ก่อน (ดู Section 4)  
ถ้า `USE_MOCK_DATA=true` ไม่ต้องต่อ Supabase — ทุก KPI route ใช้ `src/lib/mock/data.ts`

```bash
# Apply DB migrations
npx supabase link --project-ref <ref>
npx supabase db push
```
