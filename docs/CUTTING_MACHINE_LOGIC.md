# แผนการตัดโลหะ — Cutting Machine Plan Logic

> Last updated: 2026-06-02  
> File: `frontend-react/src/tabs/DeptTab/CuttingMachines.tsx`  
> Backend: `backend/server.js`

---

## Overview

Calculates which transformer gets cut on which machine, on which day.

**Inputs:**
- `accepted_orders` (DB) → filtered to current week by `plan_date`
- Machine config (kVA range, drill, hours, off_days)
- Global cutting rates (hours per kVA size from SAP EE3102)
- Selected OT policy + sort strategy

**Output:** `weekData` — per-day, per-machine schedule used by all 3 views

---

## 21 Scheduling Modes

**3 OT policies × 7 sort strategies = 21 modes**

```
❌ ไม่ OT:         📅 รายวัน | 🗓 รายสัปดาห์ | 🏎 เร็วสุด | 📅 วันส่งก่อน | ⭐ ความสำคัญ | 🔮 สัปดาห์หน้า | 🔗 Batch kVA
⚠️ OT เมื่อจำเป็น: same 7
🔥 OT เสมอ:        same 7
```

All modes use one unified function: `scheduleMode(approach, otPolicy, sortStrategy)` or `scheduleFastest(otPolicy)`

---

## 3 OT Policies

### ❌ ไม่ OT
`effectiveOtCap = 0` always. Work carries to next day naturally. Never uses overtime.

### ⚠️ OT เมื่อจำเป็น
OT added only when **current carry-over work won't fit in remaining regular days**:
```
carryHrs = hours remaining on current in-progress order (not yet done)
regDaysLeft = working days remaining × regCap per day

if carryHrs > regDaysLeft capacity:
  OT today = min(otCap, carryHrs - regDaysLeft)
else:
  OT = 0 (carry to next day in regular hours)
```
Result: machines fill regular hours EVERY day first. OT only in last few days when genuinely necessary.

### 🔥 OT เสมอ
`effectiveOtCap = otCap` always. Machine works reg + max OT every single day.

---

## 7 Sort Strategies

All strategies except `📅 รายวัน` use a **Shared Pool** — one list of orders that ALL machines draw from.

### 📅 รายวัน (Daily)
- Orders processed strictly on their `plan_date`
- Carry-over from yesterday + today's scheduled orders
- Respects original plan_date schedule

### 🗓 รายสัปดาห์ (Weekly shared pool)
- **Ignores plan_date** — all orders in one shared pool sorted by plan_date then LPT
- Machines pull orders one at a time; when done → immediately grab next eligible
- One SAP SO order stays together (all 5 units cut by same machine)
- Machine 5 can grab 160kVA order the moment it finishes, even if another machine "had" it

### 🏎 เร็วสุด (Fastest — individual units)
- **Ignores plan_date AND order grouping**
- Expands every order into individual transformer units (`300kVA × 5` → 5 separate jobs)
- Any machine can take any unit — `300kVA × 5` can be split: Machine3 cuts 2, Machine5 cuts 3
- Pool sorted by processing time DESC (LPT = largest first minimises makespan)
- Goal: **absolute minimum completion time**

### 📅 วันส่งก่อน (Deadline-first)
- Sort pool by `due_so` or `deadline` ASC (closest deadline first)
- Within same deadline → LPT
- Goal: prevent late deliveries even at cost of efficiency

### ⭐ ความสำคัญก่อน (Priority-first)
- Sort pool: `หลัก` (rank 1) → `Fast` (rank 2) → `เสริม` (rank 3) → other (rank 4)
- Within same priority → LPT
- **Current: week-first** — ALL หลัก for entire week before any เสริม
- Alternative (day-first): sort by plan_date first, then priority within each day

### 🔮 สัปดาห์หน้า (Inter-week)
- Looks at next week's order sizes
- If next week is **heavy** (many large orders) → finish small orders this week first (free up capacity)
- If next week is **light** → finish large orders this week first
- Adaptive planning across weeks

