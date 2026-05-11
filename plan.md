# Unilever Project — Telesales Dashboard Plan

> อัปเดตล่าสุด: 2026-05-11
> สถานะปัจจุบัน: Upload pipeline ✅ · Silver/Gold schema ✅ · Storage Encryption ✅ · Data Masking (mobile + name) ✅ · **กำลัง: ทดสอบ Upload ข้อมูลจริง** · Auth ❌ · Deploy ❌

---

## 1. Overview

Dashboard ร่วม 3 บริษัท (Makro, Unilever, Telesales Company) ติดตาม KPI การสร้างลูกค้าใหม่และยอดขาย Unilever บน Makro Pro

**Core requirements:**
- Admin อัปโหลด CSV 8 ประเภท → ระบบ validate → ETL → Supabase
- Dashboard แสดง KPI, chart, funnel แบบ real-time กรองตาม date range
- Role-based access: `admin` เห็นทุกอย่าง, `viewer` เห็นเฉพาะข้อมูลบริษัทตัวเอง
- Login ด้วย Magic Link เท่านั้น (ไม่มี password)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI / Components | shadcn/ui + Tailwind CSS |
| Charts | @nivo/bar, @nivo/line, @nivo/pie + Recharts (shadcn chart) |
| Auth | Supabase Auth (Magic Link + Invite) — DB พร้อม, Next.js ยังไม่ implement |
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
[Bronze] Supabase Storage: csv-uploads (private)
         RLS: admin only (INSERT/SELECT/UPDATE/DELETE)
         File limit: 50 MB · MIME: text/csv, text/plain, application/vnd.ms-excel
         ⚠️  ไฟล์ถูก AES-256-GCM Encrypt ก่อน upload (key ใน STORAGE_ENCRYPTION_KEY)
         ชื่อไฟล์: {folder}/{timestamp}_{6-char-token}_{type}.csv
        │
        ▼ (ETL ใน /api/upload/[type])
[Silver] PostgreSQL tables
         online_sales, offline_sales
         leads, telesales_calls, products
         targets, costs, incentives
         Triggers: LPAD mmid→14 digits
                   format_and_mask_mobile()  → mobile: 08999xxxxx
                   format_and_mask_cust_name() → cust_name: วัชxxxx เจxxxxx
        │
        ▼ (Gold VIEW)
[Gold]   order_sales VIEW
         = UNION ALL (online_sales + offline_sales)
         LEFT JOIN products ON prod_num
         + is_uni_hoc_pd = (product_name_en IS NOT NULL)
         + channel จาก silver table column
        │
        ▼ (RPC functions)
[Agg]   get_sales_totals()          — SUM sales bypass PostgREST 1000-row cap
        get_tier_breakdown()        — leads × telesales_calls GROUP BY category
        get_call_status_counts()    — telesales_calls GROUP BY call_status
        pad_mmid_to_14()            — trigger function
        format_and_mask_mobile()    — trigger: LPAD→10 digits + mask last 5 → 08999xxxxx
        format_and_mask_cust_name() — trigger: mask name → วัชxxxx เจxxxxx
```

---

## 4. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # server routes only
NEXT_PUBLIC_APP_URL=http://localhost:3000
STORAGE_ENCRYPTION_KEY=<64-char hex>  # AES-256-GCM key สำหรับ encrypt CSV ก่อน upload
```

> ⚠️ ค่า JWT key ต้องไม่มี single quotes ครอบ  
> ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...`  
> ❌ `NEXT_PUBLIC_SUPABASE_ANON_KEY='eyJhbGci...'`

---

## 5. Database Schema

### Migration files (consolidated)
```
supabase/migrations/
  20260511200000_consolidated_schema.sql   # source of truth ทุก Silver tables + auth schema
  20260511210000_leads_kpi_functions.sql   # RPC: get_tier_breakdown, get_call_status_counts
  20260511220000_storage_security.sql      # Storage bucket policies + file limits
