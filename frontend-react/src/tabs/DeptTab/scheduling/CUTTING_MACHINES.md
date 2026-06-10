# Cutting Machine Scheduler — Engine & UI Reference

> `engine.ts` · `weekData.ts` · `CuttingMachines.tsx`

---

## Architecture overview

```
CuttingMachines.tsx
  ├── dailyAssignments (useMemo) — pre-groups orders by plan_date per machine
  ├── weekSchedule     (useMemo) — calls scheduleFastest / scheduleMode
  ├── weekData         (useMemo) — computeWeekData: mTotals, dayRows, summary
  └── lateOrders       (useMemo) — Set<orderId> with due_so exceeded
```

### Scheduling entry points

| Function | Used when | Notes |
|---|---|---|
| `scheduleFastest` | 🏎 เร็วสุด | Unit-level packing, ignores plan_date |
| `scheduleMode` (weekly) | 🗓 รายสัปดาห์ / 📅 วันส่งก่อน / ⭐ ความสำคัญ / 🔮 สัปดาห์หน้า / 🔗 Batch | Global LPT pre-assign → per-machine simulation |
| `scheduleMode` (daily) | 📅 รายวัน | Respects `plan_date`, assigns by day bucket |

---

## Engine functions

### `assignOrders`
Greedy LPT load balance with drill+wire soft preference.

- Score = `wallTime − drillBonus − wireBonus`  (DRILL_BONUS = 0.0001h — tiebreaker only)
- **Constraint relaxation cascade** (if no eligible machine):
  1. Drop wire constraint (`strictWire = false`)
  2. Drop drill constraint (`requireDrill = false`)
  3. Drop both
  4. `continue` (order skipped, logged implicitly)
- Exclusive machines (only 1 eligible) are pre-assigned first to avoid starving them.

### `sortPool`
Sorts a machine's pre-assigned orders before simulation.

| Strategy | Behaviour |
|---|---|
| `plan_date` | Closest plan_date first; tie → LPT |
| `deadline` | Closest `due_so` / `deadline` first; tie → LPT |
| `priority` | Fast > เสริม > other; tie → LPT |
| `interweek` | Next week heavy → small this week first; next week light → large first. Threshold configurable (default 0.5) |
| `batch_kva` | Group by kVA bucket (50/100/160/250/300/630/1000/2000/3500/7000+); tie → LPT |

### `scheduleMode`
Simulates each machine's queue day by day.

**OT policies:**
- `none` — reg hours only
- `full` — reg + max OT every day
- `smart` — OT only when `carryHrs + futureHrs > regLeft + otLeft` (week-ahead look)
  - `lazyOT=true` (🌅 ท้ายสัปดาห์) — `otLeft` is excluded so OT fires late in the week
  - `lazyOT=false` (⚡ ต้นสัปดาห์) — `otLeft` included, OT fires from day 1 if needed

**Carry-over:** unfinished work carries to next day automatically. End-of-week carry goes into `weekCarryOrders`.

---

## KVA lookup mode

Controlled by `useNearestKva: boolean` state (default `false`).

| Mode | Button label | Behaviour |
|---|---|---|
| `false` | `🎯 KVA ตรงเท่านั้น` | Exact match only. If no entry exists for the order's kVA, falls back to `m.hrs_per_unit`. Current/default behaviour. |
| `true` | `🎯 KVA ใกล้เคียง` | If no exact match, picks the rate table entry with minimum `|entry.kva − order.kva|`. |

**Example** (table has 500, 1000, 1500, 2000):

| Order kVA | Exact mode result | Nearest mode result |
|---|---|---|
| 1000 | use 1000 entry | use 1000 entry |
| 1100 | use hrs_per_unit | use 1000 entry (`|1000−1100|=100 < |1500−1100|=400`) |
| 1400 | use hrs_per_unit | use 1500 entry (`|1500−1400|=100 < |1000−1400|=400`) |
| 1700 | use hrs_per_unit | use 1500 entry (`|1500−1700|=200 < |2000−1700|=300`) |

