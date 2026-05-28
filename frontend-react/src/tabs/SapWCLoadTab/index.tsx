import { useEffect, useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { decodeItemInfo } from '../../utils/itemCodeDecode'
import type { Order } from '../../types'

// ── ZP group / color / label ─────────────────────────────────────────────────
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

// WCs skipped for Cast Resin (oil-related)
const OIL_WCS = new Set(['EE3303', 'EE3302', 'EE3107'])

type FlowType = 'A-SM' | 'A-L' | 'B' | 'C'
const FLOW_LABEL: Record<FlowType, string> = {
  'A-SM': 'Flow A — Oil ≤1000 kVA',
  'A-L':  'Flow A — Oil Large 1250–3500 kVA',
  'B':    'Flow B — Cast Resin (Type 4)',
  'C':    'Flow C — Power TR ≥7000 kVA',
}
const FLOW_COLOR: Record<FlowType, string> = {
  'A-SM': 'var(--green)', 'A-L': 'var(--blue)', 'B': 'var(--amber)', 'C': 'var(--red)',
}

type OpSource = 'sap' | 'mp5304' | 'cast_resin' | 'special_s' | 'skipped'

interface OpStep {
  wc: string
  opName: string
  hrsPerUnit: number
  totalHrs: number
  zp: string
  source: OpSource
  skipped: boolean
}

interface OrderRow {
  order: Order
  flow: FlowType
  kva: number
  typeCode: string
  isSpecial: boolean
  isCastResin: boolean
  isLarge: boolean
  isPower: boolean
  isAluminum: boolean
  matMatched: boolean   // found in SAP catalog
  steps: OpStep[]
  totalHrs: number
  wcHours: Record<string, number>
}

interface CatalogEntry { mat: string; ops: { wc: string; opName: string; avgHrs: number }[] }

interface Opts {
  mp5304Hrs: number
  specialCableBox: number
  specialControlWire: number
}

// ── Core calculation — applies knowledge.md rules on SAP base hours ───────────
function buildOrderRow(order: Order, catalog: Map<string, CatalogEntry>, opts: Opts): OrderRow {
  const info = decodeItemInfo(order.item_code ?? '')
  const kva  = info.kva || order.kva

  const isCastResin = info.typeCode === '4'
  const isLarge     = kva >= 1250 && kva <= 3500
  const isPower     = kva >= 7000
  const isSpecial   = info.isSpecial
  const isAluminum  = info.isAluminum

  const flow: FlowType = isCastResin ? 'B' : isPower ? 'C' : isLarge ? 'A-L' : 'A-SM'

  const matCode   = order.item_code ?? ''
  const entry     = catalog.get(matCode)
  const matMatched = !!entry

  const steps: OpStep[] = []
  const wcHours: Record<string, number> = {}

  // 1. Base ops from SAP catalog
  if (entry) {
    for (const op of entry.ops) {
      const zp = ZP_GROUP[op.wc] ?? 'ZP??'
      if (isCastResin && OIL_WCS.has(op.wc)) {
        // Skip oil-related WCs for Cast Resin — log as skipped
        steps.push({ wc: op.wc, opName: op.opName, hrsPerUnit: op.avgHrs, totalHrs: 0, zp, source: 'skipped', skipped: true })
        continue
      }
      const total = op.avgHrs * order.qty
      wcHours[op.wc] = (wcHours[op.wc] ?? 0) + total
      steps.push({ wc: op.wc, opName: op.opName, hrsPerUnit: op.avgHrs, totalHrs: total, zp, source: 'sap', skipped: false })
    }
  }

  // 2. Cast Resin — replace oil assembly with EE3403 (Head removal + Copper Bar)
  //    knowledge.md: 2.25–3.5h removal + 1h copper bar = 3.25–4.5h total
  //    Use: ≥1000kVA → 4.5h, <1000kVA → 3.25h
  if (isCastResin) {
    const castHrs = kva >= 1000 ? 4.5 : 3.25
    const total = castHrs * order.qty
    wcHours['EE3403'] = (wcHours['EE3403'] ?? 0) + total
    steps.push({ wc: 'EE3403', opName: 'รื้อหัวเหล็ก + ใส่ Copper Bar', hrsPerUnit: castHrs, totalHrs: total, zp: 'ZP16', source: 'cast_resin', skipped: false })
  }

  // 3. Large TR (1250–3500 kVA) — MP5304 equipment prep ~3.69h (knowledge.md rule)
  if (isLarge && opts.mp5304Hrs > 0) {
    const total = opts.mp5304Hrs * order.qty
    wcHours['MP5304'] = (wcHours['MP5304'] ?? 0) + total
    steps.push({ wc: 'MP5304', opName: 'เตรียมอุปกรณ์ (Large TR)', hrsPerUnit: opts.mp5304Hrs, totalHrs: total, zp: 'ZP14', source: 'mp5304', skipped: false })
  }

  // 4. Special S — Cable Box → EE3401 (+8h)
  if (isSpecial && opts.specialCableBox > 0) {
    const total = opts.specialCableBox * order.qty
    wcHours['EE3401'] = (wcHours['EE3401'] ?? 0) + total
    steps.push({ wc: 'EE3401', opName: 'ติดตั้ง Cable Box', hrsPerUnit: opts.specialCableBox, totalHrs: total, zp: 'ZP17', source: 'special_s', skipped: false })
  }

  // 5. Special S — Control Wiring → EE3402 (+8–40h)
  if (isSpecial && opts.specialControlWire > 0) {
    const total = opts.specialControlWire * order.qty
    wcHours['EE3402'] = (wcHours['EE3402'] ?? 0) + total
    steps.push({ wc: 'EE3402', opName: 'วงจรคอนโทรล (Special S)', hrsPerUnit: opts.specialControlWire, totalHrs: total, zp: 'ZP17', source: 'special_s', skipped: false })
  }

  const totalHrs = Object.values(wcHours).reduce((a, b) => a + b, 0)
  return { order, flow, kva, typeCode: info.typeCode, isSpecial, isCastResin, isLarge, isPower, isAluminum, matMatched, steps, totalHrs, wcHours }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root:   { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' },
  body:   { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 14px', gap: 10 },
  bar:    { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 },
  th:     { padding: '5px 10px', textAlign: 'left' as const, fontSize: 10, fontWeight: 700, color: 'var(--txt3)', background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' as const },
  td:     { padding: '4px 10px', borderBottom: '0.5px solid var(--bord)', fontSize: 11 },
  search: { background: 'var(--bg3)', border: '1px solid var(--bord)', borderRadius: 6, color: 'var(--txt)', fontSize: 11, padding: '5px 9px', outline: 'none' },
  btn:    { background: 'var(--bg3)', border: '1px solid var(--bord)', borderRadius: 6, color: 'var(--txt2)', cursor: 'pointer', fontSize: 11, padding: '4px 12px' },
  badge:  { fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700 },
  count:  { fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(137,180,250,.15)', color: 'var(--blue)', fontWeight: 600 },
  inp:    { width: 52, fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', fontFamily: 'var(--mono)' as const },
}

const SOURCE_COLOR: Record<OpSource, string> = {
  sap:        'var(--green)',
  mp5304:     'var(--amber)',
  cast_resin: 'var(--amber)',
  special_s:  'var(--red)',
  skipped:    'var(--txt3)',
}
const SOURCE_LABEL: Record<OpSource, string> = {
  sap:        'SAP',
  mp5304:     '+MP5304',
  cast_resin: '+CastR',
  special_s:  '+S',
  skipped:    'skip',
}

// ── Order card ────────────────────────────────────────────────────────────────
function OrderCard({ row, expanded, onToggle, wcConfig }: {
  row: OrderRow; expanded: boolean; onToggle: () => void
  wcConfig: Record<string, { name: string }>
}) {
  const o = row.order
  const fc = FLOW_COLOR[row.flow]
  const maxHrs = Math.max(...row.steps.filter(s => !s.skipped).map(s => s.totalHrs), 1)

  return (
    <div style={{ border: '1px solid var(--bord)', borderLeft: `4px solid ${fc}`, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
      {/* Header */}
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: 'var(--bg2)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{expanded ? '▲' : '▼'}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--blue)', minWidth: 120 }}>{o.item_code || '—'}</span>
        <span style={{ fontSize: 11, color: 'var(--txt2)', minWidth: 130 }}>{o.customer}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)' }}>{row.kva.toLocaleString()} kVA</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>×{o.qty}</span>

        {/* Flow badge */}
        <span style={{ ...S.badge, background: fc + '20', color: fc, border: `1px solid ${fc}40` }}>{row.flow}</span>

        {/* Modifier badges */}
        {row.isCastResin  && <span style={{ ...S.badge, background: 'rgba(250,179,135,.2)', color: 'var(--amber)' }}>Cast Resin</span>}
        {row.isLarge      && <span style={{ ...S.badge, background: 'rgba(137,180,250,.2)', color: 'var(--blue)' }}>Large TR</span>}
        {row.isSpecial    && <span style={{ ...S.badge, background: 'rgba(243,139,168,.15)', color: 'var(--red)' }}>+S Special</span>}
        {row.isAluminum   && <span style={{ ...S.badge, background: 'rgba(203,166,247,.2)', color: 'var(--purple)' }}>Al</span>}

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {!row.matMatched && (
            <span style={{ ...S.badge, background: 'rgba(243,139,168,.12)', color: 'var(--red)', border: '1px solid rgba(243,139,168,.25)' }}>ไม่พบใน SAP catalog</span>
          )}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>
            {row.totalHrs.toFixed(2)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--txt3)' }}>h</span>
          </span>
        </span>
      </div>

      {/* Detail */}
      {expanded && (
        <div style={{ background: 'var(--bg)' }}>
          {!row.matMatched ? (
            <div style={{ padding: '14px 20px', color: 'var(--txt3)', fontSize: 12 }}>
              ไม่พบ <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{o.item_code}</span> ใน SAP catalog
              <div style={{ fontSize: 10, marginTop: 4 }}>Item code ต้องตรงกับ material code ใน SAP — ตรวจสอบข้อมูลที่ Import tab → SAP</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={S.th}>ZP</th>
                  <th style={S.th}>WC</th>
                  <th style={S.th}>Operation</th>
                  <th style={S.th}>Source</th>
                  <th style={{ ...S.th, textAlign: 'right' as const }}>h/ตัว</th>
                  <th style={{ ...S.th, textAlign: 'right' as const }}>×qty</th>
                  <th style={{ ...S.th, textAlign: 'right' as const }}>Total h</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {row.steps.map((step, i) => {
                  const zpCol = ZP_COLOR[step.zp] ?? 'var(--txt3)'
                  const srcCol = SOURCE_COLOR[step.source]
                  const pct = maxHrs > 0 ? step.totalHrs / maxHrs * 100 : 0
                  const barCol = pct >= 80 ? 'var(--red)' : pct >= 50 ? 'var(--amber)' : 'var(--green)'
                  const wcName = wcConfig[step.wc]?.name
                  return (
                    <tr key={i} style={{ background: step.skipped ? 'rgba(69,71,90,.3)' : i % 2 ? 'var(--bg2)' : 'transparent', opacity: step.skipped ? 0.45 : 1 }}>
                      <td style={S.td}>
                        <span style={{ ...S.badge, background: zpCol + '20', color: zpCol }}>{step.zp}</span>
                        <span style={{ fontSize: 8, color: 'var(--txt3)', marginLeft: 3 }}>{ZP_LABEL[step.zp] ?? ''}</span>
                      </td>
                      <td style={{ ...S.td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>
                        {step.wc}
                        {wcName && <div style={{ fontSize: 8, color: 'var(--txt3)', fontFamily: 'inherit', fontWeight: 400 }}>{wcName}</div>}
                      </td>
                      <td style={{ ...S.td, color: step.skipped ? 'var(--txt3)' : 'var(--txt2)' }}>
                        {step.opName}
                        {step.skipped && <span style={{ fontSize: 9, marginLeft: 6, color: 'var(--txt3)' }}>(ข้าม — Cast Resin)</span>}
                      </td>
                      <td style={S.td}>
                        <span style={{ ...S.badge, background: srcCol + '20', color: srcCol }}>{SOURCE_LABEL[step.source]}</span>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right' as const, fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>{step.hrsPerUnit.toFixed(3)}</td>
                      <td style={{ ...S.td, textAlign: 'right' as const, fontFamily: 'var(--mono)', color: 'var(--txt3)', fontSize: 10 }}>×{o.qty}</td>
                      <td style={{ ...S.td, textAlign: 'right' as const, fontFamily: 'var(--mono)', fontWeight: 700, color: step.skipped ? 'var(--txt3)' : barCol }}>
                        {step.skipped ? '—' : step.totalHrs.toFixed(2)}
                      </td>
                      <td style={{ ...S.td, width: 80 }}>
                        {!step.skipped && (
                          <div style={{ width: '100%', height: 4, background: 'var(--bord2)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: barCol, borderRadius: 2 }} />
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg3)', borderTop: '1px solid var(--bord2)' }}>
                  <td colSpan={6} style={{ ...S.td, fontWeight: 700 }}>รวม × {o.qty} ตัว</td>
                  <td style={{ ...S.td, textAlign: 'right' as const, fontFamily: 'var(--mono)', fontWeight: 800, color: fc, fontSize: 13 }}>{row.totalHrs.toFixed(2)}</td>
                  <td style={S.td} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SapWCLoadTab() {
  const { state } = useApp()
  const orders: Order[] = state.orders ?? []
  const wcConfig = state.wcConfig ?? {}

  const [catalog, setCatalog]           = useState<Map<string, CatalogEntry>>(new Map())
  const [loadingCatalog, setLoading]    = useState(true)
  const [expandedIds, setExpandedIds]   = useState<Set<string>>(new Set())
  const [q, setQ]                       = useState('')
  const [filter, setFilter]             = useState<'all' | 'matched' | 'unmatched'>('all')
  const [mp5304Hrs, setMp5304Hrs]       = useState(3.69)
  const [specialCableBox, setCableBox]  = useState(8)
  const [specialCtrl, setSpecialCtrl]   = useState(0)

  useEffect(() => {
    fetch('/api/sap-routing/catalog')
      .then(r => r.json())
      .then((rows: { mat: string; ops: [string, string, string, number][] }[]) => {
        const m = new Map<string, CatalogEntry>()
        for (const r of rows) {
          m.set(r.mat, { mat: r.mat, ops: r.ops.map(op => ({ wc: op[1], opName: op[2], avgHrs: op[3] })) })
        }
        setCatalog(m)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const opts: Opts = useMemo(() => ({ mp5304Hrs, specialCableBox, specialControlWire: specialCtrl }), [mp5304Hrs, specialCableBox, specialCtrl])

  const rows = useMemo(() =>
    orders.map(o => buildOrderRow(o, catalog, opts)),
    [orders, catalog, opts]
  )

  // WC aggregate — total hours across all matched orders
  const wcAggregate = useMemo(() => {
    const m: Record<string, { hrs: number; zp: string }> = {}
    for (const row of rows) {
      if (!row.matMatched) continue
      for (const [wc, hrs] of Object.entries(row.wcHours)) {
        if (!m[wc]) m[wc] = { hrs: 0, zp: ZP_GROUP[wc] ?? 'ZP??' }
        m[wc].hrs += hrs
      }
    }
    return Object.entries(m).sort((a, b) => b[1].hrs - a[1].hrs)
  }, [rows])

  const maxWCHrs = wcAggregate[0]?.[1].hrs ?? 1

  const filtered = useMemo(() => {
    const lo = q.toLowerCase()
    return rows.filter(r => {
      if (filter === 'matched'   && !r.matMatched) return false
      if (filter === 'unmatched' &&  r.matMatched) return false
      if (!lo) return true
      return (
        r.order.item_code?.toLowerCase().includes(lo) ||
        r.order.customer?.toLowerCase().includes(lo) ||
        String(r.order.kva).includes(lo) ||
        r.order.sap_so?.toLowerCase().includes(lo)
      )
    })
  }, [rows, q, filter])

  const matchedCount = rows.filter(r => r.matMatched).length

  const toggleAll = (expand: boolean) => {
    setExpandedIds(expand ? new Set(filtered.map(r => r.order.id)) : new Set())
  }

  if (loadingCatalog) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', fontSize: 13 }}>Loading SAP catalog…</div>
  )

  if (catalog.size === 0) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--txt3)' }}>
      <div style={{ fontSize: 32 }}>📭</div>
      <div>ยังไม่มี SAP catalog ใน DB</div>
      <div style={{ fontSize: 11 }}>ไปที่ <strong>Import tab → SAP</strong> แล้วกด Save</div>
    </div>
  )

  return (
    <div style={S.root}>
      <div style={S.body}>
        {/* Header */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              📡 SAP WC Load
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(166,227,161,.18)', color: 'var(--green)', border: '1px solid rgba(166,227,161,.3)', fontWeight: 600 }}>Live DB hours</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
              SAP avg std hrs + knowledge.md rules · {catalog.size.toLocaleString()} materials · {matchedCount}/{rows.length} orders matched
            </div>
          </div>
          {/* Modifier inputs */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto', fontSize: 11, color: 'var(--txt2)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              MP5304 (Large TR):
              <input style={S.inp} type="number" step="0.01" min={0} value={mp5304Hrs}
                onChange={e => setMp5304Hrs(parseFloat(e.target.value) || 0)} />
              <span style={{ color: 'var(--txt3)' }}>h</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              +S Cable Box:
              <input style={S.inp} type="number" step="0.5" min={0} value={specialCableBox}
                onChange={e => setCableBox(parseFloat(e.target.value) || 0)} />
              <span style={{ color: 'var(--txt3)' }}>h</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              +S Control Wire:
              <input style={S.inp} type="number" step="1" min={0} value={specialCtrl}
                onChange={e => setSpecialCtrl(parseFloat(e.target.value) || 0)} />
              <span style={{ color: 'var(--txt3)' }}>h (8–40)</span>
            </label>
          </div>
        </div>

        {/* WC Aggregate bars */}
        {wcAggregate.length > 0 && (
          <div style={{ flexShrink: 0, background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
              WC Load Summary — all orders
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {wcAggregate.slice(0, 20).map(([wc, { hrs, zp }]) => {
                const pct = hrs / maxWCHrs * 100
                const col = ZP_COLOR[zp] ?? 'var(--txt3)'
                const wcName = wcConfig[wc]?.name
                return (
                  <div key={wc} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 68, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--amber)', flexShrink: 0 }}>{wc}</div>
                    <div style={{ width: 90, fontSize: 9, color: 'var(--txt3)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{wcName ?? ZP_LABEL[zp] ?? ''}</div>
                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: col + '20', color: col, flexShrink: 0 }}>{zp}</span>
                    <div style={{ flex: 1, height: 7, background: 'var(--bord2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 4, transition: 'width .3s' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--txt)', flexShrink: 0, minWidth: 56, textAlign: 'right' as const }}>{hrs.toFixed(1)} h</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div style={{ ...S.bar, flexShrink: 0 }}>
          <span style={S.count}>{filtered.length} / {rows.length} orders</span>
          <input style={{ ...S.search, width: 200 }} placeholder="Item code / ลูกค้า / kVA / SAP SO…"
            value={q} onChange={e => setQ(e.target.value)} />
          {q && <button style={S.btn} onClick={() => setQ('')}>✕</button>}
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--bord)', borderRadius: 6, overflow: 'hidden' }}>
            {(['all', 'matched', 'unmatched'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? 'var(--blue)' : 'var(--bg3)',
                color: filter === f ? '#fff' : 'var(--txt2)',
                border: 'none', cursor: 'pointer', fontSize: 11, padding: '4px 10px',
              }}>
                {f === 'all' ? 'All' : f === 'matched' ? '📡 Matched' : '⚠ No SAP'}
              </button>
            ))}
          </div>
          <button style={S.btn} onClick={() => toggleAll(true)}>▼ Expand All</button>
          <button style={S.btn} onClick={() => toggleAll(false)}>▲ Collapse All</button>
        </div>

        {/* Order cards */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 40, fontSize: 12 }}>ไม่พบข้อมูล</div>
          )}
          {filtered.map(row => (
            <OrderCard
              key={row.order.id}
              row={row}
              expanded={expandedIds.has(row.order.id)}
              onToggle={() => setExpandedIds(prev => {
                const next = new Set(prev)
                next.has(row.order.id) ? next.delete(row.order.id) : next.add(row.order.id)
                return next
              })}
              wcConfig={wcConfig}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
