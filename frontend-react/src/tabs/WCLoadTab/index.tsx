import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { getWeeklyCapacity, effectiveHrs } from '../../utils/capacity'
import { resolveProductKey, decodeItemInfo, planDateToWeekStart } from '../../utils/itemCodeDecode'
import type { Order, Product } from '../../types'

// ─── ZP group mapping (from knowledge.md + SAP routing) ───
const ZP_GROUP: Record<string, string> = {
  EE3102:'ZP11', EE3104:'ZP11', EE3105:'ZP11', EE3106:'ZP11', EE3107:'ZP11',
  EE3201:'ZP12', EE3202:'ZP12', EE3203:'ZP12',
  EE3501:'ZP13', EE3502:'ZP13', EE3503:'ZP13', EE3504:'ZP13', EE3505:'ZP13', EE3601:'ZP13',
  MP5101:'ZP14', MP5102:'ZP14', MP5103:'ZP14', MP5202:'ZP14',
  MP5304:'ZP14', MP5401:'ZP14', MP5402:'ZP14', MP5403:'ZP14', MP5601:'ZP14', MP5602:'ZP14', MP5603:'ZP14',
  EE3301:'ZP16', EE3302:'ZP16', EE3303:'ZP16', EE3403:'ZP16', PT3701:'ZP16',
  EE3401:'ZP17', EE3402:'ZP17',
  EE4201:'ZP18', EE4202:'ZP18', EE4204:'ZP18',
}
const ZP_COLOR: Record<string, string> = {
  ZP11:'var(--blue)', ZP12:'var(--green)', ZP13:'var(--txt3)',
  ZP14:'var(--amber)', ZP16:'var(--purple)', ZP17:'var(--red)', ZP18:'#3dc9b0',
}
const ZP_LABEL: Record<string, string> = {
  ZP11:'แกนเหล็ก', ZP12:'พันคอยล์', ZP13:'วัสดุ/ฉนวน',
  ZP14:'ตัวถัง', ZP16:'ประกอบ', ZP17:'ติดตั้ง', ZP18:'ทดสอบ',
}

// WCs that use oil — Cast Resin skips these
const OIL_WCS = new Set(['EE3303', 'EE3302', 'EE3107'])

type FlowType = 'A-SM' | 'A-L' | 'B' | 'C'
const FLOW_LABEL: Record<FlowType, string> = {
  'A-SM': 'Flow A — Oil-Immersed Standard (≤1000 kVA)',
  'A-L':  'Flow A — Oil-Immersed Large (1250–3500 kVA)',
  'B':    'Flow B — Cast Resin Dry-Type',
  'C':    'Flow C — Power Transformer (≥7000 kVA)',
}

interface OpStep {
  wc: string
  wcName: string
  hrsPerUnit: number
  totalHrs: number
  zpGroup: string
  source: 'base' | 'mp5304' | 'cast_resin' | 'special_s'
  label: string
  skipped: boolean
}

interface OrderRow {
  order: Order
  productKey: string
  decodedKva: number
  typeName: string
  hvLabel: string
  charLabel: string
  typeCode: string
  flowType: FlowType
  isSpecial: boolean
  isCastResin: boolean
  isLarge: boolean
  isPower: boolean
  isAluminum: boolean
  totalStdHrs: number
  wcHours: Record<string, number>
  opSteps: OpStep[]
}

interface ComputeOpts {
  specialCableBox: number
  specialControlWire: number
  mp5304Hrs: number
}

function getFlowType(typeCode: string, kva: number): FlowType {
  if (typeCode === '4') return 'B'
  if (kva >= 7000) return 'C'
  if (kva >= 1250) return 'A-L'
  return 'A-SM'
}

