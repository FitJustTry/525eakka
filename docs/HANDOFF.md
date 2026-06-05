# Handoff — Complete Codebase Guide for Next AI

> Written: 2026-06-05
> For: next AI assistant continuing this project at home
> Read this first. Then read CUTTING_MACHINE_LOGIC.md and SAP_ROUTING.md for deep detail.

---

## How to Run

```bash
# Backend (port 3000)
cd backend && node server.js

# Frontend (port 5173, or next available)
cd frontend-react && npm run dev
```

DB credentials in `backend/.env`:
```
DATABASE_URL=postgres://postgres:FitZaTH02@localhost:5432/ekarat_capacity
```

**Important:** The server.js sometimes tries `ekarat_user` from env vars — always start from the `backend/` directory so it picks up `.env` correctly.

---

## App Overview

19-tab React app for Ekarat transformer factory production planning.

| Tab ID | Label | Purpose |
|--------|-------|---------|
| `simulate` | 🎯 Simulate | What-if capacity simulator — pick product + qty, checks if deadline feasible |
| `import` | 📥 Import | Upload Master Plan Excel + SAP Routing CSV |
| `orders` | 📋 Orders | View/edit/search accepted orders |
| `plan` | 📅 Plan | Weekly production schedule summary with dept load |
| `capacity` | ⚡ Capacity | Daily WC load grid per week |
| `gantt` | 📊 Gantt | Timeline bar chart of all orders |
| `load` | 🔥 Load | LoadBoardTab (not fully explored) |
| `catalog` | 📦 Catalog | Product routing catalog + SAP routing flow viewer |
| `employees` | 👷 พนักงาน | Staff roster by department |
| `timedash` | ⏱ Time | TimeDashTab (not fully explored) |
| `dept` | 🏭 แผนก | **Cutting machine plan** (main scheduling tab) + Coil machines |
| `itemdecode` | 🔑 Item Code | Item code catalog management |
| `transcode` | 🔢 EN-T-001 | Item code decoder/guide |
| `saprouting` | 📋 SAP Routing | SapRoutingTab (not fully explored) |
| `calendar` | 📆 Calendar | Factory holiday management |
| `wcload` | 📊 WC Load | WC load from product catalog routing |
| `sapwcload` | 📡 SAP Hours | WC load from SAP routing (same as wcload but uses SAP data) |
| `data` | 🗄 Data | Admin panel — view/edit all DB tables inline |
| `settings` | ⚙ Settings | Work center config (workers, hours, efficiency %) |

---

## Global State (AppContext)

```typescript
AppState {
  loading: boolean
  backendOk: boolean
  orders: Order[]
  products: Record<string, Product>          // keyed by product_id e.g. "tr.3500kVA"
  wcConfig: Record<string, WCConfig>         // keyed by WC ID e.g. "EE3102"
  openLoad: Record<string, number>           // pre-committed hours per WC
  holidays: Record<string, string>           // Thai gov holidays (date → name)
  factoryHolidays: Record<string, string>    // factory overrides (date → name or '__WORKDAY__')
  cuttingMachines: CuttingMachine[]
  itemCodes: Record<string, ItemCode>
  employees: Record<string, Employee[]>      // keyed by dept code
}
```

Actions: `LOADED`, `BACKEND_DOWN`, `SET_CUTTING_MACHINES`, `SET_ORDERS`, `SET_WC_CONFIG`, `SET_FACTORY_HOLIDAYS`, `SET_ITEM_CODES`, `SET_EMPLOYEES`, `SET_PRODUCTS`

Holiday override: `factoryHolidays[date] = '__WORKDAY__'` marks a government holiday as a working day.

---

## Key Data Types

```typescript
Order {
  id: string; sap_so?: string; customer: string; kva: number; qty: number
  item_code?: string; product: string (bucket key e.g. "tr.3500kVA")
  plan_date?: string; deadline: string; category: string
  raw_mat?: string; lv?: string; hv?: string
  total_kva?: number
}

Product {
  label: string; std_hrs: number; kva: number
  ops: ProductOp[]  // { wc, name, hrs }  ← STATIC seed data, not from SAP
}

WCConfig {
  name: string; workers: number; hrs: number; ot: number
  sat_hrs: number; sat_ot: number; eff: number  // efficiency 0-100
}

CuttingMachine {
  id: number; name: string; count: number
  min_kva: number; max_kva: number; hrs_per_unit: number
  laser: boolean; m4: boolean
  drill_8mm: boolean; drill_22mm: boolean
  reg_hrs: number; ot_hrs: number
  wc_id?: string; off_days?: number[]
  rates?: CuttingRate[]      // per-machine kVA→hours (overrides global)
  time_mul?: number          // speed multiplier default 1.0
  tmc_hrs?: number           // Cast Resin TMC fallback hours default 0
  tmc_rates?: CuttingRate[]  // per-machine TMC by kVA (Cast Resin)
}
```

