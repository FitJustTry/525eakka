# แผนการตัดโลหะ — Cutting Machine Plan Logic

> Last updated: 2026-06-08  
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

### ⚠️ OT เมื่อจำเป็น (Smart OT)

OT is added only when estimated remaining work exceeds remaining regular capacity.  
The estimate runs in **two stages** — upfront (at day start) + dynamic (inside the day loop).

#### Stage 1 — Upfront estimate (at day start)

```
regLeft = Σ reg_hrs for all working days remaining this week (including today)

totalEstimate = currentHrs + ownedPendingHrs + unclaimedShare

  currentHrs       = st.rem (hours left on in-progress unit, if any)
  ownedPendingHrs  = Σ hrs of pool units where orderMachine[orderId] === this machine
                     (units already reserved for this machine via stickyOrders)
  unclaimedShare   = Σ (hrs / eligibleCount) for each unclaimed eligible pool unit
                     eligibleCount = # machines that can cut this order AND are ON today
                     → orders only 1 machine can cut count in full
                     → orders shared across N machines count as 1/N

if totalEstimate > regLeft:
  effectiveOtCap = min(otCap, totalEstimate − regLeft)
else:
  effectiveOtCap = 0
```

**Why include unclaimedShare?** ⚠️ เมื่อจำเป็น fires when the machine's *weekly load* exceeds *weekly regular capacity* — not just today's carry-over. Without `unclaimedShare`, the machine only sees one order at a time (ownedFirst rule), which almost always fits in remaining time → OT never fires → equivalent to ❌. The `unclaimedShare` term approximates total realistic weekly load. Stage 2 then refines this in real-time as units are claimed.

**Why per-unit division?** Prevents every machine over-counting the same shared pool. An order eligible for 4 machines contributes 1/4 of its hours to each machine's estimate. An order only Machine 4 can cut contributes its full hours to Machine 4's estimate.

#### Stage 2 — Dynamic extension (after each unit is claimed)

Each time the machine picks a new unit from the pool:

```
nowOwned = st.rem (just-picked unit hrs) + ownedPendingHrs (all other owned units)

if nowOwned > regLeft AND effectiveOtCap < otCap:
  needed = min(otCap, max(st.rem, nowOwned − regLeft))
  if needed > effectiveOtCap:
    avail  += needed − effectiveOtCap   ← extend working time NOW
    effectiveOtCap = needed
```

`Math.max(st.rem, …)` ensures OT extension is at least one unit's size — this prevents a unit-boundary carry-over where the estimate says "1.6h OT needed" but the last unit is 3.52h, causing a 0.2h spill to the next day.

**Example — Machine 2, Friday:**
- Batch 1 of 2110000076: 0.2h remaining → finishes in 10 min
- Batch 2 of 2110000076: 17.6h, NOT yet claimed at day start → unclaimedShare = 17.6h/4 = 4.4h  
- Stage 1: totalEstimate = 0.2 + 0 + 4.4 = 4.6h < regLeft (16h) → OT = 0
- Machine 2 picks first unit of batch 2 → **Stage 2 fires**:
  - nowOwned = 3.52 + 14.08 = 17.6h > regLeft (16h)
  - needed = min(4, max(3.52, 1.6)) = **3.52h**
  - avail += 3.52h → Machine 2 now has 3.52h OT on Friday
- Result: Machine 2 finishes batch 2 on Saturday ✓

#### Saturday OT — REQUIRES WC CONFIG

For machines with a `wc_id`, Saturday OT comes from `WCConfig.sat_ot`:

```
resolveHours(machine, isSat=true):
  if machine.wc_id:
    return { reg: wc.sat_hrs ?? 0, ot: wc.sat_ot ?? 0 }  ← 0 if not set!
  else:
    return { reg: reg_hrs/2, ot: ot_hrs/2 }              ← halved for Saturday
```

**If `sat_ot` is not configured in WC settings → Saturday OT = 0.**  
Smart OT correctly detects the need for Saturday OT (`effectiveOtCap > 0`) but `regLeft` includes Saturday regular hours. If the work can't finish within Saturday regular time, the overflow carries to next week.