### 🔗 Batch kVA
- Groups orders by kVA size bucket: 50, 100, 160, 250, 300, 630, 1000, 2000, 3500, 7000+
- Processes all of one size before moving to next
- Within same bucket → LPT
- Goal: minimize setup time between different transformer sizes

---

## Key Rule: One Order at a Time (except 🏎)

All modes except 🏎 เร็วสุด:
- Machine commits to current order until 100% done
- Never starts new order mid-day while current is unfinished

```
Order A needs 21h, machine 8h/day:
  Mon: 8h worked → 13h remaining → carries over
  Tue: 8h worked → 5h remaining → carries over
  Wed: 5h worked → DONE ✓ → starts Order B with 3h remaining
```

🏎 เร็วสุด is different: each individual transformer unit is independent (1.63h each), so machine works on one unit, finishes, immediately picks next unit.

---

## Shared Pool — Why It Matters

**Old (wrong static assignment):**
```
Pre-assign at start of week:
  Machine5 gets 20 orders → finishes Thursday → sits idle Fri-Sat
  Machine2 has 160kVA orders it hasn't started → busy all week
Result: Machine5 idle, Machine2 overloaded
```

**New (shared pool):**
```
All orders in one pool
Day-by-day: all machines draw simultaneously
  Machine5 finishes order → immediately pulls next 160kVA from pool
  → Machine5 stays busy until pool is empty
Result: zero idle time, all machines used optimally
```

---

## Capacity-Proportional Assignment

For weekly modes, assignment respects each machine's actual capacity:

```
Machine1 (Mon-Tue only): 2 days × 8h = 16h capacity
Machine2 (Mon-Sat):      6 days × 8h = 48h capacity

Score = load / capacity (not just raw load)
Machine1 at 10h → score = 10/16 = 62.5% (almost full)
Machine2 at 10h → score = 10/48 = 20.8% (mostly empty)
→ Machine2 gets next orders
```

This prevents over-assigning to machines with few working days (off_days).

---

## Carry-Over Between Weeks

Unfinished orders at end of Saturday stay in queue.

**Toggle: `↩ รวมงานค้างสัปดาห์ก่อน`**
1. Runs same scheduling simulation on previous week
2. Finds orders NOT completed (still in queue at end of Saturday)
3. Adds to front of current week's pool/queue
4. Summary shows: `+X ตัว ยกมาจากสัปดาห์ก่อน`

---

## Machine Configuration

| Field | Effect on scheduling |
|-------|---------------------|
| `min_kva`, `max_kva` | Hard filter — machine won't take orders outside range |
| `max_kva ≥ 9999` | ไม่จำกัด — no upper limit |
| `drill_8mm` | Soft preference for Oil transformers (type 1/2/3) |
| `drill_22mm` | Soft preference for Cast Resin (type 4) |
| `reg_hrs` | Regular hours/day (or from `wc_id`) |
| `ot_hrs` | Max OT hours/day |
| `wc_id` | Links to WC Config → uses its hrs/ot/sat_hrs/sat_ot |
| `off_days` | Days machine is OFF — gets 0 capacity, shown 🔴 ปิด |
| `laser`, `m4` | Stored but NOT currently used in scheduling |

---

## Drill Preference Logic

Soft tiebreaker only — never blocks assignment, just prefers:

```typescript
drillPrefers(machine, order):
  typeCode = decodeItemInfo(order.item_code)[1]  // position 1 of item code
  if typeCode === '4'        → prefers machine.drill_22mm (Cast Resin)
  if typeCode in [1, 2, 3]  → prefers machine.drill_8mm  (Oil)
  else                      → no preference
```

DRILL_BONUS = 0.0001h — tiebreaker only. Load balance overrides drill preference.

---

## Global Cutting Rates

Table: `cutting_rates` (DB)  
Source: SAP Routing WC EE3102 via `/api/sap-routing/rates-by-kva?wc_id=EE3102`