---

## Item Code Format (EN-T-001)

```
AB CDEF GH I JKL   (10-12 chars, no spaces)
```

| Pos | Field | Values |
|-----|-------|--------|
| 0 | A | Factory: 5=Ekarat |
| 1 | B | Type: 1=Conservator, 2=N2 Sealed, 3=Hermetic Oil, 4=Cast Resin, 9=1-Phase |
| 2 | C | kVA exponent |
| 3-5 | DEF | kVA mantissa → `kVA = DEF × 10^C / 1000` |
| 6-7 | GH | HV voltage code: 22=22kV, 33=33kV |
| 8 | I | Characteristic: S=Special, H=Al HV, L=Both Al |
| 9+ | JKL | Sequential number |

Example: `5143502228` → B=1(Oil), C=4, DEF=350 → **3500 kVA**

`decodeItemInfo(itemCode)` in `utils/itemCodeDecode.ts` returns `{ kva, typeCode, typeName, hvLabel, characteristic, isSpecial, isAluminum }`

**Product bucket**: `kvaToProductKey(kva)` maps any kVA to a bucket like `tr.630kVA` (≤630kVA). This is NOT the actual kVA — always use `order.kva` for calculations.

---

## Cutting Machine Plan (แผนการตัดโลหะ)

**File:** `frontend-react/src/tabs/DeptTab/CuttingMachines.tsx` (~2400 lines)

### Cutting Time Formula

```
getHrsForKva(machine, kVA, globalRates, itemCode):

  if itemCode[1] === '4' (Cast Resin):
    check machine.tmc_rates[kVA]  → use if found
    check machine.tmc_hrs > 0     → use if set
    else fall through to normal kVA rate

  normal rate:
    check machine.rates[kVA]      → machine-specific, highest priority
    check globalRates[kVA]        → from SAP EE3102
    else machine.hrs_per_unit     → fallback

  apply: result × machine.time_mul + machine.tmc_hrs
```

### 21 Scheduling Modes

3 OT policies × 7 sort strategies:
- OT: ❌ none / ⚠️ smart (only when needed) / 🔥 always
- Sort: 📅 Daily / 🗓 Weekly / 🏎 Fastest / 📅 Deadline / ⭐ Priority / 🔮 Next week / 🔗 Batch kVA

Shared pool: all machines pull from one pool simultaneously (not pre-assigned). Once claimed, stays with that machine.

In 🏎 fastest mode: each machine picks the unit it can finish FASTEST (not just first in LPT pool).

### Toggles
- **🔒 Wire Match** — LS raw_mat → laser machine, M4 raw_mat → M4 machine (one-directional hard block)
- **🔩 เจาะ ≥315kVA** — orders ≥315kVA must go to drill machines

### UI Sections (in order)
1. Machine config table (name, kVA range, drill, laser/M4, hours, ×Rate, TMC, off-days)
2. ⏱ Global cutting rates (kVA→hours, load from SAP EE3102)
3. ⏱ Per-machine cutting rates (override per machine, 📋 copy from standard)
4. ⏱ Per-machine TMC rates (Cast Resin by kVA per machine)
5. 📤 Export dropdown (CSV / Excel / Text / Print / JSON)
6. Weekly schedule (21 mode selector + card/table/pipeline views)

---

## Production Flows (WC Load tabs)

**A-SM**: Oil ≤1000kVA → EE3102→EE3104→EE3105→EE3106→EE3107→EE3201→EE3301→EE3302→EE3303→EE3401→EE4201→EE4202
**A-L**: Oil 1250–3500kVA → same + MP5304 equipment prep
**B**: Cast Resin → skip oil WCs (EE3302/EE3303/EE3107), add EE3403 (head removal)
**C**: Power ≥7000kVA → PT3701