```

> Migration squash: ไฟล์เก่า 20260510xxxxxx ถูก squash → `20260511200000` แล้ว  
> `supabase migration repair` ใช้ mark applied แล้วใน remote DB

### Silver Tables

#### upload_batches (audit log)
| column | type | note |
|---|---|---|
| id | uuid PK | |
| table_name | text | silver table ที่ import |
| filename | text | |
| storage_path | text | path ใน bucket |
| row_count | integer | rows ที่ import สำเร็จ |
| error_count | integer | |
| status | text | `success` / `partial` / `failed` |
| uploaded_by | uuid FK→auth.users | null ก่อน Auth implement |
| uploaded_at | timestamptz | |

#### online_sales
| column | type | note |
|---|---|---|
| id | uuid PK | surrogate key |
| order_number | text NOT NULL | UNIQUE ร่วมกับ prod_num |
| order_date | date NOT NULL | |
| mmid | text | LPAD→14 digits (trigger) |
| mobile | text | LPAD→10 digits (trigger) |
| dynamic_cmg | text | |
| prod_num | text | |
| sales_qty | numeric(10,2) | |
| sales_in_vat | numeric(14,2) | |
| channel | text NOT NULL | DEFAULT 'Online' · CHECK IN ('Online','Offline') |
| is_in_paid_report | boolean | |
| batch_id | uuid FK | |

UNIQUE: `(order_number, prod_num)` · Index: order_date, mmid, prod_num, dynamic_cmg

#### offline_sales
เหมือน online_sales ยกเว้น: ไม่มี `is_in_paid_report` · channel DEFAULT `'Offline'`

UNIQUE: `(order_number, prod_num)` · Index: order_date, mmid, prod_num, dynamic_cmg

#### leads
| column | type | note |
|---|---|---|
| mmid | text PK | LPAD→14 digits (trigger) |
| cust_name | text | |
| mobile | text | LPAD→10 digits (trigger) |
| lead_customers | text | tier: "0-5000", "5000-10000", "10000-20000", "20000-50000", "50000+" |
| batch_id, updated_at | | |

#### products
| column | type | note |
|---|---|---|
| prod_num | text PK | |
| product_name_th / en | text | is_uni_hoc_pd ใน VIEW ใช้ `product_name_en IS NOT NULL` |
| brands | text | |
| senior_buyer_name / buyer_name | text | |
| class_name / subclass | text | |
| is_1px | boolean | |
| url_makro_pro | text | |

#### telesales_calls
| column | type | note |
|---|---|---|
| mmid | text PK | LPAD→14 digits (trigger) |
| mobile | text | LPAD→10 digits (trigger) |
| first_connected_date | date | (typo ในต้นฉบับ: `first_conected_date`) |
| call_status | text | ภาษาไทย: รับสาย, ไม่รับสาย 1, ฝากข้อความ ฯลฯ |
| reason_group / reason_subgroup | text | |
| contact_note | text | |
| agent | text | |
| lead_customers | text | (renamed from source_tab) |

#### targets
PK: `(month, dynamic_cmg)` · columns: sales_target, buying_target, contact_target

#### costs
PK: `month` · columns: cost_per_agent, cost_per_supervisor

#### incentives
PK: `tier` (numeric) · columns: incentive_per_head

### Gold Layer

#### order_sales (VIEW)
```sql
SELECT
  s.id, s.order_number, s.order_date, s.mmid, s.mobile, s.dynamic_cmg,
  s.prod_num, s.sales_qty, s.sales_in_vat,
  s.channel,                                    -- จาก silver table
  s.is_in_paid_report,
  s.batch_id, s.updated_at,
  p.product_name_th, p.product_name_en, p.brands,
  p.senior_buyer_name, p.buyer_name,
  p.class_name, p.subclass, p.is_1px, p.url_makro_pro,
  (p.product_name_en IS NOT NULL) AS is_uni_hoc_pd
