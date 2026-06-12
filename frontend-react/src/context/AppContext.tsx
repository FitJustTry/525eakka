import { createContext, useContext, useEffect, useReducer } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api'
import type { CuttingMachine, Employee, ItemCode, Order, Product, Snapshot, WCConfig } from '../types'
import { PRODUCTS } from '../data/products'
import { DEFAULT_WC_CONFIG, OPEN_LOAD } from '../data/wcConfig'
import { HOLIDAYS } from '../data/holidays'

interface AppState {
  loading: boolean
  backendOk: boolean
  orders: Order[]
  products: Record<string, Product>
  wcConfig: Record<string, WCConfig>
  openLoad: Record<string, number>
  holidays: Record<string, string>
  factoryHolidays: Record<string, string>
  cuttingMachines: CuttingMachine[]
  itemCodes: Record<string, ItemCode>
  employees: Record<string, Employee[]>
}

type Action =
  | { type: 'LOADED'; payload: Snapshot }
  | { type: 'BACKEND_DOWN' }
  | { type: 'SET_CUTTING_MACHINES'; machines: CuttingMachine[] }
  | { type: 'SET_ORDERS'; orders: Order[] }
  | { type: 'SET_WC_CONFIG'; wcConfig: Record<string, WCConfig> }
  | { type: 'SET_FACTORY_HOLIDAYS'; factoryHolidays: Record<string, string> }
  | { type: 'SET_ITEM_CODES'; itemCodes: Record<string, ItemCode> }
  | { type: 'SET_EMPLOYEES'; employees: Record<string, Employee[]> }
  | { type: 'SET_PRODUCTS'; products: Record<string, Product> }

function normalizeOrder(o: Order): Order {
  return {
    ...o,
    qty: parseInt(String(o.qty)) || 1,
    done_qty: parseInt(String(o.done_qty)) || 0,
    kva: o.kva == null ? 0 : parseInt(String(o.kva)) || 0,
    deadline: o.deadline ? String(o.deadline).slice(0, 10) : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    plan_date: o.plan_date ? String(o.plan_date).slice(0, 10) : null,
    comment: o.comment ?? '',
    sap_so: o.sap_so ?? '',
    customer: o.customer ?? '',
    category: o.category ?? '',
  }
}

function normalizeEmployees(raw: Record<string, unknown>): Record<string, Employee[]> {
  const out: Record<string, Employee[]> = {}
  Object.entries(raw).forEach(([wc, val]) => {
    if (Array.isArray(val)) {
      out[wc] = val as Employee[]
    } else if (val && typeof val === 'object' && 'employees' in val) {
      const { dept, employees: list } = val as { dept: string; employees: Employee[] }
      out[wc] = (list ?? []).map(e => ({ ...e, wc, dept: e.dept || dept || '' }))
    }
  })
  return out
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOADED': {
      const snap = action.payload
      const wcConfig = { ...DEFAULT_WC_CONFIG }
      if (snap.wc_config) Object.assign(wcConfig, snap.wc_config)

      const products = { ...PRODUCTS }
      if (snap.products) {
        Object.entries(snap.products).forEach(([k, v]) => {
          if (!products[k] && v.ops && v.ops.length > 0) products[k] = v
        })
      }

      const openLoad = { ...OPEN_LOAD }
      if (snap.open_load) Object.assign(openLoad, snap.open_load)

      const holidays = { ...HOLIDAYS }
      if (snap.holidays) Object.assign(holidays, snap.holidays)

      return {
        ...state,
        loading: false,
        backendOk: true,
        orders: Array.isArray(snap.accepted_orders) ? snap.accepted_orders.map(normalizeOrder) : [],
        products,
        wcConfig,
        openLoad,
        holidays,
        factoryHolidays: snap.factory_holidays ?? {},
        cuttingMachines: snap.cutting_machines ?? [],
        itemCodes: snap.item_codes ?? {},
        employees: normalizeEmployees(snap.employees ?? {}),
      }
    }
    case 'BACKEND_DOWN':
      return {
        ...state,
        loading: false,
        backendOk: false,
        products: PRODUCTS,
        wcConfig: DEFAULT_WC_CONFIG,
        openLoad: OPEN_LOAD,
        holidays: HOLIDAYS,
      }
    case 'SET_CUTTING_MACHINES':
      return { ...state, cuttingMachines: action.machines }
    case 'SET_ORDERS':
      return { ...state, orders: action.orders }
    case 'SET_WC_CONFIG':
      return { ...state, wcConfig: action.wcConfig }
    case 'SET_FACTORY_HOLIDAYS':
      return { ...state, factoryHolidays: action.factoryHolidays }
    case 'SET_ITEM_CODES':
      return { ...state, itemCodes: action.itemCodes }
    case 'SET_EMPLOYEES':
      return { ...state, employees: action.employees }
    case 'SET_PRODUCTS':
      return { ...state, products: { ...state.products, ...action.products } }
    default:
      return state
  }
}

const initial: AppState = {
  loading: true,
  backendOk: false,
  orders: [],
  products: PRODUCTS,
  wcConfig: DEFAULT_WC_CONFIG,
  openLoad: OPEN_LOAD,
  holidays: HOLIDAYS,
  factoryHolidays: {},
  cuttingMachines: [],
  itemCodes: {},
  employees: {},
}

interface AppContextValue { state: AppState; dispatch: React.Dispatch<Action> }
const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)

  useEffect(() => {
    api.snapshot()
      .then(snap => dispatch({ type: 'LOADED', payload: snap }))
      .catch(() => dispatch({ type: 'BACKEND_DOWN' }))
  }, [])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
