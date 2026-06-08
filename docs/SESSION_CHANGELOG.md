# Cutting Machine Scheduler — Session Changelog

> Session date: 2026-06-08  
> Branch: `master` → remote `r68` (https://github.com/FitJustTry/68eakka.git)  
> Files changed: `engine.ts`, `CuttingMachines.tsx`

---

## Summary of All Changes

### 1. Fix Build Errors — Unused Variables (`TS6133`)
**Commit:** `6f8af46`  
**File:** `CuttingMachines.tsx`

After refactoring into the `scheduling/` module structure, TypeScript `verbatimModuleSyntax` flagged unused destructured variables. Fixed by prefixing with `_`:
- `actualOrderCount: _actualOrderCount` (line 197)
- `totalKvaWeek: _totalKvaWeek`, `summaryStatus: _summaryStatus` (line 733)
- `dayKva: _dayKva`, `dayCarryQty: _dayCarryQty` (line 1587)
- `grp: _grp` (line 1617), `_dayCarryQty2`, `_dayUnassigned2`, `_dayCapHrs` (line 1764)
- `_mi` index, removed unused `cellGrp` destructuring (line 1780)
- `_h` (line 1916)

---

### 2. Fix 🏎 เร็วสุด Scheduling Slower Than 📅 รายวัน
**Commits:** `92cfe79` → `7cfcfc3`  
**File:** `engine.ts` — `scheduleFastest()`

**Root cause:** Original implementation ran machines sequentially (M1 full day → M2 full day → …). Machine 1 always got first pick of orders, leaving less optimal work for later machines. Result: 🏎 completed fewer units than 📅.

**Fix — 3-phase design:**

| Phase | What it does |
|---|---|
| **Phase 1** | Expand each order into individual units (qty=5 → 5 units). Sort by processing time DESC (LPT). |
| **Phase 2** | Pre-assign every unit to a machine globally using least-loaded LPT — no competition per day. |
| **Phase 3** | Each machine simulates its pre-assigned queue independently, day by day. |

Key advantage: all machines get their workload upfront — no ordering bias between machines.

---

### 3. Fix 🔒+🔩+🔗 Making 🏎 the SLOWEST Mode
**Commit:** `7c4cd89`  
**File:** `engine.ts` — `scheduleFastest()` Phase 2

**Root cause:** With Wire Match (🔒) + Drill ≥315kVA (🔩) active, many large orders could ONLY go to 1 specific machine (the "exclusive" machine). The old code had a `weekCap` capacity gate — when the exclusive machine was "full", those units were **silently dropped** from queues entirely, never simulated. With 3 constraints active, the exclusive machine filled up immediately and most constrained orders vanished.

**Fix:** Removed `weekCap` from Phase 2 entirely. Phase 3 handles carry-over via `carriesForward` flag. No units are dropped.

---

### 4. Fix Weekly Schedule — Machine 14 Getting 0 Orders + Smart OT Full from Day 1
**Commit:** `2a101e1`  
**File:** `engine.ts` — `scheduleMode()` weekly branch

**Two bugs:**

**Bug A — Machine 14 idle while others overloaded:**  
The `approach === 'weekly'` branch used a shared-pool loop that iterated machines in fixed array order. Machine 1 claimed first, Machine 2 second, … Machine 14 (last) found nothing left.

**Bug B — Smart OT using full 4h OT from Monday:**  
A "dynamic OT extension" fired whenever a newly-claimed order overflowed the remaining reg hours that day (e.g., claiming a 17.6h order on Monday → 4h OT immediately), even with 4 more full days available.

**Fix — Replaced shared-pool with pre-assign + per-machine simulate:**
```
assignOrders() LPT → fair share to all machines including Machine 14
Per-machine simulation → week-ahead smart OT (remaining queue hrs vs remaining reg capacity)
```

`weekData` computation now uses the same week-ahead formula as `scheduleFastest` Phase 3:
```typescript
const regLeft = days.slice(di).reduce((s, dd) => s + resolveHours(m, ...).reg, 0)
const queueHrs = queue.slice(qi).reduce((s, item) => s + item.remainingHrs, 0)
effectiveOtCap = Math.min(otCap, Math.max(0, curRem + queueHrs - regLeft))
```

---

### 5. Add Week Completion Summary Panel
**Commit:** `044e5ea`  
**File:** `CuttingMachines.tsx`

Added a summary row below the schedule table in card/table views:

| Row | Meaning |
|---|---|
| ✅ เสร็จสัปดาห์นี้ | Orders whose **last** `DayWork` entry is `isComplete = true` |
| ⏭ ค้างสัปดาห์หน้า | Orders that appeared in the schedule but whose last entry is still `isComplete = false` |
| ❌ ไม่ได้ตั้งแผน | Orders in `weekOrders` that never entered any machine queue (constraint mismatch) |

Each row shows order count + total ตัว, then chips per order (SAP SO / kVA / ×qty / customer).

**Computation** (`weekData` useMemo):
```typescript
// Track last-seen isComplete state per order across all machines & days
// Latest day wins; on same day, isComplete=true wins
orderLastState.set(w.order.id, { isComplete: w.isComplete, day: dStr })
```

---

### 6. Fix ตัว Count — Completed Units Only, No Double-Counting
**Commit:** `842123d`  
**File:** `CuttingMachines.tsx` — `mTotals` in `weekData`

**Root cause:** `mTotals[i].qty` used `seenOrders × o.qty` — for every machine that touched an order it added the full `o.qty`. In 🔀 mode where 6 machines each cut 1 unit of a qty=5 order: `5 × 6 = 30` counted for what was actually 5 units. Sum across all orders → 206 displayed for ~78 actual units.

**Fix:**
```typescript
// 🏎 fastest mode: each isComplete DayWork = exactly 1 unit
const qty = isFastest
  ? completedEntries                         // count of isComplete=true entries
  : [...completedIds].reduce((s, oid) => {   // schedule modes: unique completed orders × o.qty
      const o = weekOrders.find(x => x.id === oid)
      return s + (o?.qty ?? 0)
    }, 0)
```

- **🏎 mode:** `isComplete=true` DayWork entries (each = 1 unit, even for carry-over)
- **📅/🗓 modes:** unique completed order IDs × `o.qty` (deduplicating multi-day carry-overs)

---

### 7. Fix 🔒+🔩+🔗 Slowest Mode — Exclusive-First Order Assignment
**Commit:** `4bed00f`  
**File:** `engine.ts` — `scheduleFastest()` Phase 2

**Root cause (deeper than fix #3):** Even after removing `weekCap`, with `stickyOrders=true`, Phase 2 processed units in LPT order. A **flexible** order (2+ eligible machines) could grab the machine that an **exclusive** order (only 1 eligible machine) needed — then when the exclusive order arrived, its only machine was already loaded with no alternative. All constrained orders piled onto one overloaded machine.

**Fix — Whole-order assignment, exclusive-first:**

```
stickyOrders=true path:
  1. Compute eligible machines per ORDER (not per unit)
  2. Sort orders: fewest eligible first (exclusive = 1 machine goes first)
     Then within same count: LPT by total order hours
  3. For each order: assign to least-loaded eligible machine
  4. All units of that order go to that machine's queue

stickyOrders=false path: unchanged (unit-by-unit LPT)
```

**Constraint-relaxation fallback** — if an order has 0 eligible machines:
1. Try without wire match (🔒)
2. Try without drill requirement (🔩)
3. Try without both
4. Skip only if truly no machine in shop can cut it

This means 🔒+🔩+🔗+🏎 is now the **fastest** configuration (all constraints respected, but exclusive orders never starve non-exclusive ones).

---

## Architecture Reference

```
engine.ts
  ├─ assignOrders()       — LPT pre-assignment (used by 📅/🗓 modes)
  ├─ scheduleFastest()    — 3-phase: expand → assign → simulate (🏎 mode)
  │     Phase 1: expand orders → units, LPT sort
  │     Phase 2: stickyOrders=true  → whole-order, exclusive-first
  │               stickyOrders=false → unit-by-unit LPT
  │     Phase 3: per-machine queue simulation, week-ahead smart OT
  ├─ scheduleMode()       — daily/weekly simulation (📅/🗓 modes)
  │     weekly:  assignOrders() pre-assign → per-machine simulate
  │     daily:   dailyAssignments[] → per-machine carry queue
  └─ sortPool()           — sort strategy for 📅วันส่ง/⭐ความสำคัญ/🔮สัปดาห์หน้า/🔗Batch

utils.ts
  ├─ canMachineCut()      — kVA range + strictWire + requireDrill
  ├─ resolveHours()       — reg/OT hours from WCConfig or machine defaults
  ├─ getHrsForKva()       — TMC rate → machine rate → global rate → default
  ├─ drillPrefers()       — soft tiebreaker for drill-capable machines
  └─ wirePrefers()        — soft tiebreaker for laser/m4 machines

CuttingMachines.tsx
  ├─ weekSchedule         — output of scheduleFastest() or scheduleMode()
  ├─ weekData             — computed from weekSchedule (useMemo)
  │     mTotals           — per-machine completed unit counts (mode-aware)
  │     dayRows           — per-day display data
  │     weekDoneOrders    — ✅ completed orders
  │     weekCarryOrders   — ⏭ carry-forward orders
  │     weekUnscheduled   — ❌ never-scheduled orders
  └─ Views: 📋 รายวัน | 📊 ตาราง | 🔄 Pipeline | 📦 รวมออเดอร์
```

---

## Constraint Flags

| Flag | State | Effect |
|---|---|---|
| 🔒 Wire Match | `strictWire` | LS steel → laser machine only; M-4 → m4 machine only |
| 🔩 เจาะ ≥315kVA | `requireDrill` | Orders with kVA ≥ 315 must go to machines with `drill_8mm` or `drill_22mm` |
| 🔗 ครบต่อเครื่อง | `stickyOrders=true` | All units of one order stay on same machine |
| 🔀 แยกเครื่องได้ | `stickyOrders=false` | Each unit assigned independently (parallel cutting) |

---

## Smart OT Formula

Used in both `scheduleFastest` Phase 3 and `scheduleMode` weekly:

```
regLeft  = Σ reg_hours(machine, day) for all remaining days in week
queueHrs = Σ unit_hours for all unstarted units in machine queue
curRem   = remaining hours for the in-progress unit (carry from yesterday)

effectiveOtCap = min(otCap, max(0, curRem + queueHrs - regLeft))
```

OT fires only when the total remaining work genuinely exceeds remaining regular capacity. Zero OT on days where the queue can fit in regular hours.
