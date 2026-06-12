# Cutting Machines — Weekly Plan Execution Tracking

## Overview

The cutting machine module (`frontend-react/src/tabs/DeptTab/cutting/`) implements a full weekly production planning and execution tracking system for the metal cutting department.

---

## Data Model

### `cutting_machines`
| Column | Type | Description |
|---|---|---|
| id | SERIAL PK | Machine ID |
| name | TEXT | Machine name |
| count | INT | Number of parallel units |
| min_kva / max_kva | INT | kVA range this machine handles |
| hrs_per_unit | FLOAT | Default cutting hours per transformer |
| laser / m4 | BOOLEAN | Wire capability flags |
| min_face_mm / max_face_mm | INT | Face size range |
| drill_8mm / drill_22mm | BOOLEAN | Drill capability flags |
| reg_hrs / ot_hrs | FLOAT | Regular and OT hours per day (fallback) |
| wc_id | TEXT | Links to `wc_config` for live hours |
| off_days | JSONB | Array of weekday ints when machine is OFF (1=Mon…6=Sat) |
| rates | JSONB | Per-kVA cutting hours `[{kva, hrs}]` |
| tmc_rates | JSONB | Per-kVA TMC (Cast Resin) hours |
| tr_power_rates | JSONB | Per-kVA TR Power hours |
| class_h_rates | JSONB | Per-kVA Class H hours |
| time_mul | FLOAT | Speed multiplier (final = base × time_mul + tmc_hrs) |
| tmc_hrs / tr_power_hrs / class_h_hrs | FLOAT | Fixed fallback hours per type |
| shift_hrs | FLOAT | Night-shift hours per day |
| shift_enabled | BOOLEAN | Whether machine supports night shift |
| sort_order | INT | Display order |

### `cutting_plan_snapshots`
| Column | Type | Description |
|---|---|---|
| id | SERIAL PK | Snapshot ID |
| week_start / week_end | DATE | Monday–Saturday of planned week |
| label | TEXT | Human-readable label |
| plan_data | JSONB | Full schedule: dayRows, machineCells, work items |
| planned_finish_dates | JSONB | `{orderId: "YYYY-MM-DD"}` — last isComplete date per order |
| planned_hours | JSONB | `{orderId: hours}` — total scheduled hours per order |
| status | TEXT | See lifecycle below |
| confirmed_at | TIMESTAMPTZ | When plan was approved |
| started_at | TIMESTAMPTZ | When production started |
| completed_at | TIMESTAMPTZ | When week was closed |
| result_summary | JSONB | See ResultSummary below |
| saved_at | TIMESTAMPTZ | Creation timestamp |

### `accepted_orders` (relevant columns)
| Column | Type | Description |
|---|---|---|
| done_qty | INT | Units actually completed (manual entry or SAP sync) |
| done_at | TIMESTAMPTZ | Auto-set when `done_qty >= qty` for the first time |
| plan_date | DATE | Scheduled production date (updated by carry-forward) |

---

## Plan Lifecycle

```
draft → approved → in_production → completed → archived
  ↓          ↓            ↓
cancelled cancelled   cancelled
```

| Transition | Timestamps set | Who triggers |
|---|---|---|
| draft → approved | `confirmed_at` | Supervisor approves plan |
| approved → in_production | `started_at` | Production starts week |
| in_production → completed | `completed_at` + `result_summary` | Close Week Wizard |
| completed → archived | — | Admin archives |
| any → cancelled | — | Manual cancel |

---

## ResultSummary (JSONB)

Stored in `cutting_plan_snapshots.result_summary` when week is closed:

```typescript
{
  planned_count: number       // total orders in plan
  completed_count: number     // orders where done_qty >= qty
  partial_count: number       // orders with 0 < done_qty < qty
  not_started_count: number   // orders with done_qty = 0
  completion_rate: number     // completed / planned × 100 (1 decimal)
  carry_count: number         // unfinished orders carried forward
  carry_orders: [{
    key: string               // origId
    sap_so: string
    reason: string            // Capacity Shortage | Machine Breakdown | Material Missing | Waiting Approval | Other
    remaining_qty: number
  }]
  best_machine: string        // machine with lowest wall/capH ratio (most headroom)
  bottleneck_machine: string  // machine with highest wall/capH ratio
  avg_delay_days: number      // average days late vs planned_finish_date (negative = early)
  on_time_count: number       // completed with delay ≤ 2 days
  late_count: number          // completed with delay > 2 days
  early_count: number         // completed with delay < -1 days
}
```