function computeOrderRow(order: Order, products: Record<string, Product>, opts: ComputeOpts): OrderRow {
  const info = decodeItemInfo(order.item_code ?? '')
  const resolvedKva = (info.kva && !isNaN(info.kva) ? info.kva : null) ?? (order.kva && !isNaN(order.kva) ? order.kva : 0)
  const productKey = resolveProductKey(order.item_code ?? '', order.kva)
  const product = products[productKey]
  const qty = order.qty

  const isCastResin = info.typeCode === '4'
  const isLarge = resolvedKva >= 1250 && resolvedKva <= 3500
  const isPower = resolvedKva >= 7000
  const flowType = getFlowType(info.typeCode, resolvedKva)

  const wcHours: Record<string, number> = {}
  const opSteps: OpStep[] = []

  if (product) {
    // 1. Base ops from product catalog
    for (const op of product.ops) {
      const zp = ZP_GROUP[op.wc] ?? 'ZP??'
      if (isCastResin && OIL_WCS.has(op.wc)) {
        opSteps.push({ wc: op.wc, wcName: op.name, hrsPerUnit: op.hrs, totalHrs: 0, zpGroup: zp, source: 'base', label: '(ข้าม — Cast Resin)', skipped: true })
        continue
      }
      const safeHrs = isNaN(op.hrs) || op.hrs == null ? 0 : op.hrs
      const total = safeHrs * qty
      wcHours[op.wc] = (wcHours[op.wc] ?? 0) + total
      opSteps.push({ wc: op.wc, wcName: op.name, hrsPerUnit: safeHrs, totalHrs: total, zpGroup: zp, source: 'base', label: '', skipped: false })
    }

    // 2. Cast Resin replacement ops (ZP16 EE3403)
    if (isCastResin) {
      const castHrs = resolvedKva >= 1000 ? 5.5 : 3.5
      const total = castHrs * qty
      wcHours['EE3403'] = (wcHours['EE3403'] ?? 0) + total
      opSteps.push({ wc: 'EE3403', wcName: 'ประกอบ Cast Resin', hrsPerUnit: castHrs, totalHrs: total, zpGroup: 'ZP16', source: 'cast_resin', label: 'ถอดหัว + ใส่ copper bar', skipped: false })
    }

    // 3. Large TR: MP5304 equipment prep (+3.69 h) — knowledge.md rule
    if (isLarge && opts.mp5304Hrs > 0) {
      const total = opts.mp5304Hrs * qty
      wcHours['MP5304'] = (wcHours['MP5304'] ?? 0) + total
      opSteps.push({ wc: 'MP5304', wcName: 'เตรียมอุปกรณ์', hrsPerUnit: opts.mp5304Hrs, totalHrs: total, zpGroup: 'ZP14', source: 'mp5304', label: `Large TR ${resolvedKva.toLocaleString()} kVA`, skipped: false })
    }

    // 4. Special S — Cable Box → EE3401
    if (info.isSpecial && opts.specialCableBox > 0) {
      const total = opts.specialCableBox * qty
      wcHours['EE3401'] = (wcHours['EE3401'] ?? 0) + total
      opSteps.push({ wc: 'EE3401', wcName: 'ติดตั้ง Cable Box', hrsPerUnit: opts.specialCableBox, totalHrs: total, zpGroup: 'ZP17', source: 'special_s', label: '+S Cable Box', skipped: false })
    }

    // 5. Special S — Control Wiring → EE3402
    if (info.isSpecial && opts.specialControlWire > 0) {
      const total = opts.specialControlWire * qty
      wcHours['EE3402'] = (wcHours['EE3402'] ?? 0) + total
      opSteps.push({ wc: 'EE3402', wcName: 'วงจรคอนโทรล', hrsPerUnit: opts.specialControlWire, totalHrs: total, zpGroup: 'ZP17', source: 'special_s', label: '+S Control Wiring (8–40h)', skipped: false })
    }
  }

  const totalStdHrs = Object.values(wcHours).reduce((a, b) => a + b, 0)
  return {
    order, productKey, decodedKva: resolvedKva,
    typeName: info.typeName, hvLabel: info.hvLabel, charLabel: info.charLabel,
    typeCode: info.typeCode, flowType,
    isSpecial: info.isSpecial, isCastResin, isLarge, isPower,
    isAluminum: info.isAluminum,
    totalStdHrs, wcHours, opSteps,
  }
}