- kVA decoded from `extra.MaterialDescription` (e.g. "เหล็กแกน **50KVA** 22000-416/240V")
- Groups by kVA, averages `std_hrs` across all operations
- **Exact match only** — if order kVA not in table → uses `m.hrs_per_unit` fallback

**⚠️ If rates not loaded → 5.333h fallback → all orders take too long → OT kicks in unnecessarily.**  
Always load EE3102 rates first!

---

## Data Flow

```
accepted_orders (DB)
    ↓ filter by week (plan_date Mon–Sat)
weekOrders + prevCarryOrders (if toggle on)
    ↓
dailyAssignments (useMemo)
    Per day: assignOrders(activeMachines, dayOrders)
    • activeMachines = machines WHERE day NOT in off_days
    • Uses LPT greedy + drill preference tiebreaker
    ↓
weekSchedule (useMemo) ← selected by balanceMode
    scheduleMode(approach, otPolicy, sortStrategy)  ← 18 modes
    scheduleFastest(otPolicy)                       ←  3 modes
    ↓
weekData (useMemo) ← SINGLE SOURCE OF TRUTH
    • mTotals: weekly totals (deduped by order ID — no double-counting)
    • dayRows: per-day × per-machine pre-computed data
    ↓
All 3 views read IDENTICAL data from weekData.dayRows.machineCells
    📋 รายวัน  → machineCells
    📊 ตาราง   → machineCells (identical, never recalculates)
    🔄 Pipeline → weekSchedule.work[] segments
```

---

## Save Plan Feature

**💾 บันทึกแผน** saves to `cutting_plan_snapshots` (DB):
- Machine configs at save time (all 11 fields)
- Global cutting rates used
- Balance mode + sort strategy
- Full schedule output (dayRows)

**📋 ดูแผนที่บันทึก** → click **ดู** → full panel showing:
- All machine parameters in a table
- Cutting rates used
- Day-by-day schedule output

---

## Common Issues & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| All machines use OT every day | SAP rates not loaded → 5.333h fallback | Load EE3102 rates in ⏱ section |
| Machine 5 idle while others work | Old: pre-assigned static queues | Fixed: shared pool, machines pull dynamically |
| OT added too early (Mon-Wed) | Smart OT estimated future queue size | Fixed: only adds OT for current carry-over hours |
| Machine shows "50–0kVA" | max_kva=0, less than min_kva | Fix kVA สูงสุด in config table |
| Dates shift by 1 day | `.toISOString()` → UTC timezone shift | Fixed: `localISO(d)` + `types.setTypeParser(1082)` |
| Card and table show different data | Table used raw `asgn`, card used `weekSchedule` | Fixed: both use `weekData.dayRows.machineCells` |
| Order counted multiple times in total | Carry-over order counted per day | Fixed: `Set<orderId>` deduplication in mTotals |

---

## Files Changed

| File | Key changes |
|------|-------------|
| `DeptTab/CuttingMachines.tsx` | All 21 modes, shared pool, smart OT, off_days, save/load plans |
| `DeptTab/CoilMachines.tsx` | New: coil winding machine config |
| `DeptTab/index.tsx` | 🌀 เครื่องพันคอยล์ button for แผนกพันคอยล์ |
| `PlanTab/index.tsx` | Daily kVA summary table, week grouping with subtotals |
| `ImportTab/index.tsx` | Fixed timezone in `localISO()` |
| `types.ts` | Added off_days, wc_id, reg_hrs, ot_hrs, CuttingRate to CuttingMachine |
| `backend/server.js` | cutting_rates, cutting_plan_snapshots, coil_machines tables + endpoints; DATE timezone fix |

---

## Pending / Known Issues

- `laser` and `m4` fields stored but not used in scheduling → should map to transformer types
- ⭐ ความสำคัญ mode is "week-first" — may need "day-first" variant
- 🔮 สัปดาห์หน้า logic is heuristic (50% threshold) — could be tuned
- Pipeline view (🔄) shows correctly but could be improved with time axis scale