---

## Frontend Components

```
cutting/
├── CuttingPage.tsx              Main page — scheduling, week navigation
├── hooks/
│   ├── usePlanSnapshots.ts      Snapshot CRUD, status transitions, close-week
│   └── useCuttingActions.ts     Machine CRUD
├── scheduling/
│   ├── engine.ts                assignOrders, scheduleFastest, scheduleMode
│   ├── weekData.ts              computeWeekData — rolls up dayRows, carry, done
│   ├── utils.ts                 origId, fmtISO, getHrsForKva, isMachineOn
│   ├── constants.ts             DAY_SHORT, MachineDaySched
│   ├── export.ts                CSV/XLSX/TXT/JSON/Print exports
│   └── routingRates.ts          Routing CR rates from SAP routing table
└── components/
    ├── CloseWeekWizard.tsx      4-step modal: Review → Carry → Confirm → Result
    │                            + planned vs actual accuracy + auto carry-forward
    ├── SnapshotPanel.tsx        Saved plans list with status transitions
    ├── SnapshotProgress.tsx     Inline live progress bars for in_production plans
    ├── PerformanceDashboard.tsx Analytics: trend, carry reasons, machines, chains
    ├── SnapshotViewer.tsx       Read-only plan data viewer
    ├── TableView.tsx            Week schedule table
    ├── CardView.tsx             Day-by-day card view
    ├── PipelineView.tsx         Pipeline/Gantt view
    ├── CapacityGapPanel.tsx     Machine capacity gap analysis
    ├── WeekCompletionSummary.tsx Done/carry/unscheduled summary
    ├── ControlBar.tsx           Save plan, export buttons
    ├── SchedulingToolbar.tsx    Balance mode, OT policy, shift controls
    ├── MachineConfigPanel.tsx   Machine CRUD
    ├── GlobalRatesPanel.tsx     kVA→hours rate tables
    ├── PerMachineRatesPanel.tsx Per-machine rate overrides
    ├── ManualShiftGrid.tsx      Manual night-shift day selection
    ├── ManualOtGrid.tsx         Manual OT day selection
    └── CustomShiftOtGrid.tsx    Per-machine custom hours grid
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/cutting-machines` | List all machines |
| POST | `/api/cutting-machines` | Create machine |
| PUT | `/api/cutting-machines/:id` | Update machine |
| DELETE | `/api/cutting-machines/:id` | Delete machine |
| GET | `/api/cutting-rates` | Global kVA→hrs table |
| PUT | `/api/cutting-rates` | Save global rates |
| GET/PUT | `/api/cutting-tmc-rates` | Cast Resin rates |
| GET/PUT | `/api/cutting-tr-power-rates` | TR Power rates |
| GET/PUT | `/api/cutting-class-h-rates` | Class H rates |
| GET | `/api/cutting-plan-snapshots` | List snapshots (last 50, no plan_data) |
| GET | `/api/cutting-plan-snapshots/:id` | Full snapshot with plan_data |
| POST | `/api/cutting-plan-snapshots` | Save new snapshot |
| PATCH | `/api/cutting-plan-snapshots/:id/status` | Transition status + optional result_summary |
| DELETE | `/api/cutting-plan-snapshots/:id` | Delete snapshot (any status) |
| PUT | `/api/orders/:id` | Update order fields (done_qty, plan_date, …) |

---

## Phase History

| Phase | Feature |
|---|---|
| 1 | Plan status lifecycle (draft→approved→in_production→completed→archived), timestamp tracking, lock indicator |
| 2 | Close Week Wizard (4-step modal), `done_at` auto-stamp on orders, `result_summary` storage |
| 3 | Live progress bars (SnapshotProgress), Performance History dashboard (PerformanceDashboard), carry chain detection |
| 4 | Auto carry-forward (shift unfinished orders to next Monday), snapshot conflict detection, planned vs actual accuracy (Early/On-Time/Late badges + delay_days in result_summary) |
