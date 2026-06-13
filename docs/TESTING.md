# Testing — Planning Engine Validation

Phase 8 added a Vitest test foundation for the **pure planning engines**, where
the regression risk is highest (shared forecasting/scheduling math feeding 13
views). Engines are pure functions, so tests are fast, deterministic, and run in
the `node` environment (no DOM).

## Running tests

```bash
npm test            # run once
npm run test:watch  # watch mode
npm run test:coverage  # run + coverage report (enforces thresholds)
```

Coverage HTML report is written to `coverage/index.html`.

## Structure

```
src/test/fixtures/        shared, realistic fixtures
  orders.ts               makeOrder() + itemCode(ch) (A/E/I=Foil, C/F/J=Wire) + SAMPLE_ORDERS
  workcenters.ts          real DEFAULT_WC_CONFIG + a round-number simpleWc
  routing.ts              routing_cr rows for buildDeptRates / buildRoutingCrRates
  snapshots.ts            closed-week SnapSample[] for calibration
  builders.ts             makePool() / makeWeeks() — hand-built horizons

src/tabs/DeptTab/shared/**         tests co-located beside the code under test
  *.test.ts                        deptRegistry, lvType, routingRates, sapRates, regression
  engines/*.test.ts                one per engine
```

Tests live next to the code (`foo.ts` → `foo.test.ts`). They are excluded from
the production build (`tsconfig.app.json`) and from coverage measurement.

## Determinism

Engines that read the calendar (`getWeekRange`) are tested under fake timers:

```ts
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00')) })
afterAll(() => { vi.useRealTimers() })
```

Order `plan_date`s are derived from `makeHorizonWeeks(...)[k].monStr` so they
always fall in the intended week regardless of the runner's timezone.

## Coverage requirements

Thresholds (in `vitest.config.ts`) — build fails below these:

| Metric | Min | Current |
|---|---|---|
| Statements | 80% | ~98% |
| Branches | 80% | ~81% |
| Functions | 80% | ~96% |
| Lines | 80% | ~99% |

Coverage is **scoped** to the pure logic (`shared/engines/**`, `deptRegistry`,
`lvType`, `sapRates`, `routingRates`) — React pages are intentionally excluded.

## Regression guards

`shared/regression.test.ts` pins business rules that must never drift:
Foil/Wire classification, risk thresholds (90/110/130), lead-time demand
placement, and ATP determinism. A failure there means a shared calculation
changed — review it deliberately.

## Adding a new engine test

1. Create `myEngine.test.ts` next to `myEngine.ts`.
2. `import { describe, it, expect } from 'vitest'` and the functions under test.
3. Prefer fixtures from `src/test/fixtures`; use `makePool`/`makeWeeks` for
   hand-built horizons, or drive `computeHorizon` for integration cases.
4. If the engine touches the calendar, wrap with fake timers (see above).
5. Add the engine's path to `coverage.include` in `vitest.config.ts` if new.
6. Keep ≥80% statements & branches.

## Known gap (pre-existing, out of Phase 8 scope)

`npm run build` runs `tsc -b && vite build`. The strict `tsc -b` pass reports
~59 errors in **pre-existing** untouched files (cutting components, ImportTab,
DataTab) — the app was historically built/shipped via `vite build` (esbuild,
which skips strict type-checking). All engines and files added/edited this
session are `tsc -b`-clean. Cleaning up the legacy strict errors is tracked
separately.