ZP Groups: ZP11(Core), ZP12(Coil), ZP13(Material), ZP14(Tank), ZP16(Assembly), ZP17(Fitting), ZP18(Testing)

---

## SAP Routing

**Table:** `sap_routing` (11,388+ rows)
**Import:** Import → SAP tab → upload SAP_Routing.csv

Key columns: `order_no`, `material_code`, `wc_id`, `operation`, `std_hrs`, `is_confirmed`, `extra.MaterialDescription`

**Endpoints:**
```
GET /api/sap-routing/catalog           — all materials grouped with ops + desc
GET /api/sap-routing/by-kva?kva=3500  — routing for specific kVA (averaged)
GET /api/sap-routing/search?q=xxx     — search by order_no/material/desc/wc/op
GET /api/sap-routing/rates-by-kva     — kVA→hours for cutting rates (EE3102)
GET /api/sap-routing/summary          — per-WC op counts
```

**Product Catalog routing** (`products.ops`) is **STATIC SEED DATA** — not from SAP. Always prefer SAP routing when available.

---

## Department Colors (INCONSISTENT across tabs)

Each tab uses slightly different colors/keys. When building anything new that shows departments, pick one consistent set. Recommended:

| Dept | Key | Color |
|------|-----|-------|
| แกนเหล็ก (Core) | core/EE31 | #89b4fa (blue) |
| พันคอยล์ (Coil) | coil/EE32 | #a6e3a1 (green) |
| ฉนวน (Insulation) | ins/EE35/EE36 | #cba6f7 (purple) |
| ประกอบ (Assembly) | asm/EE33 | #f9e2af (amber) |
| ติดอุปกรณ์ (Fitting) | fit/EE34 | #fab387 (peach) |
| ทดสอบ (Testing) | test/EE40 | #f38ba8 (pink) |
| ตัวถัง (Tank) | tank/MP51 | #89dceb (cyan) |
| พ่นสี (Paint) | paint/MP54 | #94e2d5 (teal) |
| Power TR | power/PT37 | #b4befe (lavender) |

---

## Known Bugs & Pending Work

### HIGH PRIORITY

**1. Department color inconsistency** across SimulateTab, GanttTab, CapacityTab, PlanTab, SapWCLoadTab — all use different color values for same departments. Should be centralized in one shared constant.

**2. products.ops is static hardcoded data** — the Product Catalog shows routing with hours from seed data (`backend/server.js` lines ~719+). These are NOT from SAP. When user imports SAP routing, these ops are not updated. Need to either:
- Populate `products.ops` from `sap_routing` during import
- Or clearly show "estimated" label everywhere these are displayed

