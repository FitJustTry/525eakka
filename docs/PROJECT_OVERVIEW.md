# Ekarat Capacity Planner — Project Overview

> Project: Transformer factory production planning system  
> Stack: React + TypeScript (Vite) + Node.js/Express + PostgreSQL  
> DB: `ekarat_capacity` on localhost:5432

---

## How to Run

```bash
# Backend (port 3000)
cd backend
node server.js

# Frontend (port 5173)
cd frontend-react
npm run dev
```

---

## Main Tabs

| Tab | Purpose |
|-----|---------|
| 🎯 Simulate | Capacity simulation based on WC config |
| 📥 Import | Import Master Plan, Coil Plan, SAP Routing, Employees |
| 📋 Orders | View/edit accepted orders |
| 📅 Plan | Production schedule + daily kVA summary |
| ⚡ Capacity | WC capacity analysis |
| 📊 Gantt | Gantt chart view |
| 🔥 Load | WC load board |
| 📦 Catalog | Product catalog |
| 👷 พนักงาน | Employee management |
| ⏱ Time | Time dashboard |
| 🏭 แผนก | Department plan (cutting machines, coil machines) |
| 🔑 Item Code | Item code decoder |
| 🔢 EN-T-001 | Transformer code guide |
| 📋 SAP Routing | SAP routing catalog |
| 📆 Calendar | Holiday calendar |
| 📊 WC Load | Work center load |
| 📡 SAP Hours | SAP-based WC hours |
| 🗄 Data | Full DB viewer |
| ⚙ Settings | App settings |

---

## Key Data Tables (PostgreSQL)

| Table | Contents |
|-------|---------|
| `accepted_orders` | Master plan orders (all 24 coil plan fields) |
| `coil_plan` | Raw coil plan import data |
| `plan_orders` | Plan detail orders |
| `sap_routing` | SAP routing operations (44 columns via extra JSONB) |
| `work_centers` | WC config (workers, hrs, eff) |
| `cutting_machines` | Metal cutting machine config |
| `coil_machines` | Coil winding machine config |
| `cutting_rates` | Global kVA → hours rates (from SAP EE3102) |
| `cutting_plan_snapshots` | Saved cutting machine plans |
| `employees` | Employee directory |
| `holidays` / `factory_holidays` | Holiday calendars |
| `item_codes` | Item code catalog |
| `products` | Product definitions |

---

## EN-T-001 Item Code Format

```
AB CDEF GH I JKL  (no spaces in DB)
```

| Position | Meaning |
|----------|---------|
| A | Factory (5=Ekarat) |
| B | Type: 1/2/3=Oil, 4=Cast Resin, P/Q/R/W/T/U=Thepharak |
| C | kVA exponent |
| DEF | kVA mantissa → kVA = DEF × 10^C / 1000 |
| GH | HV voltage code |
| I | Characteristic: S=Special, H=Al HV, L=Both Al |
| JKL | Sequential number |

**Example:** `5143502228` → B=1(Oil), C=4, DEF=350 → 350×10⁴/1000 = **3500 kVA**

---

## Production Flows

| Flow | Condition | Key WCs |
|------|-----------|---------|
| A-SM | Oil ≤1000kVA | EE3102→EE3201→EE3301→... |
| A-L | Oil 1250–3500kVA + MP5304 | Same + MP5304 |
| B | Cast Resin (type 4) | Skips oil WCs, adds EE3403 |
| C | Power ≥7000kVA | PT3701 |

---

## Import Workflows

### Master Plan (main)
`Import → Master Plan` → parses coil plan Excel → saves to `accepted_orders`

### Coil Plan (raw data)
`Import → Coil Plan` → saves raw rows to `coil_plan` (for display only)

### SAP Routing
`Import → SAP` → loads 44-column SAP routing data → `sap_routing` table

### Employees
`Import → พนักงาน` → `employees` table
