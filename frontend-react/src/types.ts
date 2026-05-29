export interface ProductOp { wc: string; name: string; hrs: number }

export interface Product {
  label: string; std_hrs: number; kva: number; ops: ProductOp[]
}

export interface WCConfig {
  name: string; workers: number; hrs: number; ot: number
  sat_hrs: number; sat_ot: number; eff: number
}

export interface Order {
  id: string; product: string; qty: number; deadline: string
  customer: string; kva: number; category: string; sap_so: string
  plan_date: string | null; comment: string; item_code?: string
  week_start?: string; seq?: number; plant?: string; electrical?: string
  total_kva?: number; enter_test?: string; cable_box?: string; control?: string
  due_store?: string; due_so?: string; adjust_plan?: string; due_clamp?: string
  due_box_ctrl?: string; raw_mat?: string; lv?: string; hv?: string
}

export interface CuttingRate { kva: number; hrs: number }

export interface CuttingMachine {
  id: number; name: string; count: number
  min_kva: number; max_kva: number; hrs_per_unit: number
  laser: boolean; m4: boolean
  min_face_mm: number; max_face_mm: number
  drill_8mm: boolean; drill_22mm: boolean; notes: string
  reg_hrs: number    // regular working hours per day (default 8)
  ot_hrs: number     // max OT hours per day (default 4)
  rates?: CuttingRate[]   // per-kVA cutting hours (overrides hrs_per_unit when matched)
}

export interface ItemCode { description: string; category: string }

export interface PlanOrder {
  id: number
  week_start: string | null
  plan_date: string | null
  seq: number
  sap_so: string
  item_code: string
  product: string
  customer: string
  kva: number
  qty: number
  deadline: string | null
  face_mm: number | null
  electrical: string
  hv: string
  lv: string
  comment: string
  category: string
}

export interface Employee {
  id: string; name: string; dept: string; title: string
  wc: string; is_active: boolean; is_head: boolean
}

export interface Snapshot {
  wc_config: Record<string, WCConfig>
  products: Record<string, Product>
  open_load: Record<string, number>
  holidays: Record<string, string>
  factory_holidays: Record<string, string>
  accepted_orders: Order[]
  cutting_machines: CuttingMachine[]
  item_codes?: Record<string, ItemCode>
  employees?: Record<string, Employee[]>
}

export type TabId =
  | 'simulate' | 'import' | 'orders' | 'catalog' | 'employees'
  | 'timedash' | 'dept' | 'load' | 'gantt' | 'plan'
  | 'capacity' | 'itemdecode' | 'transcode' | 'saprouting'
  | 'calendar' | 'settings' | 'data' | 'wcload' | 'sapwcload'
