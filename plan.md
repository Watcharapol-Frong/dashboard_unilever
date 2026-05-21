# Unilever Project — Telesales Dashboard Plan

> อัปเดตล่าสุด: 2026-05-16
> สถานะปัจจุหน้า: Supabase → CockroachDB + R2 migration ✅ · Upload pipeline ✅ · Storage Encryption ✅ · **กำลัง: ทดสอบ Upload ข้อมูลจริง** · Auth ❌ · Deploy ❌

---

## 1. Overview

Dashboard ร่วม 3 บริษัท (Makro, Unilever, Telesales Company) ติดตาม KPI การสร้างลูกค้าใหม่และยอดขาย Unilever บน Makro Pro

**Core requirements:**
- Admin อัปโหลด CSV 8 ประเภท → ระบบ validate → ETL → CockroachDB
- Dashboard แสดง KPI, chart, funnel แบบ real-time กรองตาม date range
- Role-based access: `admin` เห็นทุกอย่าง, `viewer` เห็นเฉพาะข้อมูลบริษัทตัวเอง
- Login ด้วย Magic Link เท่านั้น (ยังไม่ implement)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI / Components | shadcn/ui + Tailwind CSS |
| Charts | @nivo/bar, @nivo/line, @nivo/pie + Recharts |
| Auth | ยังไม่ implement (placeholder stub) |
| Database | **CockroachDB Serverless** (PostgreSQL-compatible, 10 GB free) |
| File Storage | **Cloudflare R2** (S3-compatible, 10 GB free, no egress) |
| DB Client | `pg` (node-postgres) Pool |
| Storage Client | `@aws-sdk/client-s3` |
| CSV Parsing | Papa Parse (client preview + server ETL) |
| Data Fetching | SWR (auto-revalidate) |
| Deployment | Vercel (ยังไม่ได้ deploy) |

---

## 3. Architecture — Data Flow

```
CSV File (Admin upload)
        │
        ▼
[Storage] Cloudflare R2: bucket "dashboard-unilever" (private)
          ⚠️ ไฟล์ถูก AES-256-GCM Encrypt ก่อน upload
           ชื่อไฟล์: {folder}/{timestamp}_{6-char-token}_{type}.csv
        │
        ▼ ETL ใน /api/data/upload/[type]
[Silver] CockroachDB tables
         online_sales, offline_sales

         leads, telesales_calls, products
         targets, costs, incentives, upload_batches
        │
        ▼ inline SQL in API routes
[API]   /api/analytics/* — UNION ALL + aggregation in SQL โดยตรง (ไม่มี VIEW/RPC)
```

---

## 4. Environment Variables

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
STORAGE_ENCRYPTION_KEY=<64-char hex>   # AES-256-GCM

# CockroachDB
DATABASE_URL=postgresql://USER:PASS@HOST:26257/defaultdb?sslmode=verify-full

