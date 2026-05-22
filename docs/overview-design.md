# Overview Dashboard — Design Blueprint

## วัตถุประสงค์หน้านี้
_[ ระบุว่าหน้านี้ใช้สำหรับอะไร / ใครเป็นผู้ใช้หลัก ]_

---

## Section 1 — Filters (แถบกรองข้อมูล)

ตำแหน่ง: ด้านบนสุดของหน้า  
ลักษณะ: Horizontal row ของ Select dropdowns

| Filter | ตัวเลือก | หมายเหตุ |
|--------|----------|----------|
| จากเดือน | รายการเดือนจากข้อมูล | |
| ถึงเดือน | รายการเดือนจากข้อมูล | |
| Lead Customers | ค่าจาก DB | _[ ระบุว่ามีกี่ tier / ชื่อ tier ]_ |
| Dynamic CMG | ค่าจาก DB | _[ ระบุว่ามีกี่ CMG ]_ |

---

## Section 2 — KPI Cards (การ์ดตัวเลขสรุป)

ตำแหน่ง: ถัดจาก Filters  
Layout: Grid 4 คอลัมน์ (responsive: 2 col mobile, 3 col tablet)

### การ์ดที่ต้องการ

| # | ชื่อการ์ด | ค่าที่แสดง (หลัก) | ค่าเสริม (sub) | เงื่อนไขสี |
|---|-----------|-------------------|----------------|------------|
| 1 | _[ ชื่อ ]_ | _[ field / สูตร ]_ | _[ field เสริม ]_ | _[ เขียว/เหลือง/แดง เมื่อไร ]_ |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |

---

## Section 3 — Charts หลัก

### Chart A — _[ ชื่อ chart ]_

- **Chart type:** _[ Bar / Line / ComposedChart (Bar+Line) / Area / Pie ]_
- **วัตถุประสงค์:** _[ อธิบายว่า chart นี้ตอบคำถามอะไร ]_
- **แกน X:** _[ field ที่ใช้ เช่น เดือน / สัปดาห์ / CMG ]_
- **แกน Y ซ้าย:** _[ field + unit ]_
- **แกน Y ขวา (ถ้ามี):** _[ field + unit ]_
- **Series:**
  - Series 1: _[ ชื่อ / field / สี ]_
  - Series 2: _[ ชื่อ / field / สี ]_
- **Tooltip แสดง:** _[ ระบุ field ที่อยากเห็นเมื่อ hover ]_
- **หมายเหตุ:** _[ เช่น ต้องการ reference line ที่ค่า X, highlight เดือนปัจจุบัน ฯลฯ ]_

---

### Chart B — _[ ชื่อ chart ]_

- **Chart type:** _[ ]_
- **วัตถุประสงค์:** _[ ]_
- **แกน X:** _[ ]_
- **แกน Y:** _[ ]_
- **Series:**
  - Series 1: _[ ]_
  - Series 2: _[ ]_
- **หมายเหตุ:** _[ ]_

---

### Chart C — _[ ชื่อ chart ]_

- **Chart type:** _[ ]_
- **วัตถุประสงค์:** _[ ]_
- **แกน X:** _[ ]_
- **แกน Y:** _[ ]_
- **Series:**
  - Series 1: _[ ]_
- **หมายเหตุ:** _[ ]_

---

## Section 4 — Detail Table (ตารางรายละเอียด)

- **วัตถุประสงค์:** _[ แสดงข้อมูลดิบสำหรับ drill-down / export ]_
- **คอลัมน์ที่ต้องการ:**

| คอลัมน์ | field | format |
|---------|-------|--------|
| _[ ชื่อ ]_ | _[ field ]_ | _[ text / number / ฿ / % / badge ]_ |
| | | |
| | | |

- **Sort default:** _[ เช่น เดือน ASC ]_
- **ฟีเจอร์เสริม:** _[ เช่น export CSV, pagination, row highlight ]_

---

## Layout Overview (ภาพรวม)

```
┌─────────────────────────────────────────────────┐
│  Filters: [เดือน จาก] [เดือน ถึง] [Lead] [CMG] │
├─────────────────────────────────────────────────┤
│  [KPI 1]  [KPI 2]  [KPI 3]  [KPI 4]            │
│  [KPI 5]  [KPI 6]                               │
├─────────────────────────────────────────────────┤
│  Chart A (full width)                           │
│  Sales vs Target รายเดือน                       │
├──────────────────────┬──────────────────────────┤
│  Chart B (half)      │  Chart C (half)           │
├─────────────────────────────────────────────────┤
│  Detail Table                                   │
└─────────────────────────────────────────────────┘
```

_[ แก้ Layout ได้ตามต้องการ — เพิ่ม/ลด row, เปลี่ยน proportion ]_

---

## ข้อมูลที่ใช้ (Data Source)

- **Primary table:** `mart_performance`
- **Endpoint:** `GET /api/data/overview`
- **Granularity:** per (month, lead_customers, dynamic_cmg)
- **Refresh:** ทุกครั้งที่กด Build Mart

### Fields ที่มีใน mart_performance

| Field | ประเภท | คำอธิบาย |
|-------|--------|----------|
| `month` | DATE | เดือน (วันที่ 1 ของเดือน) |
| `month_label` | TEXT | ชื่อเดือนภาษาอังกฤษ เช่น "May" |
| `lead_customers` | TEXT | ระดับ Tier ของ lead |
| `dynamic_cmg` | TEXT | กลุ่มสินค้า CMG |
| `hoc_sales` | NUMERIC | ยอดขาย HOC ที่เกิดจาก telesales |
| `actual_sales` | NUMERIC | ยอดขาย HOC รวม (ทุก channel) per CMG |
| `sales_target` | NUMERIC | เป้ายอดขาย per CMG |
| `achievement_ratio` | NUMERIC | actual_sales / sales_target (ทศนิยม เช่น 0.85) |
| `new_customers` | INT | ลูกค้าใหม่ที่ซื้อใน attribution window |
| `retention` | INT | ลูกค้าซื้อซ้ำ |
| `ordered` | INT | ลูกค้า HOC รวม (new + retention) |
| `hoc_orders` | INT | จำนวน order HOC |
| `total_calls` | INT | จำนวนการโทรทั้งหมด (per lead tier) |
| `reached` | INT | จำนวนที่รับสาย |
| `total_incentive` | NUMERIC | incentive รวม |
| `total_agent_cost` | NUMERIC | ค่าใช้จ่าย agent+supervisor (per month) |
| `total_expense` | NUMERIC | total_incentive + total_agent_cost |
| `roi` | NUMERIC | actual_sales / total_expense |

> **หมายเหตุ aggregation** (สำคัญ):
> - `hoc_sales`, `new_customers`, `retention`, `total_incentive` → sum ตรงๆ ✓
> - `actual_sales`, `sales_target` → dedup by (month, dynamic_cmg) ก่อน sum
> - `total_calls`, `reached` → dedup by (month, lead_customers) ก่อน sum
> - `total_agent_cost` → dedup by (month) ก่อน sum

---

## หน้าอื่นๆ ที่วางแผนไว้ (ยังไม่ได้ implement)

| หน้า | วัตถุประสงค์ |
|------|-------------|
| `/sales` | _[ ]_ |
| `/leads` | _[ ]_ |
| `/products` | _[ ]_ |
| `/telesales` | _[ ]_ |
| `/incentives` | _[ ]_ |
