# Unilever Telesales Dashboard — Project Plan

> อัปเดตล่าสุด: 2026-05-21
> สถานะ: Upload pipeline ✅ · Auth (Clerk) ✅ · Deploy (Vercel) ✅ · **Dashboard pages — rebuild ❌**

---

## 1. Overview

Dashboard สำหรับติดตาม KPI Telesales Unilever บน Makro Pro

**Users:** Sales Manager, ผู้บริหาร/GM, Telesales Agent, Data/Ops Team

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Charts | @nivo/bar, @nivo/line, @nivo/pie + Recharts |
| Auth | Clerk (magic link) |
| Database | CockroachDB Serverless (10 GB free) |
| File Storage | Cloudflare R2 (S3-compatible, AES-256-GCM encrypted) |
| DB Client | `pg` (node-postgres) Pool |
| Deployment | Vercel |

---

## 3. Architecture

```
CSV / Google Sheet
      │
      ▼
[Storage] Cloudflare R2 (AES-256-GCM encrypted)
      │
      ▼ ETL via upload-service.ts
[DB] CockroachDB
      │
      ▼ API routes
[UI] Next.js dashboard pages
```

---

## 4. API Routes (Current)

```
api/
├── data/
│   ├── dashboard                          GET  — table summaries + upload history
│   └── upload/
│       ├── multipart/init                 POST — start R2 multipart upload
│       ├── multipart/complete             POST — finalize + ETL → DB
│       ├── multipart/abort                POST — cancel failed upload
│       ├── ingest/telesales-activity      POST — Google Apps Script sync
│       ├── ingest/threshold               GET  — threshold check for Apps Script
│       └── replay                         POST — re-process R2 backups → DB
└── webhooks/clerk                         POST — sync Clerk user roles
```

---

## 5. Database Tables

| Table | หมายเหตุ |
|---|---|
| `online_sales` | UNIQUE(order_number, prod_num) |
| `offline_sales` | UNIQUE(order_number, prod_num), sales_in_vat = Sales_Ex_VAT × 1.07 |
| `leads` | PK: mmid |
| `products` | PK: prod_num |
| `telesales_calls` | PK: mmid (latest call per customer) |
| `targets` | PK(month, dynamic_cmg) |
| `costs` | PK: month |
| `incentives` | PK: tier |
| `upload_batches` | audit log ทุก upload |

---

## 6. Upload Config

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

---

## 7. Current Status

### เสร็จแล้ว ✅

- [x] CockroachDB setup + all silver tables
- [x] Cloudflare R2 storage (AES-256-GCM encrypted)
- [x] Upload pipeline: multipart R2 → ETL → CockroachDB
- [x] Google Apps Script sync (telesales-activity + threshold)
- [x] Replay ETL from R2 backups
- [x] Clerk auth (ClerkProvider, middleware, role-based access)
- [x] Deploy on Vercel
- [x] Data Hub UI (upload, status, history, recovery tabs)

### ต้องทำ ❌

#### Dashboard Pages — Rebuild
หน้าทั้งหมดยังไม่มี API — ต้องสร้าง analytics endpoints ใหม่

| หน้า | API ที่ต้องสร้าง | KPI หลัก |
|---|---|---|
| `/overview` | `GET /api/analytics/overview` | Total sales, calls, new customers, target % |
| `/sales` | `GET /api/analytics/sales` | Online/Offline breakdown, trend, forecast |
| `/telesales` | `GET /api/analytics/telesales` | Sankey funnel, agent performance, conversion rate |
| `/products` | `GET /api/analytics/products` | Top SKUs, brand breakdown |
| `/leads` | `GET /api/analytics/leads` | Workqueue, retry queue, agent assignment |
| `/incentives` | `GET /api/analytics/incentives` | Incentive tiers, achievement |

---

## 8. Environment Variables

```env
DATABASE_URL=postgresql://...@...cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/overview
INGEST_API_SECRET=...
STORAGE_ENCRYPTION_KEY=<64-char hex>
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=dashboard-unilever
```

---

## 9. Local Dev

```bash
npm install
npm run dev   # http://localhost:3000
```