**3. Machine carry-over redistribution** — when a machine is OFF on Saturday with in-progress work, that work stays locked to it (doesn't redistribute). A clean fix requires tracking partial hours per order separately from the `taken` set.

**4. ImportTab TypeScript errors** — `ParsedCoilRow[]` type errors + unused variables. These don't cause runtime issues but fail the strict build. Fix: clean up unused state variables and fix ParsedCoilRow type.

### MEDIUM PRIORITY

**5. Machine 5 (50-250kVA) underutilization** — limited kVA range means few eligible orders. In 🏎 fastest mode it often finishes Monday with 6h/44h for the week. Suggestion: allow the factory to configure the kVA range to expand it.

**6. No error boundaries** — if any tab component crashes, the whole app goes blank. Add React `<ErrorBoundary>` around each tab. The WCLoadTab NaN crash was a symptom of this.

**7. openLoad not well documented** — `wcConfig.openLoad` is a pre-committed hours map but it's unclear how/where it's updated. Check `api.snapshot()` and how open orders affect this.

**8. employees is read-only** — EmployeesTab has no edit/add capability. User must use DataTab to modify employees.

### LOW PRIORITY

**9. Calendar inline edit uses `prompt()`** — bad UX. Should use an inline input field.

**10. SAP catalog search max 200 results** — add pagination for large datasets.

**11. SimulateTab "เจรจา Deadline"** — the negotiate-deadline button doesn't actually implement negotiation logic (just exists as a UI element).

**12. No keyboard shortcuts** — tab navigation only by mouse click.

---

## API Reference (Backend Routes)

### Orders
```
GET    /api/initial-data              → full app snapshot
GET    /api/orders
PUT    /api/orders/:id
DELETE /api/orders/:id
POST   /api/orders/upsert             → create or update by SAP SO
```

### Cutting Machines
```
GET    /api/cutting-machines
POST   /api/cutting-machines
PUT    /api/cutting-machines/:id
DELETE /api/cutting-machines/:id
```

### SAP Routing
```
GET    /api/sap-routing               → raw rows (filter by wc_id or order_no)
POST   /api/sap-routing/batch         → bulk import
GET    /api/sap-routing/catalog       → grouped by material
GET    /api/sap-routing/by-kva        → routing for specific kVA
GET    /api/sap-routing/search        → full-text search
GET    /api/sap-routing/rates-by-kva  → kVA→hours for EE3102
GET    /api/sap-routing/summary       → per-WC counts
```

### Cutting Rates (global)
```
GET    /api/cutting-rates
PUT    /api/cutting-rates             → replace all rates
```

### WC Config
```
PUT    /api/config/wc/:wc_id
```

### Other
```
GET/POST/DELETE  /api/factory-holidays/:date
GET/PUT/DELETE   /api/item-codes/:code
GET/POST/DELETE  /api/employees, /api/employees/flat
GET              /api/products
GET              /api/cutting-plan-snapshots
POST             /api/cutting-plan-snapshots
GET/DELETE       /api/cutting-plan-snapshots/:id
```

---

## Shared Utilities

**`utils/itemCodeDecode.ts`:**
- `decodeKva(fullItemCode)` — extracts kVA from full item code (positions [2] and [3..5])
- `decodeItemInfo(itemCode)` — returns `{ kva, typeCode, typeName, hvLabel, characteristic, isSpecial, isAluminum }`
- `kvaToProductKey(kva)` — maps kVA to bucket key
- `resolveProductKey(itemCode, fallbackKva)` — decode + map in one step
- `planDateToWeekStart(isoDate)` — returns Monday of that week

**`utils/capacity.ts`** (assumed, not read):
- `effectiveHrs(std, eff)` — `std / (eff/100)`
- `getWeeklyCapacity(wc, wcConfig)`
- `scheduleOrders(orders, products, wcConfig, holidays, factoryHolidays)`
- `getCommittedLoadMap(orders, products, wcConfig)`
- `addWorkDaysReal(date, days, holidays)`

---

## Files Changed This Session

| File | Summary of Changes |
|------|--------------------|
| `DeptTab/CuttingMachines.tsx` | time_mul, tmc_hrs, tmc_rates, Wire Match toggle, Drill ≥315kVA toggle, Cast Resin uses TMC, 🏎 fastest picks fastest unit per machine, export dropdown (CSV/Excel/TXT/Print/JSON), Balance: label, day header actual vs planned, mLabel fallback, per-machine rate panels with copy button, TMC rate panels |
| `CatalogTab/index.tsx` | Full rewrite: ⚙️ SAP Routing mode, real routing flow pipeline, live search by order no/material/WC, order_nos display |
| `WCLoadTab/index.tsx` | NaN guards on op.hrs + decodedKva + display |
| `OrdersTab/index.tsx` | Extended search: kVA, raw_mat, product |
| `TranscodeTab/index.tsx` | Fixed decodeKva(CDEF) → decodeKva(code) bug |
| `types.ts` | Added time_mul, tmc_hrs, tmc_rates to CuttingMachine |
| `backend/server.js` | New endpoints (by-kva, search), enhanced catalog endpoint, time_mul/tmc_hrs/tmc_rates in machine API, tmc_rates DB column |

---

## Where to Continue

The user works on this from home. Suggested next sessions in order of impact:

1. **Fix department color inconsistency** — centralize DEPT_COLORS in a shared file, use everywhere
2. **Wire products.ops to SAP routing** — on SAP import, update products.ops from sap_routing grouped by kVA bucket
3. **Add React ErrorBoundary** — wrap each tab so one crash doesn't blank the whole app
4. **Fix ImportTab TypeScript errors** — clean up unused vars, fix ParsedCoilRow type
5. **Machine carry-over redistribution** — when machine is off, released work should be pickable by other machines (careful with floating point)
6. **Employees edit capability** — add inline editing to EmployeesTab (currently read-only)
7. **Calendar inline edit** — replace `prompt()` with inline input field