**Lookup priority (both modes):**
1. Per-machine TMC rates (`m.tmc_rates`) — only for Cast Resin (`itemCode[1] === '4'`)
2. Global TMC rates (`globalTmcRates`) — only for Cast Resin
3. Per-machine standard rates (`m.rates`)
4. Global standard rates (`globalRates`)
5. `m.hrs_per_unit` × `time_mul` + `tmc_hrs` — fallback if no rate entry found at all

Nearest mode applies at each tier independently. If a tier has any entries, it will always return a result (no fallthrough to next tier).

**Propagation:** threaded through all scheduling paths — `assignOrders`, `scheduleFastest`, `scheduleMode`, `sortPool` — and all export functions via `ExportContext.useNearestKva`.

---

## workDisplay modes

| Mode | Filter / grouping | Key |
|---|---|---|
| 📦 ต่อออเดอร์ | Hide in-progress carry stubs; merge segments by `origId` | `origId(w.order.id)` |
| ↩ ต่อเนื่อง | Show all including carry stubs; separate row per (order + direction) | `origId:c` or `origId:n` |
| 📋 ต่อเซ็กเมนต์ | Raw — every `DayWork` entry as-is | `wi` index |
| 🔩 ต่อหน่วย | Expand qty>1 into individual unit rows | per unit |

`origId(id)` strips the `__u0`, `__u1` … suffix added when `stickyOrders=false` splits units.

---

## Late delivery flag 🔴

Computed in `lateOrders: Set<string>` (useMemo, depends on `weekSchedule`).

**Logic:**
1. Scan all `isComplete=true` work entries → track last completion `dStr` per `origId`
2. If `completionDay > due_so` → add to late set
3. For `weekCarryOrders` (never completes this week): if `due_so ≤ weekEndStr` → late

Only `due_so` is used (not `deadline`) to avoid false positives from orders where `deadline` carries a different semantic meaning.

**Render rule:** 🔴 badge shows **only on `isComplete` rows** (card, table, pipeline). Carry-over stubs for the same order show no badge, preventing visual overload where one late order would mark every day it appeared on.

Rendered in card view, table view, and pipeline view (tooltip + red top border on completion segment only).

---

## Fixes applied (session log)

### Fix #1 — Daily smart OT week-ahead (2026-06)
**Before:** Smart OT fired every day where `wallHrs > regCap` (day-only check).  
**After:** Computes `regLeft` + `otLeft` across all remaining days, plus `futureHrs` from `dailyAssignments`. OT only fires when the full week's remaining work can't fit in remaining regular + OT hours.

### Fix #3 — Constraint relaxation in `assignOrders` (2026-06)
**Before:** Orders silently skipped with bare `continue` when no machine matched `canMachineCut`.  
**After:** 3-step cascade: relax wire → relax drill → relax both → only then skip.

### Fix #5 — `wirePrefers` soft bonus in `scheduleFastest` (2026-06)
**Before:** Pre-assignment loops only used `drillPrefers` as tiebreaker.  
**After:** Both `drillPrefers` and `wirePrefers` contribute `DRILL_BONUS` to the score in both sticky and non-sticky paths.

Note: `wirePrefers` (soft nudge) ≠ `🔒 Wire Match` (`strictWire`). Both can be active simultaneously — `strictWire` blocks eligibility entirely; `wirePrefers` just breaks ties among already-eligible machines.

### Fix #6 — Late delivery flag 🔴 (2026-06)
Added `lateOrders` useMemo + 🔴 badge in card, table, pipeline views.

### Fix #7 — Configurable 🔮 interweek threshold (2026-06)
**Before:** Hardcoded `0.5` in `sortPool`.  
**After:** `interweekThreshold` state in `CuttingMachines.tsx` (default 0.5), threaded through `sm()` → `scheduleMode` → `sortPool`. Number input visible only when 🔮 mode selected.

### Fix — workDisplay modes all identical (2026-06)
**Before:** `ต่อออเดอร์` filter had carry-over guard removed, making all 3 modes show the same output.  
**After:** Restored `(!w.isCarryOver || w.isComplete)` filter in all 3 view renders (card, table, pipeline).

