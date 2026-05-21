# Dashboard Unilever — Page Brief

## สรุป User Journey

```
Admin อัพโหลดข้อมูล (Data Hub)
    ↓
Manager ดูภาพรวม (Overview) → พบปัญหา
    ↓
Drill-down ที่ Sales หรือ Telesales → หา root cause
    ↓
Agent รับ task ที่ Leads → โทรต่อ
    ↓
Product/Incentive → ช่วย prioritize ว่าขายอะไรก่อน
```

---

## 1. Overview `/overview`

| | |
|---|---|
| **จุดประสงค์** | ภาพรวม KPI ทั้งหมดในสัปดาห์/เดือนนี้ ดูได้ในครั้งเดียว |
| **เพื่อใคร** | ผู้จัดการ / Supervisor ที่ต้องการ morning check |
| **ดูปัญหาอะไร** | Sales ถึง target ไหม, ลูกค้าใหม่มาไหม, call volume ปกติไหม |
| **Reason มาจากไหน** | ไม่มี drill-down — เป็น lagging indicator ดูภาพรวม |
| **ควร Action อะไร** | ถ้าตัวเลขผิดปกติ → ไปเปิด Sales หรือ Telesales ต่อเพื่อหา root cause |

---

## 2. Sales `/sales`

| | |
|---|---|
| **จุดประสงค์** | วิเคราะห์ยอดขาย Online/Offline เทียบ target + คาดการณ์สิ้นเดือน |
| **เพื่อใคร** | Sales Manager, Account Manager |
| **ดูปัญหาอะไร** | ยอดขายจะถึง target ไหม, Online vs Offline แตกต่างกันอย่างไร |
| **Reason มาจากไหน** | Forecast ใช้ MTD ÷ วันที่ผ่านไป × วันทั้งหมด → บอกว่าถ้าไม่เร่งจะพลาด |
| **ควร Action อะไร** | ถ้า Forecast ต่ำกว่า target → เร่ง agent, เพิ่ม campaign |

---

## 3. Telesales `/telesales`

| | |
|---|---|
| **จุดประสงค์** | ติดตาม call center performance และ funnel การโทร |
| **เพื่อใคร** | Telesales Supervisor, Team Lead |
| **ดูปัญหาอะไร** | โทรแล้ว reach กี่ % , conversion rate ของแต่ละ agent เป็นอย่างไร |
| **Reason มาจากไหน** | Sankey funnel บอก drop-off แต่ละ stage: Lead → Called → Reached → Ordered |
| **ควร Action อะไร** | Agent conversion ต่ำ → coach, Reach rate ต่ำ → ดู call status (busy/no answer) |

---

## 4. Leads `/leads`

| | |
|---|---|
| **จุดประสงค์** | Workqueue สำหรับ agent — ดูว่าต้องโทรใครต่อ |
| **เพื่อใคร** | Telesales Agent (ระดับ individual) |
| **ดูปัญหาอะไร** | Lead ไหน retry ยังไม่ได้โทร, lead ไหนยังไม่มี outcome |
| **Reason มาจากไหน** | แยก tab: All / Retry / Reached / Invalid — agent เปิดมาเห็น action item ทันที |
| **ควร Action อะไร** | กด filter "Retry Needed" → โทรต่อทีละราย |

---

## 5. Products `/products`

| | |
|---|---|
| **จุดประสงค์** | วิเคราะห์ revenue ระดับ SKU และ brand |
| **เพื่อใคร** | Product Manager, Category Manager |
| **ดูปัญหาอะไร** | SKU ไหนขายดี/ไม่ดี, Unilever HOC มีสัดส่วนเท่าไร |
| **Reason มาจากไหน** | Filter brand + HOC checkbox ช่วยเจาะดูเฉพาะกลุ่มสินค้าที่ต้องการ |
| **ควร Action อะไร** | SKU ไหน revenue ต่ำผิดปกติ → ตรวจ stock / ปรับ incentive |

---

## 6. Incentives `/incentives`

| | |
|---|---|
| **จุดประสงค์** | แสดง incentive program ที่ active อยู่ให้ team รู้ |
| **เพื่อใคร** | Agent, Supervisor ที่ต้องการรู้ว่า product ไหนมี bonus |
| **ดูปัญหาอะไร** | Incentive ไหน active, เงื่อนไขคืออะไร |
| **Reason มาจากไหน** | ข้อมูลมาจากไฟล์ที่ admin upload ผ่าน Data Hub |
| **ควร Action อะไร** | ถ้าข้อมูลหมดอายุ → admin ไป upload ใหม่ที่ Data Hub |

---

## 7. Data Hub `/data-hub`

| | |
|---|---|
| **จุดประสงค์** | อัพโหลด CSV เข้าระบบ + ตรวจสอบสถานะข้อมูล + recovery |
| **เพื่อใคร** | Admin เท่านั้น (มี role guard redirect) |
| **ดูปัญหาอะไร** | ข้อมูลล่าสุดอัพโหลดเมื่อไหร่, มีแถวกี่แถว, มี error ไหม |
| **Reason มาจากไหน** | Dashboard ทุกหน้าพึ่งข้อมูล CSV — ถ้าไม่อัพโหลดทุกหน้าจะว่างเปล่า |
| **ควร Action อะไร** | Upload → ดู History tab ว่า pass/fail, ถ้า fail → Recovery tab เพื่อ replay |