FROM online_sales s LEFT JOIN products p ON p.prod_num = s.prod_num
UNION ALL
SELECT ... FROM offline_sales s LEFT JOIN products p ON p.prod_num = s.prod_num
```

### Triggers (LPAD)
| Trigger | Table | Column | Format |
|---|---|---|---|
| trg_pad_mmid_* | online_sales, offline_sales, leads, telesales_calls | mmid | 14 digits |
| trg_pad_mobile_* | online_sales, offline_sales, leads, telesales_calls | mobile | 10 digits |

### Auth Schema
```sql
user_profiles: user_id (PK→auth.users), email, full_name, role, company, invited_by, last_seen
invite_codes:  code (UNIQUE), role, company, max_uses, use_count, expires_at, is_active
audit_logs:    user_id, action, entity_type, entity_id, metadata (jsonb)
```
**Roles:** `admin` (upload + manage all) / `viewer` (read only, filtered by company)

---

## 6. Storage Security

Bucket: `csv-uploads` (private)

| Setting | Value |
|---|---|
| Public | ❌ |
| File size limit | 50 MB |
| Allowed MIME | text/csv, text/plain, application/vnd.ms-excel, application/octet-stream |

RLS Policies (storage.objects):
| Policy | Cmd | Condition |
|---|---|---|
| csv_uploads_insert_admin | INSERT | authenticated + role = 'admin' |
| csv_uploads_select_admin | SELECT | authenticated + role = 'admin' |
| csv_uploads_update_admin | UPDATE | authenticated + role = 'admin' |
| csv_uploads_delete_admin | DELETE | authenticated + role = 'admin' |
| csv_uploads_deny_anon | SELECT | anon → false |

> API routes ใช้ `service_role key` → bypass RLS ✓  
> Policies ป้องกัน direct client-side access

```
csv-uploads/
  order_sales/online/{timestamp}_{token}_online_sales.csv   # AES-256 encrypted
  order_sales/offline/{timestamp}_{token}_offline_sales.csv
  leads/{timestamp}_{token}_leads.csv
  products/{timestamp}_{token}_products.csv
  telesales/{timestamp}_{token}_telesales.csv
  targets/{timestamp}_{token}_targets.csv
  costs/{timestamp}_{token}_costs.csv
  incentives/{timestamp}_{token}_incentives.csv
```

> ⚠️ **ไฟล์ถูก Encrypt ทั้งหมด** ด้วย AES-256-GCM ก่อน upload — เปิดอ่านตรงๆ ไม่ได้
> ถ้าต้องการ decrypt (กรณี ETL พัง) ใช้ `src/lib/utils/crypto.ts` `decrypt()` ด้วย `STORAGE_ENCRYPTION_KEY`

---

## 7. Upload Config & ETL

### `src/lib/upload/config.ts`

| type | table | conflict key |
|---|---|---|
| `online_sales` | online_sales | order_number, prod_num |
| `offline_sales` | offline_sales | order_number, prod_num |
| `leads` | leads | mmid |
| `products` | products | prod_num |
| `telesales` | telesales_calls | mmid |
| `targets` | targets | month, dynamic_cmg |
| `costs` | costs | month |
| `incentives` | incentives | tier |

### `src/lib/upload/etl.ts`
- **online_sales prod_num:** จาก col `ITEM_ID`
- **Offline sales_in_vat:** `Sales_Ex_VAT × 1.07` rounded 2 decimal
- **month field:** `"Feb 2026"` → `"2026-02-01"`
- **telesales source_tab** → stored as `lead_customers`
- **Dedup ก่อน upsert:** Map ตาม composite key → prevent "ON CONFLICT DO UPDATE cannot affect row a second time"
- **Null guard:** row ที่ `order_date` null → skip

> ⚠️ conflict key ต้องเป็น `(order_number, prod_num)` — 1 order มีหลาย line items

---

## 8. API Routes

| method | path | description |
|---|---|---|
| POST | `/api/upload/[type]` | CSV → validate → Storage → ETL → upsert Silver |
| GET | `/api/upload/history` | upload_batches 50 รายการล่าสุด |
| GET | `/api/upload/status` | Silver table summaries (RPC aggregate) |
| DELETE | `/api/dev/reset` | DEV ONLY — truncate all + clear Storage |
| GET | `/api/kpi/overview` | KPI cards + daily sales trend |
| GET | `/api/kpi/sales` | Sales performance + recent orders |
| GET | `/api/kpi/telesales` | Call stats + Sankey funnel data |
| GET | `/api/kpi/products` | Top SKUs + brand breakdown |
| GET | `/api/kpi/leads?page=&limit=` | Paginated leads + call status (real data) |
| GET | `/api/targets` | Targets per month/CMG |

> ⚠️ **PostgREST 1000-row cap:** ใช้ `{ count: 'exact' }` + `.count` หรือ RPC สำหรับ aggregate

---

## 9. Dashboard Pages

### Sidebar Navigation
**Dashboard group:** Overview · Telesales · Sales · Products · Incentives

**Admin group (admin only):** Leads · Upload Data · Settings

TopBar ซ่อน date filter + Print บนหน้า: `/upload`, `/settings`, `/leads`

### Leads Page (real data ✅)
ข้อมูลจาก:
- `leads` table — mmid, cust_name, mobile, lead_customers (tier)
- `telesales_calls` table — call_status, agent, first_connected_date, reason_group
- RPC `get_tier_breakdown()` — leads × telesales_calls per category
- RPC `get_call_status_counts()` — call status distribution

Components:
- KPI: Total Leads / Called (%) / Not Called (%) / Reached (% of called)
- **Leads Category** — Recharts Stacked Bar (Called / Not Called per tier)
- **Call Status Breakdown** — NivoBar horizontal
- **All Leads table** — plain `<table>` + server-side pagination 50 rows/page

---

## 10. File Structure

```
src/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── overview/page.tsx
│   │   ├── sales/page.tsx
│   │   ├── telesales/page.tsx
│   │   ├── products/page.tsx
│   │   ├── leads/page.tsx           # real data · admin only
│   │   ├── incentives/page.tsx
│   │   ├── upload/page.tsx          # Tabs: Overview / Data Status / History
│   │   └── settings/page.tsx
│   └── api/ ...
│
├── components/
│   ├── app-sidebar.tsx              # shadcn/ui Sidebar + NavUser + SidebarRail
│   ├── nav-user.tsx                 # Avatar + DropdownMenu (Account/Billing/Logout)
│   ├── charts/
│   │   ├── NivoBar.tsx
│   │   ├── NivoLine.tsx
│   │   ├── NivoPie.tsx
│   │   └── SankeyFunnel.tsx
│   ├── dashboard/
│   │   ├── KpiCard.tsx
│   │   ├── TargetGaugeBar.tsx
│   │   └── DataTable.tsx
│   ├── layout/TopBar.tsx
│   └── ui/                          # shadcn: card, badge, button, skeleton, tabs,
│                                    #         avatar, dropdown-menu, chart, sidebar ...
│
├── lib/
│   ├── supabase/client.ts
│   ├── supabase/server.ts           # createServiceClient() + auth stubs
│   ├── upload/config.ts             # FILE_TYPE_CONFIGS + generateStoragePath (random token)
│   ├── upload/etl.ts
│   ├── utils/crypto.ts              # AES-256-GCM encrypt/decrypt
│   └── utils.ts
│
├── context/DateRangeContext.tsx
├── hooks/use-mobile.ts
└── middleware.ts                    # ADMIN_PATHS defined · TODO: session check

