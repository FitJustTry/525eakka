import type { CuttingMachine, Employee, ItemCode, Order, Snapshot, WCConfig } from './types'

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
}