**Fix**: Set `sat_ot` in WC Config → Settings → เวลางาน for any work centre that should allow Saturday overtime.

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

## 🔗 ครบต่อเครื่อง / 🔀 แยกเครื่องได้ (Sticky Orders)

Toggle shown in the summary row. Only applies to `🏎 เร็วสุด` mode.

| State | Behaviour |
|-------|-----------|
| 🔗 ครบต่อเครื่อง (ON, default) | Once Machine X picks any unit of Order A, **all** remaining units of Order A are reserved for Machine X. Another machine cannot pick them. |
| 🔀 แยกเครื่องได้ (OFF) | Any machine can pick any unit of any order. One order may be split across multiple machines. |

**Implementation**: `orderMachine: Map<orderId, machineId>` — populated when a machine claims a unit. Eligibility filter skips units where `orderMachine[orderId] !== m.id`.

**Owned-first rule**: When a machine has owned pending units in the pool, it cannot claim NEW orders until all owned units are done. Without this, high-capacity machines (12h OT/day) greedily claim 4-5 orders in a single day, starving lower-capacity machines of any work — causing fewer total units completed than non-sticky modes.

**Smart OT interaction**: `ownedPendingHrs` uses `orderMachine` to count reserved-but-not-yet-started units. When `stickyOrders=false`, `orderMachine` is never populated → `ownedPendingHrs = 0` always → Stage 1 only uses `unclaimedShare` (fair division among eligible machines).

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
| `laser` | Machine has laser wire cutter — used by Wire Match toggle |
| `m4` | Machine can cut M-4 profile wire — used by Wire Match toggle |
| `time_mul` | Speed multiplier (default 1.0) — scales kVA rate: 1.2 = 20% slower, 0.9 = 10% faster |
| `tmc_hrs` | Fixed overhead hours per order (default 0) — also the **sole** cutting time for Cast Resin |
| `rates[]` | Per-machine kVA→hours table — overrides global rates for this machine only |

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
| 🏎 completes fewer units than 📅 (counterintuitive) | stickyOrders: high-capacity machines claim multiple orders per day, leaving lower-capacity machines idle | Fixed: owned-first rule — machine must finish all owned pending units before claiming a new order |
| Smart OT fires on every day (same as 🔥) | Stage 1 counted ALL eligible pool units at full value → overcounting | Fixed: divide unclaimed by eligible machine count (per-unit weighted share) |
| Smart OT ≈ 0h all week (same as ❌) | Stage 1 only used confirmed owned work — machine owns one order at a time (ownedFirst), which fits in regLeft → no OT | Fixed: Stage 1 includes unclaimedShare; Stage 2 refines dynamically when a claim reveals overload |
| Machine doesn't use Friday OT, carries batch to next week | Unclaimed batch divided by 4 machines = 1/4 credit → Stage 1 underestimates → no OT | Fixed: Stage 2 fires when Machine claims batch mid-day, OT extended immediately |
| Saturday still carries even after Friday OT | Saturday OT = 0 because `sat_ot` not set in WC Config | Fix: configure `sat_ot` in Settings → WC Config |
| Machine shows "50–0kVA" | max_kva=0, less than min_kva | Fix kVA สูงสุด in config table |
| Dates shift by 1 day | `.toISOString()` → UTC timezone shift | Fixed: `localISO(d)` + `types.setTypeParser(1082)` |
| Card and table show different data | Table used raw `asgn`, card used `weekSchedule` | Fixed: both use `weekData.dayRows.machineCells` |
| Order counted multiple times in total | Carry-over order counted per day | Fixed: `Set<orderId>` deduplication in mTotals |

---

## Files Changed

