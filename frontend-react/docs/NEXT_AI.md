# Handoff: Cutting Machine Scheduler — What Was Done & What To Improve

> Project: Thai transformer factory cutting machine scheduler (React + TypeScript)
> Repo: https://github.com/FitJustTry/682eakka.git  branch: `master`
> Last session commits: `2ffb6c5` (latest) ← `0e33390` ← `b88b2f0` ← `3bc864d` ← `063914a`
> Key files: `engine.ts`, `CuttingMachines.tsx`, `utils.ts`, `constants.ts`

---

## What This App Does

Schedules cutting machine jobs for a transformer factory. Given a week's orders (SAP SOs),
it assigns each order to a machine and simulates the schedule day-by-day, respecting:
- Machine kVA range (min/max)
- Wire type constraint (LS steel → laser machine; M-4 → m4 machine)
- Drill requirement (kVA ≥ 315 → drill machine)
- Overtime policy (none / smart / full)
- Sticky orders (all units of one order on same machine vs split across machines)

The UI lives in `CuttingMachines.tsx`. The engine is in `scheduling/engine.ts`.

---

## File Map

```
src/tabs/DeptTab/
  CuttingMachines.tsx        — main UI, weekData useMemo, weekSchedule trigger
  scheduling/
    engine.ts                — scheduleFastest(), scheduleMode(), assignOrders(), sortPool()
    utils.ts                 — canMachineCut(), getHrsForKva(), resolveHours(), fmtISO()
    constants.ts             — DayWork, MachineDaySched interfaces; REG_PER, OT_PER
docs/
  CUTTING_MACHINE_LOGIC.md   — original architecture doc (pre-session, still accurate for types/utils)
  SESSION_CHANGELOG.md       — detailed log of all changes made in prior sessions
  NEXT_AI.md                 — this file
```

---

## Page Layout (section order in CuttingMachines.tsx render)

Sections appear top-to-bottom in this order:
1. **แผนการตัดโลหะ — สัปดาห์** — weekly schedule (always open, always first)
2. **▸ เครื่องตัดโลหะ** — machine config table (collapsed by default, click header to expand)
3. **▸ ⏱ มาตรฐาน** — global kVA→hours rate table (collapsed)
4. **▸ ⏱ รายเครื่อง** — per-machine rate overrides (collapsed)

All three config sections show a summary line when collapsed. Click the header to expand.

---

## Scheduling Modes (how the UI calls the engine)

| UI Mode | Function | `approach` / flags |
|---|---|---|
| 📅 รายวัน | `scheduleMode` | `approach='daily'` |
| 🗓 รายสัปดาห์ | `scheduleMode` | `approach='weekly'` |
| 🏎 เร็วสุด | `scheduleFastest` | — |

Each mode has three OT policies:
- `'none'` — regular hours only
- `'smart'` — week-ahead formula with lazy/eager toggle (see below)
- `'full'` — always use full OT every day

Constraint flags (booleans passed to both functions):
- `strictWire` — enforce wire-type matching (LS→laser, M-4→m4)
- `requireDrill` — kVA ≥ 315 must go to drill machine
- `stickyOrders` — all units of one order go to same machine (🔗); false = split freely (🔀)
- `lazyOT` — `true` = defer OT to end of week (new default); `false` = eager, fires from day 1

The `lazyOT` toggle shows as **🌅 ท้ายสัปดาห์** / **⚡ ต้นสัปดาห์** buttons, always visible
in the OT row. Only affects `'smart'` policy; ignored for `'none'` and `'full'`.

---

## scheduleFastest — 3-Phase Design

**Phase 1** — expand orders to individual units, LPT sort
```
Order qty=5  →  5 Unit entries  →  sorted by processing time DESC
```

**Phase 2** — pre-assign every unit/order to a machine globally
- `stickyOrders=true` (🔗): assign WHOLE ORDERS, exclusive-first (fewest eligible machines first).
  This prevents non-exclusive orders from stealing the only machine an exclusive order can use.
  Fallback if 0 eligible: relax wire → relax drill → relax both → skip.
- `stickyOrders=false` (🔀): assign individual units LPT to least-loaded eligible machine.

**Phase 3** — each machine simulates its pre-assigned queue day by day independently.
No pool competition. Uses the lazy/eager OT formula (see below).

---

## Smart OT Formula — Lazy vs Eager

Both `scheduleFastest` Phase 3 and `scheduleMode` weekly use the same formula,
controlled by the `lazyOt` boolean parameter:

```typescript
const regLeft = days.slice(di).reduce(...)       // today + future regular hours
const otLeft  = lazyOt
  ? days.slice(di + 1).reduce(...)               // FUTURE OT hours (not today) — lazy
  : 0                                            // no future deduction — eager
effectiveOtCap = min(otCap, max(0, rem + queueHrs - regLeft - otLeft))
```

**Lazy (🌅 ท้ายสัปดาห์, default):** Subtracts future OT capacity. OT only fires today
when the work cannot be absorbed by future days' OT either. Machines fill regular hours
first; OT accumulates toward end of week.

**Eager (⚡ ต้นสัปดาห์):** `otLeft=0`, restoring the old formula. OT fires from day 1
whenever `rem + queueHrs > regLeft`. Useful when the factory prefers to front-load OT.

**Example — Machine with 66.7h queue, 48h reg, 20h future OT (lazy mode):**
- Monday: `66.7 - 48 - 20 = -1.3` → **0h OT** (deferred)
- Tuesday: `58.7 - 40 - 16 = 2.7` → **2.7h OT**
- Wed–Sat: **4h OT each**

---

## assignOrders — LPT Load Balancer

Used by `scheduleMode weekly` to pre-assign orders to machines.

