# Winding Department (แผนกพันคอยล์) — Reference

> `WindingPage.tsx`  WCs: EE3201–EE3203, EE3501–EE3505, EE3601

## Current state
`WindingPage.tsx` manages coil winding machine configuration (CRUD via `/api/coil-machines`).
No scheduling algorithm yet — see `cutting/CUTTING_MACHINES.md` for the engine pattern to follow.

## Machine fields
| Field | Description |
|---|---|
| `type` | HV / LV / HV+LV / Foil / Cast Resin |
| `wire` | ทองแดง / อะลูมิเนียม / Foil Cu / Foil Al |
| `hv_lv` | HV / LV / HV+LV |
| `hrs_per_unit` | Base hours per transformer unit |
| `off_days` | Days of week machine is off (1=Mon … 6=Sat) |

## Future improvements
- Scheduling algorithm (similar to cutting `engine.ts` but with winding-specific constraints)
- Wire type capacity planning
- Per-machine daily hour targets
