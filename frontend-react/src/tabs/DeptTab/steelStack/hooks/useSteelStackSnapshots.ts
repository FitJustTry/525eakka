// Re-export from shared — keep this shim so any existing imports still resolve
export { useDeptSnapshots as useSteelStackSnapshots } from '../../shared/useDeptSnapshots'
export type { DeptSaveCtx as SaveCtx, SnapMeta, PlanStatus, ResultSummary } from '../../shared/useDeptSnapshots'
