# Factory Planning Platform — Build Log

> Repo: `525eakka` · frontend: `frontend-react` (Vite + React + TS) · backend: Express + PostgreSQL
> This documents the arc that turned the Cutting Scheduler into a full factory
> **decision-support platform**. Newest work first. Every item was verified with
> `tsc --noEmit` + `vite build`; all logic degrades gracefully when data is absent.

## Architecture at a glance

- **Config-driven departments.** Each downstream dept = a `DeptConfig` rendered by the
  generic `components/DeptSchedulerPage.tsx` (Daily/Weekly views, capacity, OT/Shift,
  carry-over, utilisation, plan snapshots, Close-Week). Adding a dept ≈ a folder + config.
- **One registry** `shared/deptRegistry.ts` — the single source of truth for cross-dept
  features: `DEPT_REGISTRY`, demand (`weekDemandByDept`), capacity pools
  (`getCapacityPools`), contributing orders (`ordersForDepts`), lead-time windows.
- **Pure engines** in `shared/engines/` (no React, no fetching) — all forecasting/decision
  logic lives here, never in pages:
  `forecastEngine` · `riskEngine` · `recommendationEngine` · `simulationEngine` ·
  `promiseEngine` · `calibrationEngine` · `materialEngine` · `kpiEngine` · `flowEngine`.
- **Rate sources:** core line → `routing_cr`; coil + assembly → `sap_routing`
  (`shared/sapRates.ts`). Capacity → `wcConfig` (workers × hours × eff).
- **Generic backend** `routes/dept.js` — `dept-stations/:dept` & `dept-plan-snapshots/:dept`
  keyed by `dept_id`, so new lines need no backend change.

---

## Phase 7 — APS / Planning Intelligence (most recent)

| Phase | Commit | What |
|---|---|---|
| **P1 — Lead-time + ATP** | `65da7aa` | `leadWeeks` per dept (core/coil 0, internal +1, external +2): downstream demand is placed in the week it actually lands, not the cutting plan-week — fixes the core multi-week accuracy bug. `promiseEngine.earliestShip()` + Risk-page ATP panel answers "take this order → when can we ship?" |
| **P2 — Closed-loop calibration** | `70b7f89` | `calibrationEngine` learns a per-dept **plan-attainment factor** from closed-week `completion_rate`; Risk page "🎯 ปรับด้วยค่าจริง" toggle scales capacity by it so the forecast self-corrects. Backend `GET /api/dept-plan-snapshots`. |
| **P3 — Material readiness** | `85522fb` | `materialEngine` classifies each order's components (`raw_mat/hv/lv/due_clamp/due_box_ctrl/due_store`) vs plan-date; 🧱 view flags orders **material-blocked** (component due after production). |
| **P5 — Management KPI / OTD** | `d81ba09` | `kpiEngine`: On-Time Delivery, throughput, lateness from `done_at` vs `deadline` + monthly trend; 📊 KPI view (Ops-Director). |
| **P4 — Order-Flow Timeline** | `ad7955b` | `flowEngine` projects each order across the pipeline by lead time + flags projected ship > deadline; 🗓 Flow view. **Deliberately a projection, NOT a finite-capacity optimiser** (downstream machine identities / setup times don't exist — a rushed solver would fabricate a false schedule). |

## Phase 6 — Factory Capacity Risk engine (`f2d435d`)

Decision-support dashboard (⚠ Risk) built entirely on pure engines:
risk heatmap (pool × week), auto-recommendations sized from the overload,
bottleneck (overall + per-week), 4/8-week horizon, and a digital-twin scenario
comparison (Current / +OT / +Shift / +OT+Shift / +20%).

## Coil department

| Commit | What |
|---|---|
| `5618f49` | Coil HV / LV-Foil / LV-Wire added to the **Forecast** as capacity departments (sap_routing hours, EE3201/3203/3202). |
| `41fc1f2` | Coil tab upgraded into a full **planning hub** (3-line KPI strip + per-line `DeptSchedulerPage`), reusing the framework. |
| `4e46918` | Foil/Wire scheduling made **order-accurate** by deriving LV type from the item-code characteristic (A/E/I=Foil, C/F/J=Wire) — `shared/lvType.ts`. |

## Assembly & Forecast foundation

| Commit | What |
|---|---|
| `01d81d3` | Internal/External Assembly as forecast-capacity depts (SAP hours, `workflowStage: null`). |
| `4112554` | Forecast bottleneck **drill-down** (click a cell → orders driving the load). |
| `e3e281b` | **What-if** capacity simulator on the Forecast. |
| `e17c319` | **Command Center / Overview** (KPIs, pipeline funnel, bottleneck, delivery-risk) + shared capacity math. |
| `77b422e` | **Factory Forecast** heatmap + interactive **WIP board**. |
| `bb7dc0c` | `workflow_status` handoff, generic dept backend routes, WIP pipeline. |

(Earlier in the session, before this log's commit range: the dept-scheduler
framework refactor — `DeptSchedulerPage`, `shared/types`, `useDeptSnapshots` —
and the Steel Shake/Stack/Clamp/No-Load configs.)

---

## Core sub-views (แผนกเหล็กแกน)

🏭 Overview · 🔧 ตัดโลหะ · 🌀 เขย่า · 🔩 เรียง · 🔨 แคลมป์ · ⚡ No Load ·
🗂 WIP · 📈 Forecast · ⚠ Risk · 🧱 วัตถุดิบ · 📊 KPI · 🗓 Flow · 📋 ตาราง WC.
Coil tab → 3-line planning hub. Assembly (inner/outer) → forecast-only.

## Honest limitations (carried deliberately)

1. **Not yet validated against the live backend + real data** in this environment
   (no PostgreSQL/data here). Smoke-test on a real instance is the open item.
2. **P4 is a lead-time projection**, not a finite-capacity optimiser.
3. **Lead-time (1/2 wk) & efficiency are estimates** — P2 calibration corrects efficiency
   from actuals as weeks close; lead-times are still fixed defaults.
4. **Material gating fires only where a real date parses** in the free-text component fields.
5. **WC-numbering note:** the live app uses the `sap_routing` scheme (EE3201 HV / EE3203 Foil /
   EE3202 Wire); the standalone routing-Excel `EE3205` is intentionally **not** used.
6. All compute is **client-side** over the order list — fine now, would need server-side
   planning at large scale.