| File | Key changes |
|------|-------------|
| `DeptTab/CuttingMachines.tsx` | All 21 modes, shared pool, smart OT, off_days, save/load plans, Wire Match, Drill toggle, TMC/time_mul, per-machine rates, Cast Resin logic, export CSV |
| `DeptTab/CoilMachines.tsx` | New: coil winding machine config |
| `DeptTab/index.tsx` | 🌀 เครื่องพันคอยล์ button for แผนกพันคอยล์ |
| `PlanTab/index.tsx` | Daily kVA summary table, week grouping with subtotals |
| `ImportTab/index.tsx` | Fixed timezone in `localISO()` |
| `utils/itemCodeDecode.ts` | Fixed `decodeKva` to accept full item code; exports typeCode |
| `tabs/TranscodeTab/index.tsx` | Fixed `decodeKva(CDEF)` → `decodeKva(code)` bug |
| `types.ts` | Added off_days, wc_id, reg_hrs, ot_hrs, time_mul, tmc_hrs, CuttingRate to CuttingMachine |
| `backend/server.js` | cutting_rates, cutting_plan_snapshots, coil_machines tables; time_mul, tmc_hrs columns; DATE timezone fix |

---

## Cutting Time Formula

`getHrsForKva(machine, kVA, globalRates, itemCode)` — called for every order on every machine:

```
1. Cast Resin check (itemCode[1] === '4')
   → return machine.tmc_hrs                    ← fixed TMC only, no kVA rate

2. Resolve base rate (Oil and all other types)
   machine.rates[kVA] exists?  → base = machine rate   ← machine-specific, checked first
   globalRates[kVA] exists?    → base = global rate    ← SAP EE3102 table
   otherwise                   → base = machine.hrs_per_unit

3. Apply machine adjustments
   return base × machine.time_mul + machine.tmc_hrs
```

---

## Wire Match Toggle (🔒 Wire Match)

When ON, `canMachineCut()` enforces wire type compatibility:

```
detectWireType(order.raw_mat):
  starts with "LS"          → 'laser'
  contains "M - 4" or "M-4" → 'm4'
  otherwise                  → 'any'

if wireType === 'laser' and machine.laser === false  → BLOCKED
if wireType === 'm4'    and machine.m4   === false   → BLOCKED
```

When OFF: wire type is a soft tiebreaker only (`wirePrefers` adds DRILL_BONUS = 0.0001h to score).

---

## Drill Required Toggle (🔩 เจาะ ≥315kVA)

When ON, `canMachineCut()` enforces drill requirement for large orders:

```
if order.kVA >= 315 and machine.drill_8mm === false and machine.drill_22mm === false
    → BLOCKED
```

When OFF: drill is a soft tiebreaker only.

---

## kVA Value Priority

```
order.kva                          ← checked first (most specific)
?? products[order.product]?.kva    ← product catalog (uses bucket: tr.630kVA = any ≤630kVA)
?? 0
```

`order.kva` takes priority because a 500kVA transformer has `product="tr.630kVA"` (bucket), but its cutting time must use the 500kVA rate, not 630kVA.

---

## Per-Machine Rates

Each machine can have its own kVA→hours table (`machine.rates[]`). This overrides the global rate for that specific kVA on that machine only. Set via **⏱ เวลาตัดโลหะตามขนาด (รายเครื่อง)** section.

---

## Export CSV (📤 Export CSV)

Downloads the full weekly schedule with columns:
`Date, Day, Machine, SAP SO, kVA, Qty, Type, Customer, Raw Mat, Hours Worked, Total Hrs, Status, Carry Over`

---

## Pending / Known Issues

- ⭐ ความสำคัญ mode is "week-first" — may need "day-first" variant
- 🔮 สัปดาห์หน้า logic is heuristic (50% threshold) — could be tuned
- Pipeline view (🔄) shows correctly but could be improved with time axis scale
- TMC for Cast Resin defaults to 0 — user must set machine tmc_hrs for CR orders to have non-zero cutting time
- Smart OT Stage 2 re-evaluates `regLeft` using the value computed at day start (not reduced as hours are worked). This means `regLeft` slightly overestimates remaining capacity when the check fires mid-day. In practice the error is < 1 unit's worth of hours and is acceptable.
