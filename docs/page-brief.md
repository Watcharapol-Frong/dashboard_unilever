# Dashboard Unilever — Page Brief

## User Journey

```
Admin อัพโหลดข้อมูล (Data Hub)
    ↓
Manager ดูภาพรวม (Overview) → พบปัญหา
    ↓
Drill-down ที่ Sales หรือ Telesales → หา root cause
    ↓
Agent รับ task ที่ Leads → โทรต่อ
    ↓
Products / Incentives → ช่วย prioritize ว่าขายอะไรก่อน ได้ incentive อะไรบ้าง
```

---

## 1. Overview `/overview`

| | |
|---|---|
| **จุดประสงค์** | ภาพรวม KPI ทั้งหมดในสัปดาห์/เดือนนี้ ดูได้ในครั้งเดียว |
| **เพื่อใคร** | ผู้จัดการ / Supervisor ที่ต้องการ morning check |
| **ดูปัญหาอะไร** | Sales ถึง target ไหม, ลูกค้าใหม่มาไหม, call volume ปกติไหม |
| **Auth** | ทุกคนที่ login แล้ว |
| **Filter** | เดือน (from/to), Lead Tier, CMG — กระทบทั้ง KPI และ chart |
| **ควร Action อะไร** | ถ้าตัวเลขผิดปกติ → ไปเปิด Sales หรือ Telesales ต่อเพื่อหา root cause |

**KPI Cards:** HOC Sales, Achievement %, New Customers, Retention, Total Calls, ROI

**Charts:** HOC Sales vs Target (ComposedChart), New vs Retention by month (Stacked Bar), ROI Trend (Line)

---

## 2. Sales `/sales`

| | |
|---|---|
| **จุดประสงค์** | วิเคราะห์ยอดขาย Online/Offline เทียบ target + ดู trend ตาม period |
| **เพื่อใคร** | Sales Manager, Account Manager |
| **ดูปัญหาอะไร** | ยอดขายช่วงนี้เป็นอย่างไร, New vs Retention สัดส่วนเท่าไร |
| **Auth** | ทุกคนที่ login แล้ว |
| **Filter** | Date range (month chips / DateRangePicker), Channel, CMG, Agent, Conversion type — กระทบทั้ง KPI และ chart |
| **ควร Action อะไร** | ถ้า Avg Order Value ตก → ดู product mix ที่ Products, ถ้า conversion ต่ำ → ดู Telesales |

**KPI Cards (4):** Total Sales, Avg Order Value, New Customers, Retention — ทุก card มี delta % เทียบ prior period

**Charts:** Sales Trend (AreaChart — Online + Offline stacked, interval: daily/weekly/monthly), Channel Distribution (Stacked Bar)

---

## 3. Telesales `/telesales`

| | |
|---|---|
| **จุดประสงค์** | ติดตาม call center performance และ funnel การโทร |
| **เพื่อใคร** | Telesales Supervisor, Team Lead |
| **ดูปัญหาอะไร** | โทรแล้ว reach กี่ %, conversion rate ของแต่ละ agent เป็นอย่างไร |
| **Auth** | ทุกคนที่ login แล้ว |
| **Filter** | Date range, Channel, CMG, Agent — กระทบทั้ง KPI และ chart |
| **ควร Action อะไร** | Agent conversion ต่ำ → coach, Reach rate ต่ำ → ดู call status breakdown |

**KPI Cards (4):** Total Leads, Connected Rate (color-coded), Conversion Rate (color-coded), Orders (New + Repeat)

**Charts:** Daily Calling Trend (AreaChart), Call Status by Tier (Horizontal Stacked Bar), Conversion Funnel (custom waterfall)

**Table:** Agent Leaderboard — Total Calls, Reached, Not Reached, Reach Rate, Conversion Rate, Calls/Day

---

## 4. Leads `/leads`

| | |
|---|---|
| **จุดประสงค์** | รายชื่อ lead ทั้งหมดพร้อม contact status และ conversion outcome |
| **เพื่อใคร** | Telesales Admin / Supervisor |
| **ดูปัญหาอะไร** | Lead ไหนยังไม่ได้โทร, lead ไหน converted แล้ว, agent คนไหน handle lead นี้ |
| **Auth** | Admin เท่านั้น |
| **Filter** | Tier, Contact status, Conversion status, CMG, Agent, Search — กระทบ**เฉพาะ table** (KPI cards คงที่ global เสมอ) |
| **ควร Action อะไร** | Filter "Not Called" → ส่ง list ให้ agent โทร |

