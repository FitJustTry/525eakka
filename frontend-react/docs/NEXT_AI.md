# Handoff: Cutting Machine Scheduler — What Was Done & What To Improve

> Project: Thai transformer factory cutting machine scheduler (React + TypeScript)
> Repo: https://github.com/FitJustTry/68eakka.git  branch: `master`
> Last session commits: `063914a` (latest) ← `4bed00f` ← `842123d` ← `044e5ea` ← `2a101e1`
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
  SESSION_CHANGELOG.md       — detailed log of all changes made in the previous two sessions
  NEXT_AI.md                 — this file
```

---

## Scheduling Modes (how the UI calls the engine)

| UI Mode | Function | `approach` / flags |
|---|---|---|
| 📅 รายวัน | `scheduleMode` | `approach='daily'` |
| 🗓 รายสัปดาห์ | `scheduleMode` | `approach='weekly'` |
| 🏎 เร็วสุด | `scheduleFastest` | — |

Each mode has three OT policies:
- `'none'` — regular hours only
- `'smart'` — OT deferred to end of week (see below)
- `'full'` — always use full OT every day

Constraint flags (booleans passed to both functions):
- `strictWire` — enforce wire-type matching (LS→laser, M-4→m4)
- `requireDrill` — kVA ≥ 315 must go to drill machine
- `stickyOrders` — all units of one order go to same machine (🔗); false = split freely (🔀)

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
No pool competition. Uses the lazy OT formula (see below).

---

## Smart OT Formula (lazy / end-of-week)

**Changed in the last commit (`063914a`).** Both `scheduleFastest` Phase 3 and
`scheduleMode` weekly use the same formula:

```typescript
const regLeft = days.slice(di).reduce(...)      // today + future regular hours
const otLeft  = days.slice(di + 1).reduce(...)  // FUTURE OT hours only (not today)
effectiveOtCap = min(otCap, max(0, rem + queueHrs - regLeft - otLeft))
```

**Why:** Old formula (`rem + queueHrs - regLeft`) fired OT from day 1 whenever the
weekly queue exceeded remaining regular hours. By also subtracting `otLeft`, OT only fires
on a day when the work cannot be absorbed by future days' OT capacity. Result: machines fill
regular hours first; OT accumulates toward Friday/Saturday.

**Example (Machine with 66.7h queue, 48h reg, 20h future OT):**
- Monday: `66.7 - 48 - 20 = -1.3` → **0h OT** (deferred)
- Tuesday: `58.7 - 40 - 16 = 2.7` → **2.7h OT**
- Wed–Fri: **4h OT each**

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
| `weekCarryOrders` | Order[] | orders in schedule but not yet complete |
| `weekUnscheduled` | Order[] | orders in weekOrders that never entered any queue |
| `totalOT` | number | sum of OT hours across all machines |

**`mTotals.qty` mode-awareness (important):**
```typescript
const isFastest = balanceMode.startsWith('fastest')
qty = isFastest
  ? completedEntries           // count of isComplete=true DayWork entries (each = 1 unit)
  : [...completedIds].reduce((s, oid) => s + weekOrders.find(x=>x.id===oid)?.qty ?? 0, 0)
```
Why: fastest mode splits multi-unit orders across machines/days — each `isComplete` entry = 1 unit.
Schedule modes track per-order completion — use `o.qty` for each unique completed order.

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
  hasCarryOver: boolean  // any work entry is a carry-over from yesterday
  carriesForward: boolean // machine still has work after today
}

// Output of scheduleFastest / scheduleMode:
Map<machineId, Map<dateString_ISO, MachineDaySched>>
```

---

## Known Issues & Areas to Improve

### 1. Machine 14 gets 0 orders in ⚠️ (Wire Match) mode
Machine 14 has no `laser` and no `m4` capability. In the current week's order set,
every order is either LS0.70 (needs laser) or M-4 (needs m4). So Machine 14
legitimately gets nothing when Wire Match is active.

**Possible improvement:** Add partial constraint relaxation — if a machine is idle for
the whole week, allow it to take orders even without the exact wire capability (as a
"can cut but not optimal" fallback). Currently fallback only activates for orders
with zero eligible machines; it doesn't proactively redistribute from overloaded machines.

### 2. No inter-machine balancing in Phase 3
Once Phase 2 assigns units, Phase 3 never redistributes. If one machine finishes
Monday and another is overloaded all week, the idle machine doesn't help.

**Possible improvement:** After Phase 3 simulation, check for machines that finish
early and "steal" unstarted units from overloaded machines' queues.

### 3. Carry-over across weeks not shown
`weekCarryOrders` shows what carries to next week, but the UI only marks them as ⏭.
There's no "pre-populate next week" button that automatically adds them to next week's queue.

### 4. OT formula fires late if queue is just over capacity
With the lazy OT formula, if queue = total_capacity + 1h, OT fires on the very last day
only — but by then it may be too late to complete everything (1h doesn't fit in 1 day's OT).
The formula is correct but the schedule can look "tight" on the last day.

### 5. `scheduleMode daily` still uses old OT formula logic
The `approach='daily'` branch in `scheduleMode` uses a simpler per-day OT calculation:
`effectiveOtCap = min(otCap, max(0, carryHrs + todayHrs - regCap))` — this is a
same-day OT trigger, not a week-ahead one. It was intentionally left different because
daily mode only knows about today's orders. No week-ahead data available.

---

## Constraint Logic (canMachineCut in utils.ts)

```
kva < m.min_kva                          → false (too small)
m.max_kva < 9999 && kva > m.max_kva     → false (too large)
strictWire && raw_mat=LS && !m.laser    → false
strictWire && raw_mat=M-4 && !m.m4     → false
requireDrill && kva >= 315 && !m.drill_8mm && !m.drill_22mm → false
```

`max_kva >= 9999` = no upper limit (∞). Machine 14 has `max_kva=2500`, `min_kva=160`.

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

- **Completeness:** all 38 orders in the week should get scheduled (no silent drops)
- **OT behavior:** regular hours should fill first; OT only at end of week when needed
- **Wire Match accuracy:** LS → laser only, M-4 → m4 only (but if machine is idle, consider relaxing)
- **Week summary:** ✅ done / ⏭ carry / ❌ unscheduled chips below the table
- **Unit count (ตัว):** header numbers must match actual completed units, not double-count

All recent bugs in these areas have been fixed. See `SESSION_CHANGELOG.md` for the full history.