Score = `wall_time - drillBonus - wirePrefBonus - indexBonus`

- Exclusive orders first (fewest eligible machines first) — prevents load imbalance
- `DRILL_BONUS = 0.0001` — tiny, only breaks ties; never overrides load balance
- `INDEX_BONUS = 1e-10` — round-robin effect on perfect ties

---

## weekData useMemo (CuttingMachines.tsx)

The main computed object derived from `weekSchedule`. Contains:

| Key | Type | Description |
|---|---|---|
| `mTotals` | array | per-machine: wallHrs, qty (completed units), ot, over |
| `dayRows` | array | per-day display data for table view |
| `weekDoneOrders` | Order[] | orders whose last DayWork has `isComplete=true` |
| `weekCarryOrders` | Order[] | orders in schedule but not yet complete (⏭) |
| `weekUnscheduled` | Order[] | orders in weekOrders that never entered any queue (❌) |
| `totalOT` | number | max OT used in any single day across all machines |

**`mTotals.qty` mode-awareness (important):**
```typescript
const isFastest = balanceMode.startsWith('fastest')
qty = isFastest
  ? completedEntries           // count of isComplete=true DayWork entries (each = 1 unit)
  : [...completedIds].reduce((s, oid) => s + weekOrders.find(x=>x.id===oid)?.qty ?? 0, 0)
```
Why: fastest mode splits multi-unit orders — each `isComplete` entry = 1 unit.
Schedule modes track per-order completion — use `o.qty` for each unique completed order.

---

## Carry-Over UI

- **Section title header** shows `74 ตัว (⏭ 12 ค้าง)` in amber whenever `weekCarryOrders`
  is non-empty — visible at all times without scrolling.
- **⏭ ค้างสัปดาห์หน้า row** (below schedule table) shows a button
  `→ ดูสัปดาห์หน้า + รวมงานค้าง` — one click advances `weekOffset` by 1 and enables
  `includePrevCarry`, so carry orders appear in next week's plan automatically.
- **`includePrevCarry`** state: when true, `prevCarryOrders` (orders unfinished last week)
  are prepended to `weekOrders` before scheduling. The engine picks them up and schedules
  them alongside the new week's orders.

---

## Key Interfaces

```typescript
// constants.ts
interface DayWork {
  order: Order
  hrsWorked: number
  isComplete: boolean   // true = this unit/order finished today
  isCarryOver: boolean  // started on a previous day
  carriesOver: boolean  // continues tomorrow
}

interface MachineDaySched {
  regHrs: number; otHrs: number; otNeeded: number
  work: DayWork[]
  hasCarryOver: boolean   // any work entry is a carry-over from yesterday
  carriesForward: boolean // machine still has work after today
}

// Output of scheduleFastest / scheduleMode:
Map<machineId, Map<dateString_ISO, MachineDaySched>>
```

---

## Known Issues & Areas to Improve

### 1. Machine 14 idle in ⚠️ Wire Match mode  ← NOT YET FIXED
Machine 14 has no `laser` and no `m4`. When all orders are LS0.70 or M-4 material
and Wire Match is on, Machine 14 legitimately gets 0 orders.

**Fix approach:** In Phase 2 of `scheduleFastest`, after normal assignment is complete,
check if any machine has an empty queue for the whole week. If so, offer it orders from
the most-overloaded machine using relaxed constraints (drop wire match first).
Currently the fallback only fires when an order has zero eligible machines — not when
a machine has zero orders.

### 2. No inter-machine rebalancing after Phase 3  ← NOT YET FIXED
Once Phase 2 assigns units, Phase 3 never redistributes. If one machine finishes
early in the week and another is overloaded, the idle machine doesn't help.

**Fix approach:** After Phase 3 simulation, find machines that finish before Friday
and "steal" the last N unstarted units from the most-overloaded machine's queue.
Constraint-check each stolen unit before moving it.

### 3. `scheduleMode daily` uses different OT formula  ← INTENTIONAL, low priority
The `approach='daily'` branch uses `effectiveOtCap = min(otCap, max(0, carryHrs + todayHrs - regCap))`.
This is a same-day trigger (no week-ahead). Daily mode only knows today's orders —
there's no queue to look ahead through. Would need a separate approach to fix.

### 4. 🌅/⚡ buttons visible but inactive for ❌ and 🔥 modes
The OT timing toggle shows at all times but only affects `⚠️ เมื่อจำเป็น`. For the
other two OT policies it does nothing. Could grey them out or hide them when irrelevant.

---

## Constraint Logic (canMachineCut in utils.ts)

```
kva < m.min_kva                                             → false (too small)
m.max_kva < 9999 && kva > m.max_kva                        → false (too large)
strictWire && raw_mat=LS && !m.laser                        → false
strictWire && raw_mat=M-4 && !m.m4                         → false
requireDrill && kva >= 315 && !m.drill_8mm && !m.drill_22mm → false
```

`max_kva >= 9999` = no upper limit (∞).

---

## How to Run

```
cd frontend-react
npm install
npm run dev
```
App is at http://localhost:5173. The cutting machine scheduler is in the
"ฝ่ายตัด" (Cutting Department) tab.

---

## What the User Cares About

- **Schedule first:** page opens directly on the weekly plan, config sections collapsed below
- **OT behavior:** regular hours fill first; OT only at end of week (lazy mode default)
- **Wire Match accuracy:** LS → laser only, M-4 → m4 only
- **Carry-over visibility:** `(⏭ N ค้าง)` in title, one-click button to next week
- **Week summary:** ✅ done / ⏭ carry / ❌ unscheduled chips below the table
- **Unit count (ตัว):** header numbers match actual completed units, no double-counting