**KPI Cards (4):** Total Leads, Contacted (reached + not reached รวม), Conversion (unique MMID ที่ converted), Orders (จาก converted MMID เท่านั้น)

**Table:** MMID, Customer Name, Tier, CMG, Agent, Contact Badge, Conversion Badge, HOC Orders, HOC Sales

**Pagination:** Server-side, 500 rows/page

---

## 5. Products `/products`

| | |
|---|---|
| **จุดประสงค์** | วิเคราะห์ revenue ระดับ SKU และ brand |
| **เพื่อใคร** | Product Manager, Category Manager |
| **ดูปัญหาอะไร** | SKU ไหนขายดี/ไม่ดี, brand ไหน drive new customers vs retention |
| **Auth** | ทุกคนที่ login แล้ว |
| **Filter** | Date range, Brand, Class, Subclass, Senior Buyer, Buyer — กระทบ KPI + chart + table ทั้งหมด |
| **ควร Action อะไร** | SKU revenue ต่ำผิดปกติ → ตรวจ stock / ปรับ incentive |

**KPI Cards (4):** Total Revenue, Avg Order Value, Total Qty Sold, Active SKUs

**Charts:** Revenue Trend by Brand (Line — Top 5 + Other)

**Tables (Tabs):** Top SKUs, New vs Retention (segment classification), By Brand (channel mix)

---

## 6. Incentives `/incentives`

| | |
|---|---|
| **จุดประสงค์** | สรุปการจ่าย incentive และ ROI ของ program |
| **เพื่อใคร** | Finance, Program Manager |
| **ดูปัญหาอะไร** | Incentive จ่ายไปเท่าไร, ROI คุ้มค่าไหม, tier ไหน trigger |
| **Auth** | ทุกคนที่ login แล้ว |
| **Filter** | ไม่มี — แสดงทุกเดือนที่มีข้อมูล |
| **ควร Action อะไร** | ROI ต่ำ → ปรับ tier structure หรือเพิ่ม campaign pressure |

**KPI Cards (2):** Total Incentives Paid, Overall Program ROI

**Charts:** Monthly Incentives vs ROI (ComposedChart — Bar + Line)

**Tables (Tabs):** Monthly Incentive Summary, Incentive Tier Configuration (read-only)

---

## 7. Data Hub `/data-hub`

| | |
|---|---|
| **จุดประสงค์** | อัพโหลด CSV เข้าระบบ + ตรวจสอบสถานะข้อมูล + Build Mart |
| **เพื่อใคร** | Admin เท่านั้น (redirect ถ้าไม่ใช่ admin) |
| **ดูปัญหาอะไร** | ข้อมูลล่าสุดอัพโหลดเมื่อไหร่, มีแถวกี่แถว, upload มี error ไหม |
| **Auth** | Admin เท่านั้น |
| **ควร Action อะไร** | Upload → ดู History tab ว่า pass/fail → ถ้าผ่านแล้ว → Build Mart |

**File types ที่ upload ได้:** Online Sales, Offline Sales, Leads, Products, Telesales, Targets, Costs, Incentives, Agent Headcount

**Tabs:** Overview (status cards), Data Status (8 source table summary), History (upload log), Build Mart (attribution window + build trigger)

---

## 8. Exports `/exports`

| | |
|---|---|
| **จุดประสงค์** | Export ข้อมูลเป็น CSV หรือ Excel พร้อม custom column/pivot |
| **เพื่อใคร** | Admin ที่ต้องการนำข้อมูลไปวิเคราะห์นอกระบบ |
| **Auth** | Admin เท่านั้น (redirect ถ้าไม่ใช่ admin) |
| **ควร Action อะไร** | เลือก granularity + filter + columns → Preview → Download |

**Granularity:** Month / Week / Day / Order Line

**Format:** CSV (max 500k rows), XLSX (max 100k raw / 500k aggregated)
