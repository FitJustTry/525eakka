# Ekarat Docs

Documentation for the Ekarat Capacity Planner project.

## Files

| File | Contents |
|------|---------|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | System overview, tabs, DB tables, item code format, production flows |
| [CUTTING_MACHINE_LOGIC.md](CUTTING_MACHINE_LOGIC.md) | All 21 cutting machine scheduling modes, OT logic, shared pool, data flow |
| [IMPORT_GUIDE.md](IMPORT_GUIDE.md) | How to import Master Plan, SAP Routing, and other data |

## Quick Reference

**Run the app:**
```bash
cd backend && node server.js          # port 3000
cd frontend-react && npm run dev      # port 5173
```

**Key concepts:**
- `accepted_orders` = Master Plan data (used for all planning calculations)
- `cutting_rates` = SAP EE3102 hours per kVA size (load this first!)
- `off_days` = days a cutting machine doesn't work (affects scheduling)
- Shared pool = all machines draw from same order list (not pre-assigned)