# Cloudflare R2
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key>
R2_SECRET_ACCESS_KEY=<r2 secret key>
R2_BUCKET_NAME=dashboard-unilever
```

---

## 5. Database Schema

Schema อยู่ที่: `db/schema.sql` (run บน CockroachDB Console)

### Silver Tables

| Table | PK / Unique | หมายเหตุ |
|---|---|---|
| upload_batches | uuid PK | audit log ทุก upload |
| online_sales | uuid PK · UNIQUE(order_number, prod_num) | |
| offline_sales | uuid PK · UNIQUE(order_number, prod_num) | sales_in_vat = Sales_Ex_VAT × 1.07 |
| leads | mmid PK | upsert per customer |
| products | prod_num PK | |
| telesales_calls | mmid PK | latest call per customer |
| targets | PK(month, dynamic_cmg) | |
| costs | month PK | |
| incentives | tier PK | |

> ⚠️ **ไม่มี DB Trigger** — ETL ใน `/api/data/upload/[type]` จัดการ normalize เอง
> ⚠️ **ไม่มี VIEW/RPC** — API routes ใช้ inline SQL + UNION ALL โดยตรง

---

## 6. Upload Config & ETL

### File Type Configs (`src/lib/upload/config.ts`)

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

### ETL Notes (`src/lib/upload/etl.ts`)
- **online_sales prod_num:** จาก column `ITEM_ID`
- **offline_sales sales_in_vat:** `Sales_Ex_VAT × 1.07` rounded 2 decimal
- **month field:** `"Feb 2026"` → `"2026-02-01"`
- **telesales source_tab** → stored as `lead_customers`
- **Dedup ก่อน upsert:** Map ตาม composite key → ป้องกัน `ON CONFLICT DO UPDATE cannot affect row a second time`
- **Null guard:** row ที่ `mmid` null (leads/telesales) หรือ `order_date` null → skip

### Upload Pipeline (8 steps)
1. Parse CSV (PapaParse)
2. Validate headers
3. Encrypt + upload to R2
4. Insert `upload_batches` record → get batch UUID
5. ETL transform rows
6. Dedup by conflict key
7. Chunked upsert to CockroachDB (500 rows/chunk) via `INSERT ... ON CONFLICT DO UPDATE`
8. Update batch with final row_count / error_count / status

---

## 7. API Routes

| method | path | description |
|---|---|---|
| POST | `/api/data/upload/[type]` | CSV → validate → R2 → ETL → upsert Silver |
| GET | `/api/data/history` | upload_batches 50 รายการล่าสุด |
| GET | `/api/data/status` | Silver table summaries |
| POST | `/api/data/ingest/telesales-activity` | Ingest telesales activity from external source |
| GET | `/api/analytics/overview` | KPI cards + daily trend + period comparison |
| GET | `/api/analytics/sales` | Sales performance + recent orders |
| GET | `/api/analytics/telesales` | Call stats + Sankey funnel |
| GET | `/api/analytics/products` | Top SKUs + brand breakdown |
| GET | `/api/analytics/leads` | Leads KPI + agent performance + sankey |
| GET | `/api/master/targets` | Targets per month/CMG |
| POST | `/api/master/targets` | Upsert target |
| DELETE | `/api/master/targets` | Delete target |
| GET | `/api/master/incentives` | Incentive tiers |
| POST | `/api/master/invite` | Invite new users (stub) |
| DELETE | `/api/system/reset` | DEV ONLY — delete all rows + clear R2 |
| GET | `/api/system/check-sales` | System check for sales data consistency |
| POST | `/api/system/replay` | Replay ETL for specific batches |

---

## 8. File Structure

```
dashboard-unilever/
├── db/
│   └── schema.sql              # CockroachDB DDL (run ครั้งเดียวตอน setup)
│
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx          # placeholder (auth ยังไม่ implement)
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── overview/page.tsx
│   │   │   ├── sales/page.tsx
│   │   │   ├── telesales/page.tsx
│   │   │   ├── products/page.tsx
│   │   │   ├── leads/page.tsx
│   │   │   ├── incentives/page.tsx
│   │   │   └── upload/page.tsx
│   │   ├── auth/callback/route.ts         # placeholder redirect → /overview
│   │   └── api/
│   │       ├── analytics/
│   │       │   └── {overview,sales,telesales,products,leads}/route.ts
│   │       ├── data/
│   │       │   ├── upload/[type]/route.ts
│   │       │   ├── history/route.ts
│   │       │   ├── status/route.ts
│   │       │   └── ingest/telesales-activity/route.ts
│   │       ├── master/
│   │       │   ├── targets/route.ts
│   │       │   ├── incentives/route.ts
│   │       │   └── invite/route.ts
│   │       └── system/
│   │           └── {reset,check-sales,replay}/route.ts
│   │
│   ├── components/
│   │   ├── app-sidebar.tsx
│   │   ├── nav-user.tsx
│   │   ├── charts/{NivoBar,NivoLine,NivoPie,SankeyFunnel}.tsx
│   │   ├── dashboard/{KpiCard,TargetGaugeBar,DataTable,RadialGauge}.tsx
│   │   ├── layout/TopBar.tsx
│   │   └── ui/                            # shadcn components
│   │
│   ├── lib/
│   │   ├── db/index.ts                    # pg Pool singleton (CockroachDB)
│   │   ├── storage/r2.ts                  # S3Client for Cloudflare R2
│   │   ├── upload/config.ts
│   │   ├── upload/etl.ts
│   │   ├── utils/crypto.ts                # AES-256-GCM encrypt/decrypt
│   │   └── utils.ts
│   │
│   ├── context/{DateRangeContext,SidebarContext}.tsx
│   ├── hooks/{use-mobile,useKpi}.ts
│   └── middleware.ts                      # ADMIN_PATHS · TODO: auth check
│
└── .env.local                             # ไม่ commit (gitignore)
```

---

## 9. Storage Layout (Cloudflare R2)

Bucket: `dashboard-unilever` (private)

```
dashboard-unilever/
  order_sales/online/{timestamp}_{token}_online_sales.csv   # AES-256 encrypted
  order_sales/offline/{timestamp}_{token}_offline_sales.csv
  leads/{timestamp}_{token}_leads.csv
  products/{timestamp}_{token}_products.csv
  telesales/{timestamp}_{token}_telesales.csv
  targets/{timestamp}_{token}_targets.csv
  costs/{timestamp}_{token}_costs.csv
  incentives/{timestamp}_{token}_incentives.csv
