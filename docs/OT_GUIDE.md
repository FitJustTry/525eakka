# OT (Overtime) — วิธีตั้งค่าและทำงาน

## 1. ตั้งค่า OT ชั่วโมงต่อเครื่อง

ไปที่ **Settings → เครื่องตัดโลหะ** แล้วแก้ไขแต่ละเครื่อง:

| ฟิลด์ | ความหมาย | ค่า default |
|-------|----------|-------------|
| `reg_hrs` | ชั่วโมงปกติต่อวัน (Regular) | `8` ชั่วโมง |
| `ot_hrs` | ชั่วโมง OT สูงสุดต่อวัน | `4` ชั่วโมง |

> **วันเสาร์:** ระบบหาร 2 โดยอัตโนมัติ → reg = 4h, ot = 2h
>
> **ถ้าใช้ WC Config** (`wc_id` เชื่อมกับ SAP Work Center):
> ระบบดึง `reg_hrs / ot_hrs / sat_hrs / sat_ot` จาก wcConfig แทน

---

## 2. เลือก OT Policy ในหน้าแผน

แถบด้านบนของตาราง **แผนการตัดโลหะ** มีปุ่ม **OT:**

| ปุ่ม | ค่า | พฤติกรรม |
|------|-----|----------|
| ❌ ไม่ OT | `no_ot` | ใช้ได้แค่ `reg_hrs` เท่านั้น งานเกินจะยกไปวันถัดไป |
| ⚠️ เมื่อจำเป็น | `smart` | เพิ่ม OT เฉพาะเมื่อ workload รวมสัปดาห์เกิน reg capacity |
| 🔥 OT เสมอ | `full` | ใช้ `reg_hrs + ot_hrs` ทุกวัน เต็มเพดานเสมอ |

> OT policy รวมกับ **แผน** (รายวัน / รายสัปดาห์ / เร็วสุด ฯลฯ)
> เช่น เลือก **แผน: รายวัน + OT: เมื่อจำเป็น** = `daily_smart`

---

## 3. Smart OT ทำงานอย่างไร (`smart`)

```
totalEstimate = งานที่เครื่องนี้ถือ (คงเหลือวันนี้)
              + งาน owned pending (สั่งซื้อเฉพาะเครื่องนี้)
              + ส่วนแบ่งงาน unclaimed (เฉลี่ยตามจำนวนเครื่อง)

regLeft = reg capacity คงเหลือในสัปดาห์นี้

ถ้า totalEstimate > regLeft:
    effectiveOtCap = min(ot_hrs, totalEstimate - regLeft)
ไม่งั้น:
    effectiveOtCap = 0  ← ไม่ใช้ OT วันนี้
```

- วันเสาร์: บังคับ `otCap = 0` ไม่มี OT วันเสาร์
- แสดง `+OT x.xh` สีส้มบนการ์ดเมื่อมีการใช้ OT

---

## 4. อ่านสถานะ OT บนหน้าจอ

### Card view (📋 รายวัน)
```
เครื่องตัด4         10.2h / 8h  +OT 2.2h  → พรุ่งนี้
```
- `10.2h / 8h` = ใช้ไป 10.2h จาก reg 8h
- `+OT 2.2h`   = ใช้ OT 2.2 ชั่วโมง
- `→ พรุ่งนี้`  = งานยังไม่หมด ยกไปวันถัดไป

### Table view (📊 ตาราง)
แต่ละ cell แสดง:
```
↩ ต่อ   10.2h / 8h   +OT 2.2h   → พรุ่งนี้
```
- `↩ ต่อ` = มีงานยกมาจากเมื่อวาน

### Summary bar
```
⚠ OT สูงสุด 2.2h/วัน
```
หรือถ้าไม่มี OT:
```
✓ เสร็จในเวลาปกติทุกวัน
```

---

## 5. ข้อมูลใน Database

ตาราง `cutting_machines`:

```sql
reg_hrs  NUMERIC  DEFAULT 8   -- Regular hours/day
ot_hrs   NUMERIC  DEFAULT 4   -- Max OT hours/day
```

API endpoint:
- `GET  /api/cutting-machines` — ดึงรายการเครื่องพร้อม reg/ot hrs
- `POST /api/cutting-machines` — สร้างเครื่องใหม่
- `PUT  /api/cutting-machines/:id` — แก้ไข (รวม reg_hrs, ot_hrs)

---

## 6. สรุป Flow

```
ตั้งค่า reg_hrs / ot_hrs ต่อเครื่อง (Settings)
          ↓
เลือก OT Policy บนหน้าแผน (❌ / ⚠️ / 🔥)
          ↓
resolveHours(m, wcConfig, isSat)
  → คืน { reg, ot } ตาม config + วัน
          ↓
scheduler ใช้ reg + effectiveOtCap ตาม policy
          ↓
otHrs บันทึกใน MachineDaySched → แสดงผลบนการ์ด/ตาราง
```