### Fix — SAP Routing Catalog NaNh + crash (2026-06)
**Root cause:** API returns ops as `{wc, op, hrs}` objects; frontend read as tuple indices `op[1], op[2], op[3]`.  
**After:** Fetch callback converts objects → tuples `['', o.wc, o.op, o.hrs]` before storing.

### Fix — SAP WC Load tab broken hours (2026-06)
Same root cause as above. Fixed by using `op.wc`, `op.op`, `op.hrs` directly.

---

### Feature — KVA nearest-lookup mode (2026-06)
Added `useNearestKva` toggle (`🎯 KVA ตรงเท่านั้น` / `🎯 KVA ใกล้เคียง`) to toolbar Row 2.  
**Default:** `false` (exact-only — no behaviour change).  
**When `true`:** `getHrsForKva` uses `pick(rates)` helper that returns the rate with min `|entry.kva − kva|` when no exact match exists.  
Threaded through: `assignOrders`, `scheduleFastest`, `scheduleMode`, `sortPool`, all `export.ts` functions, `dailyAssignments` cumWall, and the table-view `totalH` display.

### Fix A — sortPool per-machine rates (2026-06)
**Before:** `sortPool` always used `machines[0]`'s `time_mul` for all hour estimates, even when sorting a specific machine's queue.  
**After:** Added optional `thisMachine?: CuttingMachine` parameter. `scheduleMode` passes `m` when calling, so each machine's queue is sorted using that machine's own rates.

### Fix L — Daily mode off-day bucketing (2026-06)
**Before:** Orders with `plan_date` on a day when all machines are off were assigned to no machine (lost from daily queue).  
**After:** `dailyAssignments` builds a `bumpedPlanDate` map: days with no active machines forward orders to the next active day. Carry-over for already-running work on the machine's own off-day was already correct (avail=0 pushes all items to carryItems).

### Fix D — Late summary badge in week header (2026-06)
Added `🔴 N ออเดอร์ส่งช้า` badge next to the week title when `lateOrders.size > 0`.

### Fix — lateOrders over-flagging (2026-06)
**Before:** `due_so || deadline` fallback caused all orders with a `deadline` set to be flagged as late. Also, 🔴 badge rendered on every carry-over stub for a late order, making the entire week view red.  
**After:** `lateOrders` useMemo uses `due_so` only. Badge now requires `&& w.isComplete` (card/table) and `&& seg.isComplete` (pipeline), so only the actual completion row shows 🔴.

### Fix E — Due date color in order summary rows (2026-06)
`orderRow` now shows `due YYYY-MM-DD` in color:
- 🔴 Red + bold: `due_so < today` (already overdue)
- 🟡 Amber: `due_so` within this week
- 🟢 Green: `due_so` after this week

Late orders (`lateOrders.has(origId)`) also get a red tinted background and 🔴 prefix in the row.

---

## Known limitations / future improvements

### Medium priority

| # | Issue | Location | Notes |
|---|---|---|---|
| B | Daily path has no `sortPool` step — always `plan_date` order | `engine.ts` daily branch | Adding a sort step here would make deadline/priority strategies work in daily mode |
| C | `weekCarryOrders` computed from `weekData` but `lateOrders` loops it separately | `CuttingMachines.tsx` | Minor duplication; can fold into `weekData` |

### Low priority / UI

| # | Idea | Notes |
|---|---|---|
| F | Export schedule to Excel / PDF | Already have Excel per-machine export; add full-week grid |
| G | `interweekThreshold` shown as a percentage label (`50%`) instead of raw float | UX polish |
| H | Pipeline view: click a segment to jump to the order's detail | Currently tooltip only |
| I | `lazyOT` setting for daily mode (currently only weekly) | Daily smart OT always eager |
| J | Per-machine OT cap override (some machines have different OT limits) | Currently global reg/OT per WC config |

### Engine accuracy

| # | Idea | Notes |
|---|---|---|
| K | Multi-week lookahead for smart OT | Currently looks at this week only |
| M | Split oversized orders across machines in weekly mode | Currently one machine owns full qty even if another is idle |