```

> ถ้าต้องการ decrypt: ใช้ `src/lib/utils/crypto.ts` `decrypt()` ด้วย `STORAGE_ENCRYPTION_KEY`

---

## 10. Current Status

### เสร็จแล้ว ✅

- [x] ย้ายออกจาก Supabase → CockroachDB (10 GB free) + Cloudflare R2 (10 GB free)
- [x] `src/lib/db/index.ts` — pg Pool + SSL สำหรับ CockroachDB
- [x] `src/lib/storage/r2.ts` — S3Client Cloudflare R2
- [x] API routes ทั้งหมด ใช้ inline SQL ผ่าน pg แทน Supabase JS client
- [x] Upload pipeline: R2 + CockroachDB upsert
- [x] Fix double-upload bug (React StrictMode double-invoke ใน `enqueueJob`)
- [x] Fix system/reset: ใช้ `DELETE FROM` แทน `TRUNCATE CASCADE` (CockroachDB compat)
- [x] CockroachDB tables ถูก create แล้ว (`db/schema.sql` run แล้ว)
- [x] TypeScript clean (ไม่มี error)
- [x] ลบ Supabase packages + config + migrations ทั้งหมด
- [x] Cleanup: ลบ debug scripts, unused components, supabase folder
- [x] Pushed to GitHub: `main` branch

### Roadmap

#### Phase 1 — ทดสอบ Upload ข้อมูลจริง 🔄
- [ ] อัปโหลด leads → ตรวจ row_count / error_count
- [ ] อัปโหลด online_sales + offline_sales → Dashboard แสดงผล
- [ ] อัปโหลด telesales → Sankey funnel + call status
- [ ] ทดสอบ Upsert ซ้ำ (อัปโหลดไฟล์เดิม 2 ครั้ง) → ไม่มี error

#### Phase 2 — Auth Implementation ❌ (เลือก Clerk)
- [ ] สร้าง Clerk application + เพิ่ม env vars (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- [ ] ติดตั้ง `@clerk/nextjs` + wrap `ClerkProvider` ใน root layout
- [ ] `middleware.ts` → `clerkMiddleware()` + protect ADMIN_PATHS
- [ ] `/login` → `<SignIn />` component (magic link built-in)
- [ ] Role-based access: ใช้ Clerk `publicMetadata.role` → admin vs viewer

#### Phase 3 — Deploy ❌
- [ ] Push to GitHub → connect Vercel
- [ ] Add env vars ใน Vercel Dashboard
- [ ] ตรวจสอบ `NODE_ENV=production` → `/api/system/reset` ถูกบล็อก
- [ ] Test จาก public URL

---

## 11. Mart — Customer Type Classification Logic

> บันทึก business logic สำหรับ tag `customer_type` บน order แต่ละรายการ
> ใช้เป็น source of truth ก่อนออกแบบ mart schema ใหม่

### ภาพรวม

ทุก order ที่ mmid เคยถูก telesales call จะถูก tag เป็น 1 ใน 4 ประเภท โดยยึดจาก 2 มิติ:
- **มิติที่ 1:** order นี้ "ถูก attribute" ให้กับ telesales หรือไม่ (อยู่ในหน้าต่าง attr_days หลัง call)
- **มิติที่ 2:** เป็น order แรกของลูกค้าคนนี้ในประเภทนั้นๆ หรือไม่

```
                        ┌─────────────────────────────────────┐
                        │  mmid เคยถูก telesales call ไหม?    │
                        └──────────────┬──────────────────────┘
                                       │ ใช่
                    ┌──────────────────▼──────────────────────┐
                    │  order นี้อยู่ใน attribution window?    │
                    │  (order_date <= call_date + attr_days)  │
                    └──────┬──────────────────────┬───────────┘
                          ใช่                     ไม่ใช่
              ┌────────────▼──────────┐  ┌────────▼──────────────┐
              │   flag_attr = TRUE    │  │   flag_attr = FALSE   │
              │   (attributed)        │  │   (not attributed)    │
              └──────────┬────────────┘  └────────┬──────────────┘
                         │                        │
            ┌────────────▼──────────┐  ┌──────────▼────────────┐
            │  เป็น order แรก?      │  │  เป็น order แรก?      │
            │  order_date ==        │  │  order_date ==        │
            │  first_attr_date      │  │  first_nonattr_date   │
            └──────┬────────┬───────┘  └──────┬────────┬───────┘
                  ใช่      ไม่ใช่            ใช่      ไม่ใช่
                   │          │               │          │
          ┌────────▼──┐  ┌────▼──────────┐ ┌─▼────────────┐ ┌──▼──────────────┐
          │first_order│  │  retention    │ │first_order   │ │retention_not_con│
          │           │  │               │ │_not_con      │ │                 │
          └───────────┘  └───────────────┘ └──────────────┘ └─────────────────┘
