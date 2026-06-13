import type { CuttingMachine, Employee, ItemCode, MachineDowntime, Order, Snapshot, WCConfig } from './types'

export type EmpDir = Record<string, { dept: string; employees: Employee[] }>

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  snapshot: () => request<Snapshot>('/snapshot'),

  orders: {
    batch: (orders: Order[]) =>
      request<Order[]>('/orders/batch', { method: 'POST', body: JSON.stringify(orders) }),
    delete: (id: string) =>
      request<void>(`/orders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    upsert: (order: Order) =>
      request<Order>('/orders', { method: 'POST', body: JSON.stringify(order) }),
    update: (id: string, patch: Partial<Order>) =>
      request<Order>(`/orders/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),
    batchWorkflowStatus: (ids: string[], workflow_status: string) =>
      request<Order[]>('/orders/workflow-status', { method: 'PATCH', body: JSON.stringify({ ids, workflow_status }) }),
  },

  cuttingMachines: {
    list: () => request<CuttingMachine[]>('/cutting-machines'),
    create: (m: Omit<CuttingMachine, 'id'>) =>
      request<CuttingMachine>('/cutting-machines', { method: 'POST', body: JSON.stringify(m) }),
    update: (id: number, m: Partial<Omit<CuttingMachine, 'id'>>) =>
      request<CuttingMachine>(`/cutting-machines/${id}`, { method: 'PUT', body: JSON.stringify(m) }),
    delete: (id: number) =>
      request<void>(`/cutting-machines/${id}`, { method: 'DELETE' }),
  },

  wcConfig: {
    update: (wc: string, cfg: WCConfig) =>
      request<void>(`/config/wc/${encodeURIComponent(wc)}`, { method: 'PUT', body: JSON.stringify(cfg) }),
  },

  factoryHolidays: {
    create: (date: string, name: string) =>
      request<void>('/factory-holidays', { method: 'POST', body: JSON.stringify({ date, name }) }),
    delete: (date: string) =>
      request<void>(`/factory-holidays/${encodeURIComponent(date)}`, { method: 'DELETE' }),
  },

  employees: {
    batch: (empDir: EmpDir) =>
      request<void>('/employees/batch', { method: 'POST', body: JSON.stringify(empDir) }),
  },

  itemCodes: {
    upsert: (code: string, data: ItemCode) =>
      request<void>(`/item-codes/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (code: string) =>
      request<void>(`/item-codes/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  },

  coilPlan: {
    batch: (rows: object[], weekStart: string) =>
      request<{ inserted: number; week_start: string }>('/coil-plan/batch', { method: 'POST', body: JSON.stringify({ rows, week_start: weekStart }) }),
    list: (weekStart?: string) =>
      request<object[]>('/coil-plan' + (weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : '')),
  },

  routingCr: {
    batch: (rows: object[]) =>
      request<{ inserted: number }>('/routing-cr/batch', { method: 'POST', body: JSON.stringify(rows) }),
    list: () => request<object[]>('/routing-cr'),
  },

  routingHv: {
    batch: (rows: object[]) =>
      request<{ inserted: number }>('/routing-hv/batch', { method: 'POST', body: JSON.stringify(rows) }),
    list: () => request<object[]>('/routing-hv'),
  },

  routingLv: {
    batch: (rows: object[]) =>
      request<{ inserted: number }>('/routing-lv/batch', { method: 'POST', body: JSON.stringify(rows) }),
    list: () => request<object[]>('/routing-lv'),
  },

  capRates: {
    batch: (rows: object[]) =>
      request<{ inserted: number }>('/cap-rates/batch', { method: 'POST', body: JSON.stringify(rows) }),
    list: () => request<object[]>('/cap-rates'),
  },

  /** Completed plan snapshots across all departments (calibration source). */
  deptSnapshotsAll: () => request<Record<string, unknown>[]>('/dept-plan-snapshots'),
  cuttingSnapshots: () => request<Record<string, unknown>[]>('/cutting-plan-snapshots'),

  /** Generic factory — creates station CRUD for any dept path, e.g. '/steel-stack-stations' */
  deptStations: (pathBase: string) => ({
    list: () => request<CuttingMachine[]>(pathBase),
    create: (m: Omit<CuttingMachine, 'id'>) =>
      request<CuttingMachine>(pathBase, { method: 'POST', body: JSON.stringify(m) }),
    update: (id: number, m: Partial<Omit<CuttingMachine, 'id'>>) =>
      request<CuttingMachine>(`${pathBase}/${id}`, { method: 'PUT', body: JSON.stringify(m) }),
    delete: (id: number) =>
      request<void>(`${pathBase}/${id}`, { method: 'DELETE' }),
  }),

  steelStackStations: {
    list: () => request<CuttingMachine[]>('/steel-stack-stations'),
    create: (m: Omit<CuttingMachine, 'id'>) =>
      request<CuttingMachine>('/steel-stack-stations', { method: 'POST', body: JSON.stringify(m) }),
    update: (id: number, m: Partial<Omit<CuttingMachine, 'id'>>) =>
      request<CuttingMachine>(`/steel-stack-stations/${id}`, { method: 'PUT', body: JSON.stringify(m) }),
    delete: (id: number) =>
      request<void>(`/steel-stack-stations/${id}`, { method: 'DELETE' }),
  },

  steelStackSnapshots: {
    list: () => request<object[]>('/steel-stack-snapshots'),
    get: (id: number) => request<Record<string, unknown>>(`/steel-stack-snapshots/${id}`),
    create: (data: object) => request<object>('/steel-stack-snapshots', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: number, status: string, result_summary?: object) =>
      request<object>(`/steel-stack-snapshots/${id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status, result_summary }),
      }),
    delete: (id: number) => request<void>(`/steel-stack-snapshots/${id}`, { method: 'DELETE' }),
  },

  downtime: {
    list: (machineId?: number) =>
      request<MachineDowntime[]>('/machine-downtime' + (machineId ? `?machine_id=${machineId}` : '')),
    create: (d: Omit<MachineDowntime, 'id' | 'created_at'>) =>
      request<MachineDowntime>('/machine-downtime', { method: 'POST', body: JSON.stringify(d) }),
    update: (id: number, d: Partial<Omit<MachineDowntime, 'id' | 'created_at' | 'machine_id'>>) =>
      request<MachineDowntime>(`/machine-downtime/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    delete: (id: number) =>
      request<void>(`/machine-downtime/${id}`, { method: 'DELETE' }),
  },
}
