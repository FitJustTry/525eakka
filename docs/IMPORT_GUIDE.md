# Import Guide — นำเข้าข้อมูล

---

## Master Plan (Excel — Coil Format)

**Tab:** Import → Master Plan

Accepts the same Excel format as the coil plan (แผนลงคอยล์).

**Fields collected:**
- วันที่ (plan_date), ลำดับ, ความสำคัญ, SAP SO, Item 5 (item_code)
- Comment, Plant, kVA, ระบบไฟฟ้า, ลูกค้า, Total kVA
- จำนวน, เข้าเทส, CableBox, Control
- กำหนดส่งสโตร์, DUE SO, แจ้งปรับแผน, Due Clamp, Due BOX/CTRL
- Raw Mat, LV, HV

**Saved to:** `accepted_orders` table (all 24 coil fields)

**Day filter chips:** click to filter preview to one day

---

## SAP Routing (CSV)

**Tab:** Import → SAP  
**Source file:** SAP_Routing.csv (44 columns)

**Core fields (dedicated columns):**
`order_no`, `material_code`, `wc_id`, `operation`, `std_hrs`, `is_confirmed`, `plant`

**All other 37 columns** → stored in `extra JSONB` field

**To load cutting rates from SAP:**
1. Go to 🏭 แผนก → ⏱ เวลาตัดโลหะตามขนาด
2. Select **EE3102 (277 ops)** 
3. Click **📥 ดูตัวอย่าง** → rates auto-apply

kVA decoded from `MaterialDescription` field (e.g. "เหล็กแกน **50KVA** 22000-416/240V")

---

## Timezone Fix

All date parsing uses `localISO(d)` instead of `.toISOString().slice(0,10)` to prevent UTC offset shifting dates by -1 day (Thailand = UTC+7).

Backend uses `types.setTypeParser(1082, val => val)` to return DATE columns as strings.

---

## Column Mapping Display

When loading Master Plan or SAP file, a collapsible panel shows:
- 🟢 Green = field collected
- 🟠 Orange ⭐ = critical field (Item Code, Material Code, WC, Std Hours)
- 🔵 Blue → extra = stored in JSONB but not as dedicated column
- Gray = not collected (old behavior was "not collected", now all SAP columns go to extra)