```

### นิยาม 4 ประเภท

| customer_type | ความหมาย | เงื่อนไข |
|---|---|---|
| `first_order` | ลูกค้าใหม่ที่ telesales สร้าง | mmid ถูก call + order อยู่ใน attr_days + เป็น order แรกที่ถูก attribute |
| `retention` | ลูกค้าเก่าที่ telesales ดูแลต่อเนื่อง | mmid ถูก call + order อยู่ใน attr_days + มี order ที่ถูก attribute ก่อนหน้าแล้ว |
| `first_order_not_con` | ลูกค้าใหม่ที่ซื้อเอง (เคยถูก call แต่ไม่ใช่ช่วง attr_days) | mmid ถูก call + order ไม่อยู่ใน attr_days + เป็น order แรก |
| `retention_not_con` | ลูกค้าเก่าที่ซื้อเองซ้ำ (เคยถูก call) | mmid ถูก call + order ไม่อยู่ใน attr_days + มี order ก่อนหน้าแล้ว |

### เงื่อนไข Attribution Window

```
order_date >= first_connected_date
AND
order_date <= first_connected_date + attr_days (default = 14 วัน)
```

- ใช้ `first_connected_date` จาก `telesales_calls` (วันที่โทรครั้งแรกที่รับสาย)
- ถ้า mmid มีหลาย call → เลือก call ที่ `first_connected_date` ใกล้ order มากที่สุด (DISTINCT ON + ORDER BY DESC)
- `attr_days` เป็น parameter ที่ผู้ใช้เลือกได้: 14 / 30 / 90 / custom

### first_order_date

- สำหรับ attributed rows: `first_order_date` = วันที่ของ order แรกที่ถูก attribute ของ mmid นั้น
- สำหรับ not-attributed rows: `first_order_date` = NULL (ไม่มีค่า)

### ข้อสังเกตสำคัญ

- **mmid ที่ไม่เคยถูก call เลย** → ไม่ถูก tag ใดๆ ทั้งนั้น (ไม่อยู่ใน mart)
- **order เดียวกัน** สามารถถูก attribute ได้แค่ call เดียว (DISTINCT ON)
- **flag_hoc_unilever** = TRUE เสมอสำหรับทุก row ใน mart (เพราะ JOIN กับ products ที่เป็น Unilever เท่านั้น)
- **customer_type** อิงจาก `first_attr_date` ของ mmid นั้น ไม่ใช่ของ order_number

---

## 12. Local Dev

```bash
npm install
npm run dev        # http://localhost:3000

# DEV: reset all data (CockroachDB + R2)
curl -X DELETE http://localhost:3000/api/system/reset
```

> **CockroachDB Connection:** `postgresql://USER:PASS@HOST:26257/defaultdb?sslmode=verify-full`
> **R2 Endpoint:** `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