supabase/migrations/
  20260511200000_consolidated_schema.sql
  20260511210000_leads_kpi_functions.sql
  20260511220000_storage_security.sql
```

---

## 11. Current Status

### เสร็จแล้ว ✅

#### Infrastructure & DB
- [x] Supabase project · PostgreSQL schema · migrations consolidated
- [x] Silver tables: online_sales, offline_sales, leads, products, telesales_calls, targets, costs, incentives
- [x] Gold VIEW: order_sales (UNION ALL + LEFT JOIN products + is_uni_hoc_pd)
- [x] Triggers: LPAD mmid→14 digits, LPAD mobile→10 digits (all 4 tables)
- [x] RPC: get_sales_totals, get_tier_breakdown, get_call_status_counts
- [x] Auth schema: user_profiles, invite_codes, audit_logs
- [x] Storage security: RLS policies (admin only) + 50MB limit + MIME filter

#### Frontend
- [x] shadcn/ui Sidebar: AppSidebar + SidebarRail + NavUser (Avatar + DropdownMenu)
- [x] TopBar: SidebarTrigger + Breadcrumb + date filter (hidden on admin pages)
- [x] Leads page → admin group · real DB data · Stacked Bar chart · server-side pagination
- [x] Upload page: Tabs / Skeleton / Concurrent upload / Progress card / Pagination
- [x] Charts: NivoBar, NivoLine, NivoPie, SankeyFunnel, Recharts stacked bar (shadcn chart)
- [x] KpiCard, DataTable, TargetGaugeBar components

#### Upload Pipeline & Security
- [x] 8 file types · composite conflict keys · ETL + dedup + null guard
- [x] `POST /api/upload/[type]` — 8-step pipeline
- [x] `GET /api/upload/history` / `status`
- [x] All API routes: service_role key + cache:'no-store'
- [x] Storage Encryption: AES-256-GCM (`src/lib/utils/crypto.ts`) ก่อน upload ทุกครั้ง
- [x] Random token ในชื่อไฟล์: `{timestamp}_{6-char-token}_{type}.csv`
- [x] `format_and_mask_mobile()`: 0899999999 → 08999xxxxx (DB trigger)
- [x] `format_and_mask_cust_name()`: วัชรพล เจริญสุข → วัชxxxx เจxxxxx (DB trigger)
- [x] Branding อัปเดต: Unilever Project · ไอคอน U · ตัด Settings ออก
- [x] ลบ Mock data ทั้งหมด (src/lib/mock ลบแล้ว · API routes ต่อ DB จริง)

---

### Roadmap (แผนต่อไป)

#### Phase 1 — ทดสอบ Upload ข้อมูลจริง 🔄 (ทำอยู่)
- [ ] อัปโหลด leads ข้อมูลจริง → ตรวจ row_count / error_count
- [ ] ตรวจว่า mobile ถูก mask: 08999xxxxx ✓
- [ ] ตรวจว่า cust_name ถูก mask: วัชxxxx เจxxxxx ✓
- [ ] อัปโหลด online_sales + offline_sales → ตรวจ Dashboard แสดงผลถูกต้อง
- [ ] อัปโหลด telesales → ตรวจ Sankey funnel + call status
- [ ] ทดสอบ Upsert ซ้ำ (อัปโหลดไฟล์เดิม 2 ครั้ง) → ไม่มี error
- [ ] ตรวจ Storage ว่าไฟล์ถูก Encrypt (เปิดตรงๆ อ่านไม่ออก)

#### Phase 2 — Auth Implementation ❌
- [ ] `/register` — email + invite code → magic link
- [ ] `/login` — `supabase.auth.signInWithOtp()`
- [ ] `/auth/callback` — exchange code → session → insert user_profiles
- [ ] `middleware.ts` — check session · redirect `/login` · block admin paths for viewer
- [ ] Settings page — create/revoke invite codes · user list
- [ ] `/api/dev/reset` จะถูกล็อกโดย Auth middleware โดยอัตโนมัติหลัง Phase นี้
- [ ] เพิ่ม Auth check ใน Upload API (`getSessionUserId()` → real user id)
- [ ] RLS Policies (viewer เห็นเฉพาะ company ตัวเอง)

#### Phase 3 — Dashboard Real Data ❌
- [ ] Overview, Sales, Telesales, Products, Incentives pages → ต่อ Silver/Gold tables จริง
- [ ] Month/Week/Day (Custom) filter → เปลี่ยน x-axis aggregation ตาม mode

#### Phase 4 — Deploy ❌
- [ ] Push to GitHub → connect Vercel
- [ ] Add env vars ใน Vercel (รวม STORAGE_ENCRYPTION_KEY)
- [ ] ตรวจสอบ `NODE_ENV=production` → `/api/dev/reset` ถูกบล็อก
- [ ] Test magic link ด้วย production URL

---

## 12. Known Issues & Notes

| เรื่อง | รายละเอียด |
|---|---|
| PostgREST 1000-row cap | ใช้ `{ count: 'exact' }` + `.count` หรือ RPC สำหรับ aggregate |
| Supabase embedded join | ต้องมี FK ระหว่างตาราง ไม่เช่นนั้น ใช้ 2 queries + merge แทน |
| isValidating vs isLoading | SWR: ใช้ `isValidating` สำหรับ refresh UX |
| LPAD trigger | mmid/mobile ใน CSV บางไฟล์อาจถูกตัด leading zero → trigger แก้อัตโนมัติ |
| order_sales is VIEW | ไม่สามารถสร้าง trigger บน VIEW ได้ — triggers อยู่บน silver tables |
| Migration squash | ไฟล์เก่า 20260510xxxxxx squash แล้ว · repair ด้วย `supabase migration repair --status reverted` |
| Auth stub | `getSessionUserId()` คืน null จนกว่าจะ implement Auth |

---

## 13. Local Dev

```bash
npm install
npm run dev        # http://localhost:3000

# Apply DB migrations
supabase link --project-ref <ref>
supabase db push

# DEV: reset all data
curl -X DELETE http://localhost:3000/api/dev/reset
```