// ── Styles ──
const DAY_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']
const thS: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', color: 'var(--txt3)', fontSize: 10, fontWeight: 600, background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2 }
const tdS: React.CSSProperties = { padding: '5px 10px', borderBottom: '0.5px solid var(--bord)', fontSize: 11 }
const monoS: React.CSSProperties = { ...tdS, fontFamily: 'var(--mono)' }
const inputS: React.CSSProperties = { width: 52, fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', fontFamily: 'var(--mono)' }

function pctColor(pct: number) { return pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)' }

function PctBar({ pct }: { pct: number }) {
  return (
    <div style={{ width: 72, height: 6, background: 'var(--bord2)', borderRadius: 3, overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}>
      <div style={{ width: `${Math.min(pct, 150) / 150 * 100}%`, height: '100%', background: pctColor(pct), borderRadius: 3 }} />
    </div>
  )
}

function Tag({ text, color, bg }: { text: string; color: string; bg: string }) {
  return <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700, color, background: bg, marginRight: 2 }}>{text}</span>
}

// ── Flow Card: per-item routing breakdown ──
function FlowCard({ row }: { row: OrderRow }) {
  const flowColor = row.isCastResin ? 'var(--amber)' : row.isPower ? 'var(--red)' : row.isLarge ? 'var(--blue)' : 'var(--green)'
  return (
    <div style={{ margin: '0 0 4px 0', background: 'var(--bg)', border: `1px solid var(--bord2)`, borderLeft: `4px solid ${flowColor}`, borderRadius: 6, padding: '10px 14px' }}>
      {/* Flow header */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: flowColor }}>{FLOW_LABEL[row.flowType]}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>{row.order.item_code || '—'}</span>
        <span style={{ fontSize: 10, color: 'var(--txt2)' }}>{(row.decodedKva || 0).toLocaleString()} kVA</span>
        <span style={{ fontSize: 10, color: 'var(--txt2)' }}>{row.typeName}</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{row.hvLabel}</span>
        {row.isSpecial   && <Tag text="S Special" color="var(--purple)" bg="rgba(180,101,232,.15)" />}
        {row.isAluminum  && <Tag text="Aluminum" color="var(--txt2)" bg="var(--bg3)" />}
        {row.isCastResin && <Tag text="Cast Resin" color="var(--amber)" bg="rgba(224,156,42,.15)" />}
        <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)' }}>
          {(isNaN(row.totalStdHrs) ? 0 : row.totalStdHrs).toFixed(2)} std hrs × {row.order.qty} unit
        </span>
      </div>

      {/* Steps table */}
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
        <thead>
          <tr>
            {['ZP','WC','ขั้นตอน / หมายเหตุ','ชม./unit',`× ${row.order.qty}u`,'ชม.รวม','ที่มา'].map(h => (
              <th key={h} style={{ ...thS, position: 'static', background: 'transparent', borderBottom: '1px solid var(--bord)', padding: '4px 8px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row.opSteps.map((step, i) => {
            const zp = step.zpGroup
            const zpColor = ZP_COLOR[zp] ?? 'var(--txt3)'
            const isModifier = step.source !== 'base'
            return (
              <tr key={i} style={{ opacity: step.skipped ? 0.35 : 1, background: isModifier ? 'rgba(137,180,250,.04)' : 'transparent' }}>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, fontWeight: 700, color: zpColor, background: `color-mix(in srgb, ${zpColor} 12%, transparent)` }}>
                    {zp}
                  </span>
                  <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 1 }}>{ZP_LABEL[zp] ?? ''}</div>
                </td>
                <td style={{ padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt2)', whiteSpace: 'nowrap' }}>{step.wc}</td>
                <td style={{ padding: '3px 8px', fontSize: 10, color: step.skipped ? 'var(--txt3)' : step.source === 'special_s' ? 'var(--purple)' : isModifier ? 'var(--amber)' : 'var(--txt)' }}>
                  {step.wcName}
                  {step.label && <span style={{ marginLeft: 6, fontSize: 9, color: isModifier ? zpColor : 'var(--txt3)' }}>{step.label}</span>}
                </td>
                <td style={{ padding: '3px 8px', fontFamily: 'var(--mono)', textAlign: 'right', color: step.skipped ? 'var(--txt3)' : 'var(--txt)' }}>{step.hrsPerUnit.toFixed(2)}</td>
                <td style={{ padding: '3px 8px', fontFamily: 'var(--mono)', textAlign: 'center', color: 'var(--txt3)', fontSize: 10 }}>{step.skipped ? '—' : `×${row.order.qty}`}</td>
                <td style={{ padding: '3px 8px', fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: isModifier ? 700 : 400, color: step.skipped ? 'var(--txt3)' : isModifier ? zpColor : 'var(--txt)' }}>
                  {step.skipped ? <span style={{ textDecoration: 'line-through', fontSize: 10 }}>{(step.hrsPerUnit * row.order.qty).toFixed(2)}</span> : step.totalHrs.toFixed(2)}
                </td>
                <td style={{ padding: '3px 8px' }}>
                  {step.source === 'base'       && !step.skipped && <Tag text="catalog" color="var(--txt3)"    bg="var(--bg3)" />}
                  {step.source === 'mp5304'     && <Tag text="+MP5304"  color="var(--blue)"   bg="rgba(137,180,250,.15)" />}
                  {step.source === 'cast_resin' && <Tag text="+CastR"   color="var(--amber)"  bg="rgba(224,156,42,.15)" />}
                  {step.source === 'special_s'  && <Tag text="+S"       color="var(--purple)" bg="rgba(180,101,232,.15)" />}
                  {step.skipped                 && <Tag text="skip"     color="var(--txt3)"   bg="var(--bg3)" />}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1px solid var(--bord2)', background: 'var(--bg3)' }}>
            <td colSpan={5} style={{ padding: '4px 8px', fontWeight: 700, fontSize: 10, color: 'var(--txt2)' }}>รวม std hrs</td>
            <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 700, color: 'var(--txt)', fontSize: 12 }}>{(isNaN(row.totalStdHrs) ? 0 : row.totalStdHrs).toFixed(2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Main Component ──
export default function WCLoadTab() {
  const { state } = useApp()
  const { orders, products, wcConfig } = state

  const [selectedWeek, setSelectedWeek]  = useState<string>('latest')
  const [view, setView]                   = useState<'wc' | 'items' | 'both'>('both')
  const [expandedDays,  setExpandedDays]  = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  // Modifier controls (knowledge.md rules)
  const [specialCableBox,    setSpecialCableBox]    = useState(8)
  const [specialControlWire, setSpecialControlWire] = useState(0)
  const [mp5304Hrs,          setMp5304Hrs]          = useState(3.69)

  const weeks = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) if (o.plan_date) set.add(planDateToWeekStart(o.plan_date))
    return [...set].sort()
  }, [orders])

  const effectiveWeek = selectedWeek === 'latest' ? (weeks[weeks.length - 1] ?? 'all') : selectedWeek

  const filteredOrders = useMemo(() =>
    effectiveWeek === 'all'
      ? orders.filter(o => o.plan_date)
      : orders.filter(o => o.plan_date && planDateToWeekStart(o.plan_date) === effectiveWeek),
    [orders, effectiveWeek]
  )

  const orderRows = useMemo(() =>
    filteredOrders.map(o => computeOrderRow(o, products, { specialCableBox, specialControlWire, mp5304Hrs })),
    [filteredOrders, products, specialCableBox, specialControlWire, mp5304Hrs]
  )

  const wcLoadMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of orderRows)
      for (const [wc, stdHrs] of Object.entries(row.wcHours))
        map[wc] = (map[wc] ?? 0) + effectiveHrs(wc, stdHrs, wcConfig)
    return map
  }, [orderRows, wcConfig])

  const wcSummary = useMemo(() => {
    const numWeeks = effectiveWeek === 'all' ? Math.max(weeks.length, 1) : 1
    return Object.entries(wcLoadMap).map(([wc, needed]) => {
      const cap = getWeeklyCapacity(wc, wcConfig)
      const available = cap.normal * numWeeks
      return { wc, name: wcConfig[wc]?.name ?? wc, needed, available, otAvail: cap.ot * numWeeks, pct: available > 0 ? Math.round(needed / available * 100) : 0 }
    }).sort((a, b) => b.pct - a.pct)
  }, [wcLoadMap, wcConfig, effectiveWeek, weeks])

  const totals = useMemo(() => ({
    orders: filteredOrders.length,
    qty: filteredOrders.reduce((s, o) => s + o.qty, 0),
    kva: filteredOrders.reduce((s, o) => s + o.kva * o.qty, 0),
    special: orderRows.filter(r => r.isSpecial).length,
    castResin: orderRows.filter(r => r.isCastResin).length,
    large: orderRows.filter(r => r.isLarge).length,
    noProduct: orderRows.filter(r => !r.productKey).length,
  }), [filteredOrders, orderRows])

  const ordersByDay = useMemo(() => {
    const map = new Map<string, OrderRow[]>()
    for (const row of orderRows) {
      const d = row.order.plan_date!
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(row)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [orderRows])

  const toggleDay  = (d: string) => setExpandedDays(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n })
  const toggleItem = (id: string) => setExpandedItems(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const expandAll  = () => setExpandedDays(new Set(ordersByDay.map(([d]) => d)))
  const collapseAll= () => { setExpandedDays(new Set()); setExpandedItems(new Set()) }

  if (orders.length === 0) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', fontSize: 13 }}>
      ยังไม่มีข้อมูล Master Plan — นำเข้าก่อนใน Import → Master Plan
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '1.25rem 1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>📊 WC Load — Item Code Calculator</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>คำนวณชั่วโมงงาน/WC จาก Item Code ตาม EN-T-001 + knowledge.md</div>
        </div>
        <select value={effectiveWeek} onChange={e => setSelectedWeek(e.target.value)}
          style={{ fontSize: 12, padding: '6px 10px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 8, color: 'var(--txt)', fontFamily: 'inherit', outline: 'none', marginLeft: 'auto' }}>
          <option value="all">ทุกสัปดาห์ ({weeks.length})</option>
          {weeks.map(w => <option key={w} value={w}>สัปดาห์ {w}</option>)}
        </select>
        {/* View toggle */}
        {(['both','wc','items'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: view === v ? 'var(--blue)' : 'var(--bg3)', color: view === v ? '#000' : 'var(--txt2)', cursor: 'pointer', fontWeight: view === v ? 700 : 400 }}>
            {v === 'both' ? '⚡+📋 ทั้งคู่' : v === 'wc' ? '⚡ WC Load' : '📋 รายการ'}
          </button>
        ))}
      </div>

      {/* Modifiers row */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, padding: '7px 12px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--bord)', fontSize: 11 }}>
        <span style={{ fontSize: 10, color: 'var(--txt3)', fontWeight: 600 }}>📐 MODIFIERS</span>
        <label style={{ display:'flex', alignItems:'center', gap:5, color:'var(--txt2)' }}>
          <Tag text="S" color="var(--purple)" bg="rgba(180,101,232,.15)" /> Cable Box → EE3401
          <input type="number" min={0} step={0.5} value={specialCableBox} onChange={e => setSpecialCableBox(parseFloat(e.target.value)||0)} style={inputS} /> hrs/u
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:5, color:'var(--txt2)' }}>
          <Tag text="S" color="var(--purple)" bg="rgba(180,101,232,.15)" /> Control Wiring → EE3402
          <input type="number" min={0} step={1} value={specialControlWire} onChange={e => setSpecialControlWire(parseFloat(e.target.value)||0)} style={inputS} /> hrs/u
          <span style={{ color:'var(--txt3)', fontSize:9 }}>(8–40)</span>
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:5, color:'var(--txt2)' }}>
          <Tag text="MP5304" color="var(--amber)" bg="rgba(224,156,42,.15)" /> 1250–3500 kVA
          <input type="number" min={0} step={0.1} value={mp5304Hrs} onChange={e => setMp5304Hrs(parseFloat(e.target.value)||0)} style={inputS} /> hrs/u
        </label>
      </div>

      {/* Summary */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
        {([
          { v:totals.orders,  l:'รายการ',   c:'var(--blue)' },
          { v:totals.qty,     l:'เครื่อง',  c:'var(--amber)' },
          { v:totals.kva.toLocaleString(), l:'kVA', c:'var(--txt2)' },
          totals.special   >0 ? {v:totals.special,  l:'Special S', c:'var(--purple)'} : null,
          totals.castResin >0 ? {v:totals.castResin,l:'Cast Resin', c:'var(--amber)'}  : null,
          totals.large     >0 ? {v:totals.large,    l:'Large TR',   c:'var(--blue)'}   : null,
          totals.noProduct >0 ? {v:totals.noProduct,l:'ไม่พบ product',c:'var(--red)'} : null,
        ].filter(Boolean) as {v:string|number;l:string;c:string}[]).map((c,i)=>(
          <div key={i} style={{padding:'4px 12px',borderRadius:20,background:'var(--bg3)',border:'1px solid var(--bord)',fontSize:11,display:'flex',gap:5}}>
            <span style={{fontFamily:'var(--mono)',fontWeight:700,color:c.c}}>{c.v}</span>
            <span style={{color:'var(--txt3)'}}>{c.l}</span>
          </div>
        ))}
      </div>

      {/* Main layout */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', gap:12 }}>

        {/* WC Load Table */}
        {(view==='wc'||view==='both') && (
          <div style={{ flex: view==='both' ? '0 0 460px' : 1, overflow:'auto', background:'var(--bg2)', border:'1px solid var(--bord)', borderRadius:8 }}>
            <table style={{ borderCollapse:'collapse', width:'100%' }}>
              <thead>
                <tr>
                  <th style={thS}>ZP</th>
                  <th style={thS}>WC</th>
                  <th style={thS}>ชื่อ</th>
                  <th style={{...thS,textAlign:'right'}}>ต้องการ (eff)</th>
                  <th style={{...thS,textAlign:'right'}}>ปกติ/สัปดาห์</th>
                  <th style={{...thS,textAlign:'right'}}>OT</th>
                  <th style={thS}>%</th>
                  <th style={thS}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {wcSummary.length===0 && <tr><td colSpan={8} style={{...tdS,color:'var(--txt3)',textAlign:'center',padding:24}}>ไม่มีข้อมูล</td></tr>}
                {wcSummary.map(({wc,name,needed,available,otAvail,pct}) => {
                  const zp = ZP_GROUP[wc] ?? ''
                  const zpColor = ZP_COLOR[zp] ?? 'var(--txt3)'
                  return (
                    <tr key={wc} style={{background: pct>=100 ? 'rgba(224,90,78,.04)' : 'transparent'}}>
                      <td style={{...tdS,padding:'5px 8px'}}>
                        {zp && <span style={{fontSize:9,padding:'2px 5px',borderRadius:3,fontWeight:700,color:zpColor,background:`color-mix(in srgb,${zpColor} 12%,transparent)`}}>{zp}</span>}
                      </td>
                      <td style={{...monoS,fontWeight:700,color:'var(--txt2)',fontSize:10}}>{wc}</td>
                      <td style={{...tdS,fontSize:10}}>{name}</td>
                      <td style={{...monoS,textAlign:'right',fontWeight:700,color:pctColor(pct)}}>{needed.toFixed(1)}</td>
                      <td style={{...monoS,textAlign:'right',color:'var(--txt3)'}}>{available.toFixed(1)}</td>
                      <td style={{...monoS,textAlign:'right',color:'var(--txt3)',fontSize:10}}>+{otAvail.toFixed(1)}</td>
                      <td style={tdS}><PctBar pct={pct}/></td>
                      <td style={tdS}>
                        <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,fontWeight:700,color:pctColor(pct),background:`color-mix(in srgb,${pctColor(pct)} 15%,transparent)`}}>
                          {pct}% {pct>=100?'เกิน':pct>=80?'ตึง':'OK'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {wcSummary.length>0 && (
                <tfoot>
                  <tr style={{borderTop:'2px solid var(--bord2)',background:'var(--bg3)'}}>
                    <td colSpan={3} style={{...tdS,fontWeight:700,fontSize:10}}>รวม {wcSummary.length} WC</td>
                    <td style={{...monoS,textAlign:'right',fontWeight:700}}>{wcSummary.reduce((s,r)=>s+r.needed,0).toFixed(1)}</td>
                    <td style={{...monoS,textAlign:'right',color:'var(--txt3)'}}>{wcSummary.reduce((s,r)=>s+r.available,0).toFixed(1)}</td>
                    <td colSpan={3}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Per-Item Flow Panel */}
        {(view==='items'||view==='both') && (
          <div style={{ flex:1, overflow:'auto', background:'var(--bg2)', border:'1px solid var(--bord)', borderRadius:8, padding: 0 }}>
            {/* Toolbar */}
            <div style={{ display:'flex', gap:8, alignItems:'center', padding:'8px 12px', borderBottom:'1px solid var(--bord2)', background:'var(--bg3)', position:'sticky', top:0, zIndex:3 }}>
              <span style={{ fontSize:11, fontWeight:600 }}>รายการ + Flow ต่อชิ้น</span>
              <button onClick={expandAll}   style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:'1px solid var(--bord2)',background:'var(--bg2)',color:'var(--txt2)',cursor:'pointer'}}>▼ Expand All</button>
              <button onClick={collapseAll} style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:'1px solid var(--bord2)',background:'var(--bg2)',color:'var(--txt2)',cursor:'pointer'}}>▲ Collapse All</button>
            </div>

            <div style={{ padding: '8px 12px' }}>
              {ordersByDay.map(([date, rows]) => {
                const d = new Date(date+'T00:00:00')
                const dayLabel = isNaN(d.getTime()) ? '' : DAY_TH[d.getDay()]
                const isDayExp = expandedDays.has(date)
                const dayQty = rows.reduce((s,r)=>s+r.order.qty,0)
                const dayHrs = rows.reduce((s,r)=>s+r.totalStdHrs,0)

                return (
                  <div key={date} style={{ marginBottom: 8 }}>
                    {/* Day header */}
                    <div onClick={() => toggleDay(date)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'rgba(137,180,250,.08)', borderRadius:6, border:'1px solid rgba(137,180,250,.18)', cursor:'pointer', userSelect:'none' }}>
                      <span style={{ fontSize:13, color:'var(--blue)' }}>{isDayExp ? '▼' : '▶'}</span>
                      <span style={{ fontFamily:'var(--mono)', fontWeight:700, fontSize:13, color:'var(--blue)' }}>📅 {date}</span>
                      <span style={{ fontSize:11, color:'var(--txt3)', fontWeight:600 }}>{dayLabel}</span>
                      <span style={{ fontSize:11, color:'var(--txt2)', marginLeft:4 }}>{rows.length} รายการ</span>
                      <span style={{ fontSize:11, color:'var(--amber)', fontFamily:'var(--mono)' }}>· {dayQty} ตัว</span>
                      <span style={{ fontSize:11, color:'var(--txt3)', fontFamily:'var(--mono)' }}>· {dayHrs.toFixed(1)} std hrs</span>
                    </div>

                    {/* Order rows */}
                    {isDayExp && (
                      <div style={{ marginLeft: 16, marginTop: 4, display:'flex', flexDirection:'column', gap:4 }}>
                        {rows.map((row, i) => {
                          const itemKey = `${date}-${i}`
                          const isItemExp = expandedItems.has(itemKey)
                          const rowColor = row.isCastResin ? 'var(--amber)' : row.isSpecial ? 'var(--purple)' : row.isLarge ? 'var(--blue)' : row.productKey ? 'var(--bord2)' : 'var(--red)'
                          return (
                            <div key={itemKey} style={{ border:`1px solid var(--bord)`, borderLeft:`3px solid ${rowColor}`, borderRadius:6, overflow:'hidden' }}>
                              {/* Item summary row */}
                              <div onClick={() => toggleItem(itemKey)}
                                style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', cursor:'pointer', background:'var(--bg3)', userSelect:'none', flexWrap:'wrap' }}>
                                <span style={{ fontSize:12, color:'var(--txt3)' }}>{isItemExp ? '▼' : '▶'}</span>

                                {/* SAP SO */}
                                <span style={{ fontFamily:'var(--mono)', fontWeight:700, color:'var(--amber)', fontSize:11, minWidth:90 }}>{row.order.sap_so || '—'}</span>

                                {/* Item code */}
                                <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--txt3)', minWidth:100 }}>{row.order.item_code || '—'}</span>

                                {/* kVA */}
                                <span style={{ fontFamily:'var(--mono)', fontWeight:700, color:'var(--blue)', fontSize:11 }}>{(row.decodedKva || 0).toLocaleString()} kVA</span>

                                {/* Type */}
                                <span style={{ fontSize:10, color:'var(--txt2)' }}>{row.typeName}</span>
                                <span style={{ fontSize:10, color:'var(--txt3)' }}>{row.hvLabel}</span>

                                {/* Flow badge */}
                                <Tag text={row.flowType} color={rowColor} bg={`color-mix(in srgb,${rowColor} 12%,transparent)`} />

                                {/* Flags */}
                                {row.isSpecial   && <Tag text="S"        color="var(--purple)" bg="rgba(180,101,232,.15)" />}
                                {row.isCastResin && <Tag text="CastR"    color="var(--amber)"  bg="rgba(224,156,42,.15)" />}
                                {row.isLarge     && <Tag text="Large"    color="var(--blue)"   bg="rgba(137,180,250,.15)" />}
                                {row.isAluminum  && <Tag text="Al"       color="var(--txt2)"   bg="var(--bg3)" />}
                                {!row.productKey && <Tag text="!Product" color="var(--red)"    bg="rgba(224,90,78,.15)" />}

                                <span style={{ marginLeft:'auto', fontFamily:'var(--mono)', fontWeight:700, fontSize:12 }}>
                                  {(isNaN(row.totalStdHrs) ? 0 : row.totalStdHrs).toFixed(2)} h
                                </span>
                                <span style={{ fontFamily:'var(--mono)', color:'var(--amber)', fontSize:11 }}>× {row.order.qty}u</span>
                              </div>

                              {/* Expanded: Full flow card */}
                              {isItemExp && (
                                <div style={{ padding:'10px 12px', background:'var(--bg)' }}>
                                  <FlowCard row={row} />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop:8, fontSize:10, color:'var(--txt3)' }}>
        * eff hrs = std hrs ÷ eff% · S EE3401 +{specialCableBox}h · S EE3402 +{specialControlWire}h · MP5304 +{mp5304Hrs}h (1250–3500kVA) · Cast Resin ข้าม EE3302/EE3303 ใช้ EE3403 · Design Status (Y/N/DCR) ยังไม่รวม lead time
      </div>
    </div>
  )
}
