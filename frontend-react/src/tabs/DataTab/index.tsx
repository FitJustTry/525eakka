import { useEffect, useState, useMemo, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import type { Order, CuttingMachine, PlanOrder, RoutingCrRow } from '../../types'

// ── styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root:   { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' },
  tabs:   { display: 'flex', gap: 0, background: 'var(--bg2)', borderBottom: '1px solid var(--bord)', flexShrink: 0, padding: '0 12px' },
  tab:    { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '10px 14px', whiteSpace: 'nowrap' },
  body:   { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 14, gap: 10 },
  bar:    { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 },
  card:   { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10 },
  wrap:   { flex: 1, overflow: 'auto' },
  tbl:    { borderCollapse: 'collapse' as const, width: '100%', fontSize: 11 },
  th:     { background: 'var(--bg3)', position: 'sticky' as const, top: 0, zIndex: 2, padding: '6px 10px', fontWeight: 700, color: 'var(--txt2)', borderBottom: '1px solid var(--bord)', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
  td:     { padding: '4px 10px', borderBottom: '1px solid var(--bord)', verticalAlign: 'middle' as const },
  inp:    { background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 4, color: 'var(--txt)', fontSize: 11, padding: '2px 6px' },
  search: { background: 'var(--bg3)', border: '1px solid var(--bord)', borderRadius: 6, color: 'var(--txt)', fontSize: 11, padding: '4px 8px', outline: 'none' },
  btn:    { background: 'var(--bg3)', border: '1px solid var(--bord)', borderRadius: 6, color: 'var(--txt2)', cursor: 'pointer', fontSize: 11, padding: '4px 12px' },
  btnRed: { background: 'rgba(224,90,78,.12)', border: '1px solid rgba(224,90,78,.3)', borderRadius: 6, color: 'var(--red)', cursor: 'pointer', fontSize: 11, padding: '4px 12px' },
  badge:  { fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600 },
  del:    { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, padding: '2px 5px', opacity: 0.55 },
  count:  { fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(137,180,250,.15)', color: 'var(--blue)', fontWeight: 600 },
}

type SubTab = 'overview' | 'orders' | 'planorders' | 'coil' | 'machines' | 'coil_machines' | 'employees' | 'holidays' | 'sap' | 'routing_cr' | 'routing_hv' | 'routing_lv' | 'cap' | 'wc' | 'itemcodes' | 'snapshots' | 'openload'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'overview',      label: '📊 Overview' },
  { id: 'orders',        label: '📋 Master Plan' },
  { id: 'planorders',    label: '🗂 Plan Orders' },
  { id: 'coil',          label: '🔄 Coil Plan' },
  { id: 'machines',      label: '⚙️ เครื่องตัด' },
  { id: 'coil_machines', label: '🧲 เครื่องพันคอยล์' },
  { id: 'employees',     label: '👷 พนักงาน' },
  { id: 'holidays',      label: '📆 วันหยุด' },
  { id: 'snapshots',     label: '📅 Plan Snapshots' },
  { id: 'openload',      label: '⚖️ Open Load' },
  { id: 'sap',           label: '🔧 SAP Routing' },
  { id: 'routing_cr',    label: '🪛 Routing CR' },
  { id: 'routing_hv',    label: '🔴 Routing HV' },
  { id: 'routing_lv',    label: '🔵 Routing LV' },
  { id: 'cap',           label: '📈 CAP พันคอยล์' },
  { id: 'wc',            label: '🏭 WC Config' },
  { id: 'itemcodes',     label: '🔑 Item Codes' },
]

// ── shared: inline editable cell ─────────────────────────────────────────────
function EC({ v, onSave, w = 90, mono = false, type = 'text' }: {
  v: string; onSave: (v: string) => void; w?: number | string; mono?: boolean; type?: string
}) {
  const [ed, setEd] = useState(false)
  const [draft, setDraft] = useState(v)
  useEffect(() => { if (!ed) setDraft(v) }, [v, ed])
  if (!ed) return (
    <span onClick={() => setEd(true)} style={{ cursor: 'text', fontFamily: mono ? 'var(--mono)' : undefined, display: 'inline-block', minWidth: typeof w === 'number' ? w : undefined, color: v ? 'var(--txt)' : 'var(--txt3)' }}>
      {v || '—'}
    </span>
  )
  return <input autoFocus type={type} style={{ ...S.inp, width: w }} value={draft}
    onChange={e => setDraft(e.target.value)}
    onBlur={() => { setEd(false); if (draft !== v) onSave(draft) }}
    onKeyDown={e => { if (e.key === 'Enter') { setEd(false); if (draft !== v) onSave(draft) } if (e.key === 'Escape') { setEd(false); setDraft(v) } }} />
}

// toggle cell
function TC({ v, onToggle }: { v: boolean; onToggle: () => void }) {
  return <button onClick={onToggle} style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', opacity: v ? 1 : 0.3, padding: '1px 4px' }}>{v ? '✅' : '❌'}</button>
}

async function apiFetch(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return null
  return res.json()
}

// ── 1. MASTER PLAN ────────────────────────────────────────────────────────────
function MasterPlan() {
  const { state, dispatch } = useApp()
  const orders: Order[] = state.orders ?? []
  const [q, setQ] = useState(''); const [df, setDf] = useState(''); const [dt, setDt] = useState('')
  const [weekDel, setWeekDel] = useState(''); const [busy, setBusy] = useState<string | null>(null)

  const weeks = useMemo(() => {
    const ws = new Set<string>()
    orders.forEach(o => {
      if (!o.plan_date) return
      const d = new Date(o.plan_date); const dow = d.getDay()
      d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
      ws.add(d.toISOString().slice(0, 10))
    })
    return [...ws].sort()
  }, [orders])

  const filtered = useMemo(() => {
    const lo = q.toLowerCase()
    return orders.filter(o =>
      (!lo || (o.sap_so ?? '').toLowerCase().includes(lo) || (o.customer ?? '').toLowerCase().includes(lo) || String(o.kva).includes(lo)) &&
      (!df || (o.plan_date ?? '') >= df) && (!dt || (o.plan_date ?? '') <= dt)
    ).sort((a, b) => (a.plan_date ?? '').localeCompare(b.plan_date ?? ''))
  }, [orders, q, df, dt])

  const save = useCallback(async (id: string, field: string, val: string) => {
    setBusy(id)
    try {
      const updated = await apiFetch(`/orders/${encodeURIComponent(id)}`, 'PUT', { [field]: val })
      dispatch({ type: 'SET_ORDERS', orders: orders.map(o => o.id === id ? updated : o) })
    } catch (e) { alert(String(e)) }
    setBusy(null)
  }, [orders, dispatch])

  const del = useCallback(async (id: string) => {
    if (!confirm('ลบแถวนี้?')) return
    setBusy(id)
    await apiFetch(`/orders/${encodeURIComponent(id)}`, 'DELETE')
    dispatch({ type: 'SET_ORDERS', orders: orders.filter(o => o.id !== id) })
    setBusy(null)
  }, [orders, dispatch])

  const delWeek = useCallback(async (w: string) => {
    if (!confirm(`ลบทั้งสัปดาห์ ${w}?`)) return
    const toDelete = orders.filter(o => {
      if (!o.plan_date) return false
      const d = new Date(o.plan_date); const dow = d.getDay()
      d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
      return d.toISOString().slice(0, 10) === w
    })
    for (const o of toDelete) await apiFetch(`/orders/${encodeURIComponent(o.id)}`, 'DELETE')
    dispatch({ type: 'SET_ORDERS', orders: orders.filter(o => !toDelete.find(d => d.id === o.id)) })
    setWeekDel('')
  }, [orders, dispatch])

  const catCol = (c: string) => c === 'หลัก' ? 'var(--blue)' : c === 'เสริม' ? 'var(--green)' : 'var(--txt3)'

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length} / {orders.length}</span>
        <input style={{ ...S.search, width: 190 }} placeholder="SAP SO / ลูกค้า / kVA…" value={q} onChange={e => setQ(e.target.value)} />
        <input style={{ ...S.search, width: 120 }} type="date" value={df} onChange={e => setDf(e.target.value)} title="ตั้งแต่" />
        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>–</span>
        <input style={{ ...S.search, width: 120 }} type="date" value={dt} onChange={e => setDt(e.target.value)} title="ถึง" />
        {(q || df || dt) && <button style={S.btn} onClick={() => { setQ(''); setDf(''); setDt('') }}>✕ ล้าง</button>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select style={S.search} value={weekDel} onChange={e => setWeekDel(e.target.value)}>
            <option value="">ลบทั้งสัปดาห์…</option>
            {weeks.map(w => <option key={w} value={w}>สัปดาห์ {w}</option>)}
          </select>
          {weekDel && <button style={S.btnRed} onClick={() => delWeek(weekDel)}>🗑 ลบ {weekDel}</button>}
          <button style={S.btnRed} onClick={async () => {
            if (!confirm(`ลบ Master Plan ทั้งหมด ${orders.length} รายการ?`)) return
            await apiFetch('/orders', 'DELETE')
            dispatch({ type: 'SET_ORDERS', orders: [] })
          }}>🗑 ลบทั้งหมด</button>
        </div>
      </div>
      <div style={S.wrap}>
        <table style={S.tbl}>
          <thead><tr>
            {(['วันที่','ลำดับ','ความสำคัญ','SAP SO','Itemcode','Comment','Plant','kVA','ระบบไฟฟ้า','ลูกค้า','Total kVA','จำนวน','เข้าเทส','CableBox','Control','กำหนดส่งสโตร์','DUE SO','แจ้งปรับแผน','Due Clamp','Due BOX/CTRL','Raw Mat','LV','HV','สัปดาห์','']).map((h, i) => (
              <th key={i} style={S.th}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(o => {
              const catColor = o.category === 'หลัก' ? 'var(--blue)' : o.category === 'เสริม' ? 'var(--green)' : 'var(--txt3)'
              const m: React.CSSProperties = { ...S.td, fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'nowrap' as const }
              return (
                <tr key={o.id} style={{ opacity: busy === o.id ? 0.5 : 1, borderLeft: `3px solid ${catColor}` }}>
                  <td style={m}><EC mono v={o.plan_date ?? ''} w={95} onSave={v => save(o.id, 'plan_date', v)} /></td>
                  <td style={{ ...m, textAlign: 'center', color: 'var(--txt3)' }}><EC mono v={String(o.seq ?? '')} w={36} onSave={v => save(o.id, 'seq', v)} /></td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                      background: `${catColor}22`, color: catColor }}>
                      <EC v={o.category ?? ''} w={55} onSave={v => save(o.id, 'category', v)} />
                    </span>
                  </td>
                  <td style={{ ...m, color: 'var(--amber)', fontWeight: 700 }}><EC mono v={o.sap_so ?? ''} w={105} onSave={v => save(o.id, 'sap_so', v)} /></td>
                  <td style={{ ...m, color: 'var(--blue)' }}><EC mono v={o.item_code ?? ''} w={115} onSave={v => save(o.id, 'item_code', v)} /></td>
                  <td style={S.td}><EC v={o.comment ?? ''} w={130} onSave={v => save(o.id, 'comment', v)} /></td>
                  <td style={{ ...m, color: 'var(--txt3)' }}><EC mono v={o.plant ?? ''} w={55} onSave={v => save(o.id, 'plant', v)} /></td>
                  <td style={{ ...m, textAlign: 'right', color: 'var(--blue)', fontWeight: 700 }}><EC mono v={String(o.kva ?? '')} w={55} onSave={v => save(o.id, 'kva', v)} /></td>
                  <td style={{ ...S.td, textAlign: 'center' }}><EC v={o.electrical ?? ''} w={65} onSave={v => save(o.id, 'electrical', v)} /></td>
                  <td style={S.td}><EC v={o.customer ?? ''} w={105} onSave={v => save(o.id, 'customer', v)} /></td>
                  <td style={{ ...m, textAlign: 'right' }}><EC mono v={String(o.total_kva ?? '')} w={60} onSave={v => save(o.id, 'total_kva', v)} /></td>
                  <td style={{ ...m, textAlign: 'center', fontWeight: 700 }}><EC mono v={String(o.qty ?? '')} w={36} onSave={v => save(o.id, 'qty', v)} /></td>
                  <td style={m}><EC mono v={o.enter_test ?? ''} w={85} onSave={v => save(o.id, 'enter_test', v)} /></td>
                  <td style={S.td}><EC v={o.cable_box ?? ''} w={55} onSave={v => save(o.id, 'cable_box', v)} /></td>
                  <td style={S.td}><EC v={o.control ?? ''} w={55} onSave={v => save(o.id, 'control', v)} /></td>
                  <td style={m}><EC mono v={o.due_store ?? ''} w={85} onSave={v => save(o.id, 'due_store', v)} /></td>
                  <td style={{ ...m, color: 'var(--amber)' }}><EC mono v={o.due_so ?? ''} w={85} onSave={v => save(o.id, 'due_so', v)} /></td>
                  <td style={m}><EC mono v={o.adjust_plan ?? ''} w={85} onSave={v => save(o.id, 'adjust_plan', v)} /></td>
                  <td style={m}><EC mono v={o.due_clamp ?? ''} w={85} onSave={v => save(o.id, 'due_clamp', v)} /></td>
                  <td style={m}><EC mono v={o.due_box_ctrl ?? ''} w={110} onSave={v => save(o.id, 'due_box_ctrl', v)} /></td>
                  <td style={{ ...S.td, color: 'var(--txt2)' }}><EC v={o.raw_mat ?? ''} w={75} onSave={v => save(o.id, 'raw_mat', v)} /></td>
                  <td style={{ ...S.td, color: 'var(--txt2)' }}><EC v={o.lv ?? ''} w={70} onSave={v => save(o.id, 'lv', v)} /></td>
                  <td style={{ ...S.td, color: 'var(--txt2)' }}><EC v={o.hv ?? ''} w={70} onSave={v => save(o.id, 'hv', v)} /></td>
                  <td style={{ ...m, color: 'var(--txt3)' }}><EC mono v={o.week_start ?? ''} w={85} onSave={v => save(o.id, 'week_start', v)} /></td>
                  <td style={S.td}><button style={S.del} onClick={() => del(o.id)}>🗑</button></td>
                </tr>
              )
            })}
            {!filtered.length && <tr><td colSpan={25} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ไม่พบข้อมูล</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 2. COIL PLAN ─────────────────────────────────────────────────────────────
interface CoilRow { id: number; plan_date: string; seq: number; importance: string; sap_so: string; item_code: string; comment: string; plant: string; kva: number; electrical: string; customer: string; total_kva: number; qty: number; enter_test: string; cable_box: string; control: string; due_store: string; due_so: string; adjust_plan: string; due_clamp: string; due_box_ctrl: string; raw_mat: string; lv: string; hv: string; week_start: string }

function CoilPlan() {
  const [rows, setRows] = useState<CoilRow[]>([]); const [loading, setLoading] = useState(true)
  const [wf, setWf] = useState(''); const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => { apiFetch('/coil-plan').then(d => { setRows(d); setLoading(false) }) }, [])
  const weeks = useMemo(() => [...new Set(rows.map(r => r.week_start))].sort(), [rows])
  const filtered = useMemo(() => wf ? rows.filter(r => r.week_start === wf) : rows, [rows, wf])

  const save = async (id: number, field: string, val: string) => {
    setBusy(id)
    try {
      const updated = await apiFetch(`/coil-plan/${id}`, 'PUT', { [field]: val })
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
    } catch (e) { alert(String(e)) }
    setBusy(null)
  }
  const del = async (id: number) => {
    if (!confirm('ลบแถวนี้?')) return
    await apiFetch(`/coil-plan/${id}`, 'DELETE'); setRows(prev => prev.filter(r => r.id !== id))
  }
  const delWeek = async (w: string) => {
    if (!confirm(`ลบทั้งสัปดาห์ ${w}?`)) return
    await apiFetch(`/coil-plan/week/${encodeURIComponent(w)}`, 'DELETE')
    setRows(prev => prev.filter(r => r.week_start !== w)); setWf('')
  }
  const ic = (imp: string) => imp === 'หลัก' ? 'var(--blue)' : imp === 'เสริม' ? 'var(--green)' : 'var(--txt3)'

  const COLS: { label: string; key: keyof CoilRow; w?: number; mono?: boolean }[] = [
    { label: 'วันที่', key: 'plan_date', w: 100, mono: true },
    { label: 'ลำดับ', key: 'seq', w: 40, mono: true },
    { label: 'ความสำคัญ', key: 'importance', w: 80 },
    { label: 'SAP SO', key: 'sap_so', w: 110, mono: true },
    { label: 'Itemcode', key: 'item_code', w: 100, mono: true },
    { label: 'Comment', key: 'comment', w: 130 },
    { label: 'Plant', key: 'plant', w: 70 },
    { label: 'kVA', key: 'kva', w: 55, mono: true },
    { label: 'ระบบไฟฟ้า', key: 'electrical', w: 70 },
    { label: 'ลูกค้า', key: 'customer', w: 110 },
    { label: 'Total kVA', key: 'total_kva', w: 68, mono: true },
    { label: 'จำนวน', key: 'qty', w: 45, mono: true },
    { label: 'เข้าเทส', key: 'enter_test', w: 90, mono: true },
    { label: 'CableBox', key: 'cable_box', w: 60 },
    { label: 'Control', key: 'control', w: 60 },
    { label: 'กำหนดส่งสโตร์', key: 'due_store', w: 95, mono: true },
    { label: 'DUE SO', key: 'due_so', w: 90, mono: true },
    { label: 'แจ้งปรับแผน', key: 'adjust_plan', w: 90, mono: true },
    { label: 'Due Clamp', key: 'due_clamp', w: 90, mono: true },
    { label: 'Due BOX/CTRL', key: 'due_box_ctrl', w: 130, mono: true },
    { label: 'Raw Mat', key: 'raw_mat', w: 90 },
    { label: 'LV', key: 'lv', w: 80 },
    { label: 'HV', key: 'hv', w: 80 },
    { label: 'สัปดาห์', key: 'week_start', w: 90, mono: true },
  ]

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length} / {rows.length}</span>
        <select style={S.search} value={wf} onChange={e => setWf(e.target.value)}>
          <option value="">ทุกสัปดาห์</option>
          {weeks.map(w => <option key={w} value={w}>สัปดาห์ {w}</option>)}
        </select>
        {wf && <button style={S.btnRed} onClick={() => delWeek(wf)}>🗑 ลบสัปดาห์ {wf}</button>}
        {wf && <button style={S.btn} onClick={() => setWf('')}>✕ ล้าง</button>}
        <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 8 }}>คลิกเซลล์เพื่อแก้ไข</span>
        <button style={{ ...S.btnRed, marginLeft: 'auto' }} onClick={async () => {
          if (!confirm(`ลบ Coil Plan ทั้งหมด ${rows.length} รายการ?`)) return
          await apiFetch('/coil-plan', 'DELETE')
          setRows([])
        }}>🗑 ลบทั้งหมด</button>
      </div>
      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>กำลังโหลด…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              {COLS.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}
              <th style={S.th} />
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ opacity: busy === r.id ? 0.5 : 1 }}>
                  {COLS.map(c => (
                    <td key={c.key} style={{ ...S.td, ...(c.key === 'importance' ? { textAlign: 'center' } : {}) }}>
                      {c.key === 'importance' ? (
                        <span style={{ ...S.badge, background: `${ic(r.importance)}22`, color: ic(r.importance) }}>
                          <EC v={r.importance} w={60} onSave={v => save(r.id, 'importance', v)} />
                        </span>
                      ) : (
                        <EC mono={c.mono} v={String(r[c.key] ?? '')} w={c.w}
                          onSave={v => save(r.id, c.key as string, v)} />
                      )}
                    </td>
                  ))}
                  <td style={S.td}><button style={S.del} onClick={() => del(r.id)}>🗑</button></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={COLS.length + 1} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ไม่พบข้อมูล</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── 3. CUTTING MACHINES ───────────────────────────────────────────────────────
function CuttingMachines() {
  const { state, dispatch } = useApp()
  const machines: CuttingMachine[] = state.cuttingMachines ?? []
  const [busy, setBusy] = useState<number | null>(null)

  const save = async (id: number, field: string, val: unknown) => {
    setBusy(id)
    try {
      const updated = await apiFetch(`/cutting-machines/${id}`, 'PUT', { [field]: val })
      dispatch({ type: 'SET_CUTTING_MACHINES', machines: machines.map(m => m.id === id ? updated : m) })
    } catch (e) { alert(String(e)) }
    setBusy(null)
  }
  const toggle = (id: number, field: string, cur: boolean) => save(id, field, !cur)
  const del = async (id: number) => {
    if (!confirm('ลบเครื่องตัดนี้?')) return
    await apiFetch(`/cutting-machines/${id}`, 'DELETE')
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: machines.filter(m => m.id !== id) })
  }

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{machines.length} เครื่อง</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>คลิกเซลล์เพื่อแก้ไข</span>
      </div>
      <div style={S.wrap}>
        <table style={S.tbl}>
          <thead><tr>
            {['ชื่อเครื่อง','จำนวน','kVA ต่ำสุด','kVA สูงสุด','h/ตัว','Laser','M4','หน้า min','หน้า max','เจาะรู 8mm (Oil)','เจาะรู 22mm (Cast Resin)','หมายเหตุ',''].map((h, i) => <th key={i} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {machines.map(m => (
              <tr key={m.id} style={{ opacity: busy === m.id ? 0.5 : 1 }}>
                <td style={S.td}><EC v={m.name} w={130} onSave={v => save(m.id, 'name', v)} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><EC mono v={String(m.count)} w={38} onSave={v => save(m.id, 'count', v)} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><EC mono v={m.min_kva <= 0 ? '' : String(m.min_kva)} w={58} onSave={v => save(m.id, 'min_kva', v || '0')} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><EC mono v={m.max_kva >= 9999 ? '' : String(m.max_kva)} w={58} onSave={v => save(m.id, 'max_kva', v || '9999')} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><EC mono v={String(m.hrs_per_unit)} w={46} onSave={v => save(m.id, 'hrs_per_unit', v)} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><TC v={m.laser} onToggle={() => toggle(m.id, 'laser', m.laser)} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><TC v={m.m4} onToggle={() => toggle(m.id, 'm4', m.m4)} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><EC mono v={m.min_face_mm <= 1 ? '' : String(m.min_face_mm)} w={58} onSave={v => save(m.id, 'min_face_mm', v || '1')} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><EC mono v={m.max_face_mm >= 9999 ? '' : String(m.max_face_mm)} w={58} onSave={v => save(m.id, 'max_face_mm', v || '9999')} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><TC v={m.drill_8mm} onToggle={() => toggle(m.id, 'drill_8mm', m.drill_8mm)} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><TC v={m.drill_22mm} onToggle={() => toggle(m.id, 'drill_22mm', m.drill_22mm)} /></td>
                <td style={S.td}><EC v={m.notes} w={180} onSave={v => save(m.id, 'notes', v)} /></td>
                <td style={S.td}><button style={S.del} onClick={() => del(m.id)}>🗑</button></td>
              </tr>
            ))}
            {!machines.length && <tr><td colSpan={13} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ยังไม่มีเครื่องตัด</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── COIL MACHINES ─────────────────────────────────────────────────────────────
interface CoilMachineRow { id: number; name: string; station_type: string; wc_id: string; count: number; is_active: boolean; notes: string }

const STATION_TYPES = ['LV-Foil', 'LV-Wire', 'HV']
const STATION_COLOR: Record<string, string> = { 'LV-Foil': 'var(--blue)', 'LV-Wire': 'var(--green)', 'HV': 'var(--amber)' }

function CoilMachines() {
  const [rows, setRows] = useState<CoilMachineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', station_type: 'LV-Foil', wc_id: '', count: 1, notes: '' })

  useEffect(() => {
    apiFetch('/coil-machines').then((d: CoilMachineRow[]) => { setRows(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const save = async (id: number, field: string, val: unknown) => {
    setBusy(id)
    try {
      const row = rows.find(r => r.id === id)!
      const updated = await apiFetch(`/coil-machines/${id}`, 'PUT', { ...row, [field]: val })
      setRows(prev => prev.map(r => r.id === id ? updated : r))
    } catch (e) { alert(String(e)) }
    setBusy(null)
  }
  const del = async (id: number, name: string) => {
    if (!confirm(`ลบ "${name}"?`)) return
    await apiFetch(`/coil-machines/${id}`, 'DELETE')
    setRows(prev => prev.filter(r => r.id !== id))
  }
  const addNew = async () => {
    if (!draft.name.trim()) return
    setBusy(-1)
    try {
      const created = await apiFetch('/coil-machines', 'POST', draft)
      setRows(prev => [...prev, created])
      setDraft({ name: '', station_type: 'LV-Foil', wc_id: '', count: 1, notes: '' })
      setAdding(false)
    } catch (e) { alert(String(e)) }
    setBusy(null)
  }

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{rows.length} เครื่อง</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>คลิกเซลล์เพื่อแก้ไข</span>
        <button style={{ ...S.btn, marginLeft: 'auto', background: 'rgba(137,180,250,.12)', color: 'var(--blue)', border: '1px solid rgba(137,180,250,.3)' }}
          onClick={() => setAdding(v => !v)}>+ เพิ่มเครื่อง</button>
      </div>
      {adding && (
        <div style={{ ...S.bar, padding: '8px 14px', borderBottom: '1px solid var(--bord)', background: 'var(--bg3)', flexWrap: 'wrap', gap: 8 }}>
          <input style={{ ...S.search, width: 160 }} placeholder="ชื่อเครื่อง *" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          <select style={S.search} value={draft.station_type} onChange={e => setDraft(d => ({ ...d, station_type: e.target.value }))}>
            {STATION_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input style={{ ...S.search, width: 80 }} placeholder="WC ID" value={draft.wc_id} onChange={e => setDraft(d => ({ ...d, wc_id: e.target.value }))} />
          <input style={{ ...S.search, width: 55 }} type="number" min={1} placeholder="จำนวน" value={draft.count} onChange={e => setDraft(d => ({ ...d, count: parseInt(e.target.value) || 1 }))} />
          <input style={{ ...S.search, width: 200 }} placeholder="หมายเหตุ" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
          <button style={{ ...S.btn, background: 'rgba(166,227,161,.12)', color: 'var(--green)', border: '1px solid rgba(166,227,161,.3)' }}
            disabled={busy === -1 || !draft.name.trim()} onClick={addNew}>✓ เพิ่ม</button>
          <button style={S.btn} onClick={() => setAdding(false)}>✕</button>
        </div>
      )}
      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>Loading…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              {(['ชื่อเครื่อง','สถานี','WC','จำนวน','Active','หมายเหตุ',''] as string[]).map((h, i) => (
                <th key={i} style={{ ...S.th, textAlign: i === 3 || i === 4 ? 'center' as const : 'left' as const }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const col = STATION_COLOR[r.station_type] ?? 'var(--txt2)'
                return (
                  <tr key={r.id} style={{ opacity: busy === r.id ? 0.5 : 1, borderLeft: `3px solid ${col}33` }}>
                    <td style={S.td}><EC v={r.name} w={150} onSave={v => save(r.id, 'name', v)} /></td>
                    <td style={{ ...S.td }}>
                      <select style={{ ...S.inp, color: col, fontWeight: 700 }} value={r.station_type}
                        onChange={e => save(r.id, 'station_type', e.target.value)}>
                        {STATION_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ ...S.td, fontFamily: 'var(--mono)', color: 'var(--amber)' }}>
                      <EC mono v={r.wc_id} w={80} onSave={v => save(r.id, 'wc_id', v)} />
                    </td>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      <EC mono v={String(r.count)} w={38} onSave={v => save(r.id, 'count', parseInt(v) || 1)} />
                    </td>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      <TC v={r.is_active} onToggle={() => save(r.id, 'is_active', !r.is_active)} />
                    </td>
                    <td style={S.td}><EC v={r.notes} w={200} onSave={v => save(r.id, 'notes', v)} /></td>
                    <td style={S.td}><button style={S.del} onClick={() => del(r.id, r.name)}>🗑</button></td>
                  </tr>
                )
              })}
              {!rows.length && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ยังไม่มีเครื่องพันคอยล์ — กด "+ เพิ่มเครื่อง"</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── 4. PLAN ORDERS ───────────────────────────────────────────────────────────
function PlanOrders() {
  const [rows, setRows] = useState<PlanOrder[]>([]); const [loading, setLoading] = useState(true)
  const [wf, setWf] = useState(''); const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => { apiFetch('/plan-orders').then(d => { setRows(d); setLoading(false) }) }, [])
  const weeks = useMemo(() => [...new Set(rows.map(r => r.week_start ?? ''))].filter(Boolean).sort(), [rows])
  const filtered = useMemo(() => wf ? rows.filter(r => r.week_start === wf) : rows, [rows, wf])

  const save = async (id: number, field: string, val: unknown) => {
    setBusy(id)
    try {
      const updated = await apiFetch(`/plan-orders/${id}`, 'PUT', { [field]: val })
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
    } catch (e) { alert(String(e)) }
    setBusy(null)
  }
  const del = async (id: number) => {
    if (!confirm('ลบแถวนี้?')) return
    await apiFetch(`/plan-orders/${id}`, 'DELETE'); setRows(prev => prev.filter(r => r.id !== id))
  }
  const delWeek = async (w: string) => {
    if (!confirm(`ลบสัปดาห์ ${w}?`)) return
    await apiFetch(`/plan-orders/week/${encodeURIComponent(w)}`, 'DELETE')
    setRows(prev => prev.filter(r => r.week_start !== w)); setWf('')
  }

  const COLS: { label: string; key: keyof PlanOrder; w?: number; mono?: boolean }[] = [
    { label: 'สัปดาห์',    key: 'week_start', w: 90,  mono: true },
    { label: 'วันที่',      key: 'plan_date',  w: 95,  mono: true },
    { label: 'ลำดับ',      key: 'seq',        w: 38,  mono: true },
    { label: 'SAP SO',     key: 'sap_so',     w: 110, mono: true },
    { label: 'Item Code',  key: 'item_code',  w: 105, mono: true },
    { label: 'Product',    key: 'product',    w: 100, mono: true },
    { label: 'ลูกค้า',     key: 'customer',   w: 110 },
    { label: 'kVA',        key: 'kva',        w: 55,  mono: true },
    { label: 'จำนวน',      key: 'qty',        w: 42,  mono: true },
    { label: 'Deadline',   key: 'deadline',   w: 90,  mono: true },
    { label: 'หน้ากว้าง (mm)', key: 'face_mm', w: 80, mono: true },
    { label: 'ระบบไฟฟ้า', key: 'electrical', w: 80 },
    { label: 'HV',         key: 'hv',         w: 75 },
    { label: 'LV',         key: 'lv',         w: 75 },
    { label: 'ประเภท',     key: 'category',   w: 70 },
    { label: 'Comment',    key: 'comment',    w: 130 },
  ]

  const totalKva = useMemo(() => filtered.reduce((s, r) => s + (r.kva || 0) * (r.qty || 0), 0), [filtered])
  const totalQty = useMemo(() => filtered.reduce((s, r) => s + (r.qty || 0), 0), [filtered])

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length} / {rows.length}</span>
        <select style={S.search} value={wf} onChange={e => setWf(e.target.value)}>
          <option value="">ทุกสัปดาห์</option>
          {weeks.map(w => <option key={w} value={w}>สัปดาห์ {w}</option>)}
        </select>
        {wf && <button style={S.btnRed} onClick={() => delWeek(wf)}>🗑 ลบสัปดาห์ {wf}</button>}
        {wf && <button style={S.btn} onClick={() => setWf('')}>✕ ล้าง</button>}
        {filtered.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 4 }}>
            {totalQty} ตัว · {totalKva.toLocaleString()} kVA รวม
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 8 }}>คลิกเซลล์เพื่อแก้ไข</span>
        <button style={{ ...S.btnRed, marginLeft: 'auto' }} onClick={async () => {
          if (!confirm(`ลบ Plan Orders ทั้งหมด ${rows.length} รายการ?`)) return
          await apiFetch('/plan-orders', 'DELETE'); setRows([])
        }}>🗑 ลบทั้งหมด</button>
      </div>
      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>กำลังโหลด…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              {COLS.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}
              <th style={S.th} />
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ opacity: busy === r.id ? 0.5 : 1 }}>
                  {COLS.map(c => (
                    <td key={c.key} style={S.td}>
                      <EC mono={c.mono} v={String(r[c.key] ?? '')} w={c.w}
                        onSave={v => save(r.id, c.key as string, v)} />
                    </td>
                  ))}
                  <td style={S.td}><button style={S.del} onClick={() => del(r.id)}>🗑</button></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={COLS.length + 1} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ไม่พบข้อมูล — นำเข้าจาก Import &gt; Plan Orders</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── 5. EMPLOYEES ─────────────────────────────────────────────────────────────
interface EmpRow { id: number; emp_id: string; emp_name: string; firstname: string; lastname: string; dept: string; title: string; wc_id: string; is_active: boolean; is_head: boolean }

function Employees() {
  const [rows, setRows] = useState<EmpRow[]>([]); const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => {
    apiFetch('/employees/flat').then((d: EmpRow[]) => { setRows(d); setLoading(false) })
  }, [])
  const filtered = useMemo(() => {
    const lo = q.toLowerCase()
    return lo ? rows.filter(r => (r.emp_name ?? '').toLowerCase().includes(lo) || (r.dept ?? '').toLowerCase().includes(lo) || (r.wc_id ?? '').toLowerCase().includes(lo)) : rows
  }, [rows, q])

  const save = async (id: number, field: string, val: unknown) => {
    setBusy(id)
    try {
      const updated = await apiFetch(`/employees/${id}`, 'PUT', { [field]: val })
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
    } catch (e) { alert(String(e)) }
    setBusy(null)
  }
  const del = async (id: number, name: string) => {
    if (!confirm(`ลบ ${name}?`)) return
    await apiFetch(`/employees/${id}`, 'DELETE')
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length} / {rows.length} คน</span>
        <input style={{ ...S.search, width: 200 }} placeholder="ค้นหาชื่อ / แผนก / WC…" value={q} onChange={e => setQ(e.target.value)} />
        {q && <button style={S.btn} onClick={() => setQ('')}>✕</button>}
        <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 8 }}>คลิกเซลล์เพื่อแก้ไข</span>
      </div>
      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>กำลังโหลด…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              {['WC','รหัสพนักงาน','ชื่อ-นามสกุล','แผนก','ตำแหน่ง','Active','หัวหน้า',''].map((h, i) => <th key={i} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ opacity: busy === r.id ? 0.5 : 1 }}>
                  <td style={{ ...S.td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>
                    <EC mono v={r.wc_id ?? ''} w={70} onSave={v => save(r.id, 'wc_id', v)} />
                  </td>
                  <td style={{ ...S.td, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt3)' }}>{r.emp_id || '—'}</td>
                  <td style={S.td}><EC v={r.emp_name ?? ''} w={150} onSave={v => save(r.id, 'emp_name', v)} /></td>
                  <td style={S.td}><EC v={r.dept ?? ''} w={100} onSave={v => save(r.id, 'dept', v)} /></td>
                  <td style={S.td}><EC v={r.title ?? ''} w={100} onSave={v => save(r.id, 'title', v)} /></td>
                  <td style={{ ...S.td, textAlign: 'center' }}><TC v={r.is_active} onToggle={() => save(r.id, 'is_active', !r.is_active)} /></td>
                  <td style={{ ...S.td, textAlign: 'center' }}><TC v={r.is_head} onToggle={() => save(r.id, 'is_head', !r.is_head)} /></td>
                  <td style={S.td}><button style={S.del} onClick={() => del(r.id, r.emp_name)}>🗑</button></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ไม่พบข้อมูล</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── 5. FACTORY HOLIDAYS ───────────────────────────────────────────────────────
interface HolidayRow { date: string; name: string }

function Holidays() {
  const { state, dispatch } = useApp()
  const holidays: HolidayRow[] = useMemo(() =>
    Object.entries(state.factoryHolidays ?? {}).map(([date, name]) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date))
  , [state.factoryHolidays])
  const [newDate, setNewDate] = useState(''); const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!newDate || !newName.trim()) return
    setBusy(true)
    try {
      await apiFetch('/factory-holidays', 'POST', { date: newDate, name: newName.trim() })
      dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: { ...state.factoryHolidays, [newDate]: newName.trim() } })
      setNewDate(''); setNewName('')
    } catch (e) { alert(String(e)) }
    setBusy(false)
  }
  const del = async (date: string) => {
    if (!confirm(`ลบวันหยุด ${date}?`)) return
    await apiFetch(`/factory-holidays/${encodeURIComponent(date)}`, 'DELETE')
    const next = { ...state.factoryHolidays }; delete next[date]
    dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: next })
  }

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{holidays.length} วัน</span>
        <input style={{ ...S.search, width: 130 }} type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
        <input style={{ ...S.search, width: 200 }} placeholder="ชื่อวันหยุด…" value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button style={{ ...S.btn, background: 'rgba(137,180,250,.12)', color: 'var(--blue)', border: '1px solid rgba(137,180,250,.3)' }}
          onClick={add} disabled={busy || !newDate || !newName.trim()}>+ เพิ่ม</button>
        <button style={{ ...S.btnRed, marginLeft: 'auto' }} onClick={async () => {
          if (!confirm(`ลบวันหยุดทั้งหมด ${holidays.length} วัน?`)) return
          setBusy(true)
          await apiFetch('/factory-holidays', 'DELETE')
          dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: {} })
          setBusy(false)
        }} disabled={busy || !holidays.length}>🗑 ลบทั้งหมด</button>
      </div>
      <div style={S.wrap}>
        <table style={S.tbl}>
          <thead><tr>
            {['วันที่','ชื่อวันหยุด','วัน',''].map((h, i) => <th key={i} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {holidays.map(h => {
              const d = new Date(h.date)
              const day = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][d.getDay()]
              return (
                <tr key={h.date}>
                  <td style={{ ...S.td, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{h.date}</td>
                  <td style={S.td}>{h.name}</td>
                  <td style={{ ...S.td, color: 'var(--txt3)', fontSize: 10 }}>{day}</td>
                  <td style={S.td}><button style={S.del} onClick={() => del(h.date)}>🗑</button></td>
                </tr>
              )
            })}
            {!holidays.length && <tr><td colSpan={4} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ยังไม่มีวันหยุดโรงงาน</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 6. SAP ROUTING ───────────────────────────────────────────────────────────
interface SapRow { id: number; order_no: string; material_code: string; wc_id: string; operation: string; std_hrs: number; is_confirmed: boolean; plant: string; extra?: Record<string, string> }

function SapRouting() {
  const [rows, setRows] = useState<SapRow[]>([]); const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [wf, setWf] = useState(''); const [busy, setBusy] = useState(false)
  const [showLimit, setShowLimit] = useState<number>(100)

  useEffect(() => {
    apiFetch('/sap-routing').then((d: SapRow[]) => { setRows(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Collect all extra keys from all rows (sorted, deduplicated)
  const extraKeys = useMemo(() => {
    const keys = new Set<string>()
    rows.forEach(r => { if (r.extra) Object.keys(r.extra).forEach(k => keys.add(k)) })
    return [...keys].sort()
  }, [rows])

  const wcs = useMemo(() => [...new Set(rows.map(r => r.wc_id))].sort(), [rows])
  const filtered = useMemo(() => {
    const lo = q.toLowerCase()
    return rows.filter(r => {
      const matchQ = !lo || r.order_no.toLowerCase().includes(lo) || r.material_code.toLowerCase().includes(lo) || r.wc_id.toLowerCase().includes(lo) || r.operation.toLowerCase().includes(lo) ||
        (r.extra ? Object.values(r.extra).some(v => v.toLowerCase().includes(lo)) : false)
      return matchQ && (!wf || r.wc_id === wf)
    })
  }, [rows, q, wf])

  const wcSummary = useMemo(() => {
    const m: Record<string, { ops: number; hrs: number; confirmed: number }> = {}
    rows.forEach(r => {
      if (!m[r.wc_id]) m[r.wc_id] = { ops: 0, hrs: 0, confirmed: 0 }
      m[r.wc_id].ops++
      m[r.wc_id].hrs += Number(r.std_hrs) || 0
      if (r.is_confirmed) m[r.wc_id].confirmed++
    })
    return m
  }, [rows])

  const totalCols = 8 + extraKeys.length

  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length.toLocaleString()} / {rows.length.toLocaleString()} ops</span>
        {extraKeys.length > 0 && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: 'rgba(137,180,250,.15)', color: 'var(--blue)', border: '1px solid rgba(137,180,250,.3)', fontWeight: 600 }}>{totalCols} cols</span>}
        <input style={{ ...S.search, width: 200 }} placeholder="Order / Material / WC / Operation…" value={q} onChange={e => setQ(e.target.value)} />
        <select style={S.search} value={wf} onChange={e => setWf(e.target.value)}>
          <option value="">All WC</option>
          {wcs.map(w => <option key={w} value={w}>{w} — {wcSummary[w]?.ops ?? 0} ops</option>)}
        </select>
        {(q || wf) && <button style={S.btn} onClick={() => { setQ(''); setWf('') }}>✕ Clear</button>}
        <button style={{ ...S.btnRed, marginLeft: 'auto' }} disabled={busy || !rows.length} onClick={async () => {
          if (!confirm(`Delete all ${rows.length.toLocaleString()} SAP routing operations?`)) return
          setBusy(true)
          try { await apiFetch('/sap-routing', 'DELETE'); setRows([]) } catch (e) { alert(String(e)) }
          setBusy(false)
        }}>🗑 Delete All</button>
      </div>

      {rows.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--bord)', display: 'flex', gap: 16, flexWrap: 'wrap', flexShrink: 0 }}>
          {Object.entries(wcSummary).sort((a, b) => b[1].hrs - a[1].hrs).map(([wc, s]) => (
            <div key={wc} style={{ fontSize: 10, color: 'var(--txt2)', cursor: 'pointer' }} onClick={() => setWf(wf === wc ? '' : wc)}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: wf === wc ? 'var(--blue)' : 'var(--txt)', borderBottom: wf === wc ? '1px solid var(--blue)' : 'none' }}>{wc}</span>
              {' '}<span style={{ color: 'var(--txt3)' }}>{s.ops} ops · {s.hrs.toFixed(0)} h</span>
            </div>
          ))}
        </div>
      )}

      {/* Row limit selector */}
      {!loading && rows.length > 0 && (
        <div style={{ ...S.bar, padding: '6px 14px', borderBottom: '1px solid var(--bord)', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Show rows:</span>
          {[50, 100, 500, 1000].map(n => (
            <button key={n} onClick={() => setShowLimit(n)}
              style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--bord2)', cursor: 'pointer',
                background: showLimit === n ? 'var(--blue)' : 'var(--bg3)',
                color: showLimit === n ? '#000' : 'var(--txt2)', fontWeight: showLimit === n ? 700 : 400 }}>
              {n}
            </button>
          ))}
          <button onClick={() => setShowLimit(Infinity)}
            style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--bord2)', cursor: 'pointer',
              background: showLimit === Infinity ? 'var(--amber)' : 'var(--bg3)',
              color: showLimit === Infinity ? '#000' : 'var(--txt2)', fontWeight: showLimit === Infinity ? 700 : 400 }}>
            All ({filtered.length.toLocaleString()})
          </button>
          <span style={{ fontSize: 10, color: 'var(--txt3)' }}>
            Showing {Math.min(showLimit, filtered.length).toLocaleString()} / {filtered.length.toLocaleString()} rows
          </span>
        </div>
      )}

      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>Loading…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              <th style={{ ...S.th, textAlign: 'center' }}>#</th>
              {(['Order No','Material Code','WC','Operation','Std Hrs','Confirmed','Plant'] as string[]).map(h => (
                <th key={h} style={{ ...S.th, textAlign: h === 'Std Hrs' ? 'right' : h === 'Confirmed' ? 'center' : 'left' }}>{h}</th>
              ))}
              {extraKeys.map(k => <th key={k} style={{ ...S.th, color: 'var(--txt3)', fontWeight: 400 }}>{k}</th>)}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={totalCols} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>
                  {rows.length === 0 ? 'No SAP routing data — import via Import tab → SAP Routing' : 'No results'}
                </td></tr>
              )}
              {filtered.slice(0, showLimit === Infinity ? filtered.length : showLimit).map((r, i) => (
                <tr key={r.id}>
                  <td style={{ ...S.td, color: 'var(--txt3)', fontSize: 10, fontFamily: 'var(--mono)', textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--mono)', color: 'var(--blue)', fontSize: 10 }}>{r.order_no}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.material_code}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)' }}>{r.wc_id}</td>
                  <td style={{ ...S.td, color: 'var(--txt2)' }}>{r.operation}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{Number(r.std_hrs).toFixed(2)}</td>
                  <td style={{ ...S.td, textAlign: 'center', fontSize: 12 }}>{r.is_confirmed ? '✅' : <span style={{ opacity: 0.3 }}>○</span>}</td>
                  <td style={{ ...S.td, color: 'var(--txt3)', fontSize: 10 }}>{r.plant}</td>
                  {extraKeys.map(k => (
                    <td key={k} style={{ ...S.td, fontSize: 10, color: 'var(--txt2)', whiteSpace: 'nowrap' as const }}>{r.extra?.[k] || '—'}</td>
                  ))}
                </tr>
              ))}
              {showLimit !== Infinity && filtered.length > showLimit && (
                <tr><td colSpan={totalCols} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 10, fontSize: 10 }}>
                  Showing {showLimit.toLocaleString()} of {filtered.length.toLocaleString()} rows — increase limit or use filter
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── 7. ROUTING CR ────────────────────────────────────────────────────────────
function RoutingCr() {
  const [rows, setRows] = useState<RoutingCrRow[]>([]); const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [sf, setSf] = useState(''); const [wf, setWf] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAgg, setShowAgg] = useState(false)

  useEffect(() => {
    apiFetch('/routing-cr').then((d: RoutingCrRow[]) => { setRows(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const sheets = useMemo(() => [...new Set(rows.map(r => r.sheet_name))].sort(), [rows])
  const wcs    = useMemo(() => [...new Set(rows.map(r => r.wc_id))].sort(), [rows])

  const filtered = useMemo(() => {
    const lo = q.toLowerCase()
    return rows.filter(r =>
      (!lo || r.routing_group.toLowerCase().includes(lo) || r.wc_id.toLowerCase().includes(lo) ||
        r.description.toLowerCase().includes(lo) || r.size_label.toLowerCase().includes(lo)) &&
      (!sf || r.sheet_name === sf) &&
      (!wf || r.wc_id === wf)
    )
  }, [rows, q, sf, wf])

  const sheetSummary = useMemo(() => {
    const m: Record<string, { ops: number; groups: Set<string>; totalHrs: number }> = {}
    rows.forEach(r => {
      if (!m[r.sheet_name]) m[r.sheet_name] = { ops: 0, groups: new Set(), totalHrs: 0 }
      m[r.sheet_name].ops++
      m[r.sheet_name].groups.add(r.routing_group)
      m[r.sheet_name].totalHrs += Number(r.std_hrs) || 0
    })
    return m
  }, [rows])

  const aggRates = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach(r => {
      const key = `${r.sheet_name}||${r.size_kva}`
      map.set(key, (map.get(key) ?? 0) + (Number(r.std_hrs) || 0))
    })
    return [...map.entries()]
      .map(([key, total]) => { const [sheet, kva] = key.split('||'); return { sheet, kva: Number(kva), total } })
      .sort((a, b) => a.sheet.localeCompare(b.sheet) || a.kva - b.kva)
  }, [rows])

  const SHEET_COLOR: Record<string, string> = {
    'Core Oil Type': 'var(--blue)',
    'Core Dry Type Cast Resin': 'var(--amber)',
    'Core Dry Type Class H': 'var(--green)',
    'Core Tr Power': 'var(--purple)',
  }

  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length.toLocaleString()} / {rows.length.toLocaleString()} ops</span>
        <input style={{ ...S.search, width: 200 }} placeholder="Routing Group / WC / Description / ขนาด…" value={q} onChange={e => setQ(e.target.value)} />
        <select style={S.search} value={sf} onChange={e => setSf(e.target.value)}>
          <option value="">ทุกประเภท</option>
          {sheets.map(s => <option key={s} value={s}>{s} — {sheetSummary[s]?.groups.size ?? 0} groups</option>)}
        </select>
        <select style={S.search} value={wf} onChange={e => setWf(e.target.value)}>
          <option value="">All WC</option>
          {wcs.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        {(q || sf || wf) && <button style={S.btn} onClick={() => { setQ(''); setSf(''); setWf('') }}>✕ Clear</button>}
        <button style={{ ...S.btn, marginLeft: 'auto', border: `1px solid ${showAgg ? 'var(--green)' : 'var(--bord2)'}`, color: showAgg ? 'var(--green)' : 'var(--txt3)' }}
          onClick={() => setShowAgg(v => !v)}>📊 Agg Rates{aggRates.length > 0 ? ` (${aggRates.length})` : ''}</button>
        <button style={{ ...S.btnRed }} disabled={busy || !rows.length} onClick={async () => {
          if (!confirm(`ลบ Routing CR ทั้งหมด ${rows.length.toLocaleString()} operations?`)) return
          setBusy(true)
          try { await apiFetch('/routing-cr', 'DELETE'); setRows([]) } catch (e) { alert(String(e)) }
          setBusy(false)
        }}>🗑 Delete All</button>
      </div>

      {rows.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--bord)', display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
          {sheets.map(s => {
            const sum = sheetSummary[s]
            const col = SHEET_COLOR[s] ?? 'var(--txt2)'
            return (
              <div key={s} style={{ fontSize: 10, color: 'var(--txt2)', cursor: 'pointer' }} onClick={() => setSf(sf === s ? '' : s)}>
                <span style={{ fontWeight: 700, color: sf === s ? col : 'var(--txt)', borderBottom: sf === s ? `1px solid ${col}` : 'none' }}>{s}</span>
                {' '}<span style={{ color: 'var(--txt3)' }}>{sum?.groups.size} groups · {sum?.ops} ops</span>
              </div>
            )
          })}
        </div>
      )}

      {showAgg && aggRates.length > 0 && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--bord)', maxHeight: 240, overflow: 'auto' }}>
          <table style={{ ...S.tbl, fontSize: 11 }}>
            <thead><tr>
              <th style={S.th}>ประเภท</th>
              <th style={{ ...S.th, textAlign: 'right' }}>kVA</th>
              <th style={{ ...S.th, textAlign: 'right' }}>รวม Std Hrs</th>
              <th style={{ ...S.th, color: 'var(--txt3)', fontWeight: 400 }}>ใช้เป็น</th>
            </tr></thead>
            <tbody>
              {aggRates.map((r, i) => {
                const col = SHEET_COLOR[r.sheet] ?? 'var(--txt2)'
                const isCr = r.sheet.toLowerCase().includes('cast resin')
                return (
                  <tr key={i}>
                    <td style={{ ...S.td, color: col, fontWeight: 600, fontSize: 10 }}>{r.sheet}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.kva.toLocaleString()}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: 700 }}>{r.total.toFixed(2)}h</td>
                    <td style={{ ...S.td, fontSize: 10, color: isCr ? 'var(--purple)' : 'var(--blue)' }}>{isCr ? '⚗ TMC (Cast Resin)' : '✂ Normal'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>Loading…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              <th style={{ ...S.th, textAlign: 'center' }}>#</th>
              {(['ประเภท', 'ขนาด', 'kVA', 'Routing Group', 'Operation', 'Work Center', 'Description', 'Qty', 'Unit', 'Std Hrs'] as string[]).map(h => (
                <th key={h} style={{ ...S.th, textAlign: h === 'kVA' || h === 'Qty' || h === 'Std Hrs' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>
                  {rows.length === 0 ? 'ไม่มีข้อมูล — นำเข้าจาก Import → Routing CR' : 'ไม่พบผลลัพธ์'}
                </td></tr>
              )}
              {filtered.map((r, i) => {
                const col = SHEET_COLOR[r.sheet_name] ?? 'var(--txt2)'
                const m: React.CSSProperties = { ...S.td, fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'nowrap' }
                return (
                  <tr key={r.id} style={{ borderLeft: `3px solid ${col}22` }}>
                    <td style={{ ...S.td, color: 'var(--txt3)', fontSize: 10, fontFamily: 'var(--mono)', textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ ...S.td, fontSize: 10, color: col, fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sheet_name}</td>
                    <td style={{ ...m, color: 'var(--amber)', fontWeight: 700 }}>{r.size_label}</td>
                    <td style={{ ...m, textAlign: 'right', color: 'var(--txt2)' }}>{r.size_kva.toLocaleString()}</td>
                    <td style={{ ...m, color: 'var(--blue)', fontWeight: 700 }}>{r.routing_group}</td>
                    <td style={{ ...m, color: 'var(--txt2)' }}>{r.operation}</td>
                    <td style={{ ...m, color: 'var(--green)', fontWeight: 700 }}>{r.wc_id}</td>
                    <td style={{ ...S.td, fontSize: 11 }}>{r.description}</td>
                    <td style={{ ...m, textAlign: 'right' }}>{r.qty_per_op}</td>
                    <td style={{ ...m, color: 'var(--txt3)' }}>{r.unit}</td>
                    <td style={{ ...m, textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{Number(r.std_hrs).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Generic Routing Table (HV / LV) ─────────────────────────────────────────
function RoutingTable({ endpoint, label, accentColor }: { endpoint: string; label: string; accentColor: string }) {
  const [rows, setRows] = useState<RoutingCrRow[]>([]); const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [sf, setSf] = useState(''); const [wf, setWf] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiFetch(endpoint).then((d: RoutingCrRow[]) => { setRows(d); setLoading(false) }).catch(() => setLoading(false))
  }, [endpoint])

  const sheets = useMemo(() => [...new Set(rows.map(r => r.sheet_name))].sort(), [rows])
  const wcs    = useMemo(() => [...new Set(rows.map(r => r.wc_id))].sort(), [rows])

  const filtered = useMemo(() => {
    const lo = q.toLowerCase()
    return rows.filter(r =>
      (!lo || r.routing_group.toLowerCase().includes(lo) || r.wc_id.toLowerCase().includes(lo) ||
        r.description.toLowerCase().includes(lo) || r.size_label.toLowerCase().includes(lo)) &&
      (!sf || r.sheet_name === sf) &&
      (!wf || r.wc_id === wf)
    )
  }, [rows, q, sf, wf])

  const sheetSummary = useMemo(() => {
    const m: Record<string, { ops: number; groups: Set<string>; totalHrs: number }> = {}
    rows.forEach(r => {
      if (!m[r.sheet_name]) m[r.sheet_name] = { ops: 0, groups: new Set(), totalHrs: 0 }
      m[r.sheet_name].ops++
      m[r.sheet_name].groups.add(r.routing_group)
      m[r.sheet_name].totalHrs += Number(r.std_hrs) || 0
    })
    return m
  }, [rows])

  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length.toLocaleString()} / {rows.length.toLocaleString()} ops</span>
        <input style={{ ...S.search, width: 200 }} placeholder="Routing Group / WC / Description / ขนาด…" value={q} onChange={e => setQ(e.target.value)} />
        <select style={S.search} value={sf} onChange={e => setSf(e.target.value)}>
          <option value="">ทุกประเภท</option>
          {sheets.map(s => <option key={s} value={s}>{s} — {sheetSummary[s]?.groups.size ?? 0} groups</option>)}
        </select>
        <select style={S.search} value={wf} onChange={e => setWf(e.target.value)}>
          <option value="">All WC</option>
          {wcs.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        {(q || sf || wf) && <button style={S.btn} onClick={() => { setQ(''); setSf(''); setWf('') }}>✕ Clear</button>}
        <button style={{ ...S.btnRed, marginLeft: 'auto' }} disabled={busy || !rows.length} onClick={async () => {
          if (!confirm(`ลบ ${label} ทั้งหมด ${rows.length.toLocaleString()} operations?`)) return
          setBusy(true)
          try { await apiFetch(endpoint, 'DELETE'); setRows([]) } catch (e) { alert(String(e)) }
          setBusy(false)
        }}>🗑 Delete All</button>
      </div>

      {rows.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--bord)', display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
          {sheets.map(s => {
            const sum = sheetSummary[s]
            return (
              <div key={s} style={{ fontSize: 10, color: 'var(--txt2)', cursor: 'pointer' }} onClick={() => setSf(sf === s ? '' : s)}>
                <span style={{ fontWeight: 700, color: sf === s ? accentColor : 'var(--txt)', borderBottom: sf === s ? `1px solid ${accentColor}` : 'none' }}>{s}</span>
                {' '}<span style={{ color: 'var(--txt3)' }}>{sum?.groups.size} groups · {sum?.ops} ops</span>
              </div>
            )
          })}
        </div>
      )}

      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>Loading…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              <th style={{ ...S.th, textAlign: 'center' }}>#</th>
              {(['ประเภท', 'ขนาด', 'kVA', 'Routing Group', 'Operation', 'Work Center', 'Description', 'Qty', 'Unit', 'Std Hrs'] as string[]).map(h => (
                <th key={h} style={{ ...S.th, textAlign: h === 'kVA' || h === 'Qty' || h === 'Std Hrs' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>
                  {rows.length === 0 ? `ไม่มีข้อมูล — นำเข้าจาก Import → ${label}` : 'ไม่พบผลลัพธ์'}
                </td></tr>
              )}
              {filtered.map((r, i) => {
                const m: React.CSSProperties = { ...S.td, fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'nowrap' }
                return (
                  <tr key={r.id} style={{ borderLeft: `3px solid ${accentColor}22` }}>
                    <td style={{ ...S.td, color: 'var(--txt3)', fontSize: 10, fontFamily: 'var(--mono)', textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ ...S.td, fontSize: 10, color: accentColor, fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sheet_name}</td>
                    <td style={{ ...m, color: 'var(--amber)', fontWeight: 700 }}>{r.size_label}</td>
                    <td style={{ ...m, textAlign: 'right', color: 'var(--txt2)' }}>{r.size_kva.toLocaleString()}</td>
                    <td style={{ ...m, color: accentColor, fontWeight: 700 }}>{r.routing_group}</td>
                    <td style={{ ...m, color: 'var(--txt2)' }}>{r.operation}</td>
                    <td style={{ ...m, color: 'var(--green)', fontWeight: 700 }}>{r.wc_id}</td>
                    <td style={{ ...S.td, fontSize: 11 }}>{r.description}</td>
                    <td style={{ ...m, textAlign: 'right' }}>{r.qty_per_op}</td>
                    <td style={{ ...m, color: 'var(--txt3)' }}>{r.unit}</td>
                    <td style={{ ...m, textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{Number(r.std_hrs).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── CAP RATES ─────────────────────────────────────────────────────────────────
interface CapRateRow {
  id: number
  station_type: string
  section: string
  kva: number
  hrs_per_unit: number
  efficiency: number
  machines: number
  hrs_per_day: number
  working_days: number
  available_hrs: number
  source_file: string
}

function CapRates() {
  const [rows, setRows] = useState<CapRateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sf, setSf] = useState('')
  const [sec, setSec] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiFetch('/cap-rates').then((d: CapRateRow[]) => { setRows(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const stations = useMemo(() => [...new Set(rows.map(r => r.station_type))].sort(), [rows])
  const sections = useMemo(() => [...new Set(rows.filter(r => !sf || r.station_type === sf).map(r => r.section))].filter(Boolean).sort(), [rows, sf])

  const filtered = useMemo(() =>
    rows.filter(r => (!sf || r.station_type === sf) && (!sec || r.section === sec)),
    [rows, sf, sec])

  const STATION_COLOR: Record<string, string> = { 'LV-Foil': 'var(--blue)', 'LV-Wire': 'var(--green)', 'HV': 'var(--amber)' }

  const stationSummary = useMemo(() => {
    const m: Record<string, { count: number; avail: number }> = {}
    rows.forEach(r => {
      if (!m[r.station_type]) m[r.station_type] = { count: 0, avail: r.available_hrs }
      m[r.station_type].count++
    })
    return m
  }, [rows])

  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length.toLocaleString()} / {rows.length.toLocaleString()} rates</span>
        <select style={S.search} value={sf} onChange={e => { setSf(e.target.value); setSec('') }}>
          <option value="">ทุกสถานี</option>
          {stations.map(s => <option key={s} value={s}>{s} — {stationSummary[s]?.count ?? 0} rates</option>)}
        </select>
        {sections.length > 0 && (
          <select style={S.search} value={sec} onChange={e => setSec(e.target.value)}>
            <option value="">ทุก Section</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(sf || sec) && <button style={S.btn} onClick={() => { setSf(''); setSec('') }}>✕ Clear</button>}
        <button style={{ ...S.btnRed, marginLeft: 'auto' }} disabled={busy || !rows.length} onClick={async () => {
          if (!confirm(`ลบ CAP Rates ทั้งหมด ${rows.length.toLocaleString()} rows?`)) return
          setBusy(true)
          try { await apiFetch('/cap-rates', 'DELETE'); setRows([]) } catch (e) { alert(String(e)) }
          setBusy(false)
        }}>🗑 Delete All</button>
      </div>

      {rows.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--bord)', display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
          {stations.map(s => {
            const col = STATION_COLOR[s] ?? 'var(--txt2)'
            const sum = stationSummary[s]
            const ex = rows.find(r => r.station_type === s)
            return (
              <div key={s} style={{ fontSize: 10, cursor: 'pointer' }} onClick={() => setSf(sf === s ? '' : s)}>
                <span style={{ fontWeight: 700, color: sf === s ? col : 'var(--txt)', borderBottom: sf === s ? `1px solid ${col}` : 'none' }}>{s}</span>
                {' '}<span style={{ color: 'var(--txt3)' }}>{sum?.count} sizes</span>
                {ex && <span style={{ color: 'var(--txt3)', marginLeft: 4 }}>· eff {(ex.efficiency * 100).toFixed(0)}% · {ex.machines}m · {ex.available_hrs.toLocaleString()}h</span>}
              </div>
            )
          })}
        </div>
      )}

      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>Loading…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              <th style={{ ...S.th, textAlign: 'center' }}>#</th>
              {(['สถานี', 'Section', 'kVA', 'Hrs/Unit', 'Efficiency', 'เครื่อง', 'Hrs/Day', 'วันทำงาน', 'Hrs พร้อมใช้', 'ไฟล์'] as string[]).map(h => (
                <th key={h} style={{ ...S.th, textAlign: ['kVA','Hrs/Unit','เครื่อง','Hrs/Day','วันทำงาน','Hrs พร้อมใช้'].includes(h) ? 'right' as const : 'left' as const }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>
                  {rows.length === 0 ? 'ไม่มีข้อมูล — นำเข้าจาก Import → CAP พันคอยล์' : 'ไม่พบผลลัพธ์'}
                </td></tr>
              )}
              {filtered.map((r, i) => {
                const col = STATION_COLOR[r.station_type] ?? 'var(--txt2)'
                const m: React.CSSProperties = { ...S.td, fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'nowrap' }
                return (
                  <tr key={r.id} style={{ borderLeft: `3px solid ${col}22` }}>
                    <td style={{ ...S.td, color: 'var(--txt3)', fontSize: 10, fontFamily: 'var(--mono)', textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ ...S.td, fontSize: 10, color: col, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.station_type}</td>
                    <td style={{ ...m, color: 'var(--txt2)' }}>{r.section || '—'}</td>
                    <td style={{ ...m, textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{r.kva.toLocaleString()}</td>
                    <td style={{ ...m, textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{Number(r.hrs_per_unit).toFixed(2)}</td>
                    <td style={{ ...m, textAlign: 'right' }}>{(Number(r.efficiency) * 100).toFixed(0)}%</td>
                    <td style={{ ...m, textAlign: 'right' }}>{r.machines}</td>
                    <td style={{ ...m, textAlign: 'right' }}>{r.hrs_per_day}</td>
                    <td style={{ ...m, textAlign: 'right' }}>{r.working_days}</td>
                    <td style={{ ...m, textAlign: 'right', color: 'var(--amber)' }}>{Number(r.available_hrs).toLocaleString()}</td>
                    <td style={{ ...S.td, fontSize: 9, color: 'var(--txt3)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source_file}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── PLAN SNAPSHOTS ───────────────────────────────────────────────────────────
type PlanStatus = 'draft' | 'approved' | 'in_production' | 'completed' | 'cancelled' | 'archived'
interface SnapRow { id: number; week_start: string; week_end: string; label: string; status: PlanStatus; saved_at: string; confirmed_at: string | null; started_at: string | null; completed_at: string | null }

const SNAP_STATUS_LABEL: Record<PlanStatus, string> = { draft: '📝 Draft', approved: '✅ Approved', in_production: '▶ In Production', completed: '🏁 Completed', cancelled: '❌ Cancelled', archived: '📁 Archived' }
const SNAP_STATUS_COLOR: Record<PlanStatus, string> = { draft: 'var(--txt3)', approved: 'var(--blue)', in_production: 'var(--amber)', completed: 'var(--green)', cancelled: 'var(--red)', archived: 'var(--txt3)' }

function PlanSnapshots() {
  const [rows, setRows] = useState<SnapRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sf, setSf] = useState<PlanStatus | ''>('')

  useEffect(() => {
    apiFetch('/cutting-plan-snapshots').then((d: SnapRow[]) => { setRows(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => sf ? rows.filter(r => (r.status || 'draft') === sf) : rows, [rows, sf])
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { const s = r.status || 'draft'; m[s] = (m[s] ?? 0) + 1 })
    return m
  }, [rows])

  const del = async (id: number) => {
    if (!confirm('ลบ snapshot นี้?')) return
    await apiFetch(`/cutting-plan-snapshots/${id}`, 'DELETE')
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length} / {rows.length} snapshots</span>
        <select style={S.search} value={sf} onChange={e => setSf(e.target.value as PlanStatus | '')}>
          <option value="">ทุกสถานะ</option>
          {(Object.keys(SNAP_STATUS_LABEL) as PlanStatus[]).map(s => (
            <option key={s} value={s}>{SNAP_STATUS_LABEL[s]} ({statusCounts[s] ?? 0})</option>
          ))}
        </select>
        {sf && <button style={S.btn} onClick={() => setSf('')}>✕ Clear</button>}
        <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
          {(Object.keys(statusCounts) as PlanStatus[]).map(s => (
            <span key={s} onClick={() => setSf(sf === s ? '' : s)} style={{ cursor: 'pointer', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
              background: `${SNAP_STATUS_COLOR[s]}18`, color: SNAP_STATUS_COLOR[s], border: `1px solid ${SNAP_STATUS_COLOR[s]}33`,
              opacity: sf && sf !== s ? 0.4 : 1 }}>
              {SNAP_STATUS_LABEL[s]} {statusCounts[s]}
            </span>
          ))}
        </div>
      </div>
      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>กำลังโหลด…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              {['#','สัปดาห์','Label','Status','บันทึก','อนุมัติ','เริ่มผลิต','ปิด',''].map((h, i) => <th key={i} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.map((r, i) => {
                const st = (r.status || 'draft') as PlanStatus
                const col = SNAP_STATUS_COLOR[st]
                const isLocked = st === 'completed' || st === 'archived'
                return (
                  <tr key={r.id}>
                    <td style={{ ...S.td, color: 'var(--txt3)', fontSize: 10, textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ ...S.td, fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700, whiteSpace: 'nowrap' as const }}>{r.week_start} – {r.week_end}</td>
                    <td style={{ ...S.td, color: 'var(--txt2)' }}>{r.label || '—'}</td>
                    <td style={S.td}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: `${col}18`, color: col, border: `1px solid ${col}33`, whiteSpace: 'nowrap' as const }}>
                        {SNAP_STATUS_LABEL[st]}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt3)', whiteSpace: 'nowrap' as const }}>{new Date(r.saved_at).toLocaleString('th-TH')}</td>
                    <td style={{ ...S.td, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', whiteSpace: 'nowrap' as const }}>{r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString('th-TH') : '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', whiteSpace: 'nowrap' as const }}>{r.started_at ? new Date(r.started_at).toLocaleDateString('th-TH') : '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', whiteSpace: 'nowrap' as const }}>{r.completed_at ? new Date(r.completed_at).toLocaleDateString('th-TH') : '—'}</td>
                    <td style={S.td}>{!isLocked && <button style={S.del} onClick={() => del(r.id)}>🗑</button>}</td>
                  </tr>
                )
              })}
              {!filtered.length && <tr><td colSpan={9} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── OPEN LOAD ────────────────────────────────────────────────────────────────
interface OpenLoadRow { wc_id: string; hours: number }

function OpenLoad() {
  const [rows, setRows] = useState<OpenLoadRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/config/openload').then((d: Record<string, number>) => {
      setRows(Object.entries(d).map(([wc_id, hours]) => ({ wc_id, hours })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.hours), 0), [rows])
  const sorted = useMemo(() => [...rows].sort((a, b) => Number(b.hours) - Number(a.hours)), [rows])
  const max = sorted[0] ? Number(sorted[0].hours) : 1

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{rows.length} Work Centers</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 8 }}>รวม {total.toLocaleString(undefined, { maximumFractionDigits: 1 })} ชั่วโมง</span>
      </div>
      <div style={S.wrap}>
        {loading ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>กำลังโหลด…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              {['WC ID', 'Open Load (hrs)', ''].map((h, i) => <th key={i} style={{ ...S.th, textAlign: i === 1 ? 'right' as const : 'left' as const }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {sorted.map(r => {
                const pct = (Number(r.hours) / max) * 100
                const col = pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--amber)' : 'var(--green)'
                return (
                  <tr key={r.wc_id}>
                    <td style={{ ...S.td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{r.wc_id}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: col }}>{Number(r.hours).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                    <td style={{ ...S.td, width: 200 }}>
                      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 4, transition: 'width .3s' }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!rows.length && <tr><td colSpan={3} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ไม่มีข้อมูล Open Load</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── 8. OVERVIEW ──────────────────────────────────────────────────────────────
interface DBCounts {
  planOrders: number | null
  coil: number | null
  sapOps: number | null
  sapMaterials: number | null
  sapWCs: number | null
  routingCrOps: number | null
  routingCrGroups: number | null
  routingHvOps: number | null
  routingLvOps: number | null
  capRates: number | null
  coilMachines: number | null
  planSnapshots: number | null
  openLoad: number | null
}

function Overview({ onNavigate }: { onNavigate: (t: SubTab) => void }) {
  const { state } = useApp()
  const [counts, setCounts] = useState<DBCounts>({ planOrders: null, coil: null, sapOps: null, sapMaterials: null, sapWCs: null, routingCrOps: null, routingCrGroups: null, routingHvOps: null, routingLvOps: null, capRates: null, coilMachines: null, planSnapshots: null, openLoad: null })

  useEffect(() => {
    apiFetch('/plan-orders').then((d: unknown[]) => setCounts(p => ({ ...p, planOrders: d.length }))).catch(() => setCounts(p => ({ ...p, planOrders: 0 })))
    apiFetch('/coil-plan').then((d: unknown[]) => setCounts(p => ({ ...p, coil: d.length }))).catch(() => setCounts(p => ({ ...p, coil: 0 })))
    apiFetch('/sap-routing/summary').then((d: { wc_id: string; op_count: string }[]) => {
      const ops = d.reduce((s, r) => s + parseInt(r.op_count), 0)
      setCounts(p => ({ ...p, sapOps: ops, sapMaterials: null, sapWCs: d.length }))
    }).catch(() => setCounts(p => ({ ...p, sapOps: 0, sapWCs: 0 })))
    apiFetch('/routing-cr').then((d: RoutingCrRow[]) => {
      const groups = new Set(d.map(r => r.routing_group)).size
      setCounts(p => ({ ...p, routingCrOps: d.length, routingCrGroups: groups }))
    }).catch(() => setCounts(p => ({ ...p, routingCrOps: 0, routingCrGroups: 0 })))
    apiFetch('/routing-hv').then((d: unknown[]) => setCounts(p => ({ ...p, routingHvOps: d.length }))).catch(() => setCounts(p => ({ ...p, routingHvOps: 0 })))
    apiFetch('/routing-lv').then((d: unknown[]) => setCounts(p => ({ ...p, routingLvOps: d.length }))).catch(() => setCounts(p => ({ ...p, routingLvOps: 0 })))
    apiFetch('/cap-rates').then((d: unknown[]) => setCounts(p => ({ ...p, capRates: d.length }))).catch(() => setCounts(p => ({ ...p, capRates: 0 })))
    apiFetch('/coil-machines').then((d: unknown[]) => setCounts(p => ({ ...p, coilMachines: d.length }))).catch(() => setCounts(p => ({ ...p, coilMachines: 0 })))
    apiFetch('/cutting-plan-snapshots').then((d: unknown[]) => setCounts(p => ({ ...p, planSnapshots: d.length }))).catch(() => setCounts(p => ({ ...p, planSnapshots: 0 })))
    apiFetch('/config/openload').then((d: Record<string, number>) => setCounts(p => ({ ...p, openLoad: Object.keys(d).length }))).catch(() => setCounts(p => ({ ...p, openLoad: 0 })))
  }, [])

  const orders = state.orders ?? []
  const machines = state.cuttingMachines ?? []
  const holidays = Object.keys(state.factoryHolidays ?? {}).length
  const wcs = Object.keys(state.wcConfig ?? {}).length
  const products = Object.keys(state.products ?? {}).length
  const itemCodes = Object.keys(state.itemCodes ?? {}).length
  const employees = Object.values(state.employees ?? {}).flat().length
  const totalKva = orders.reduce((s, o) => s + (o.kva || 0) * (o.qty || 0), 0)

  const CARDS: { id: SubTab; icon: string; label: string; count: number | null; sub?: string; color: string; empty?: boolean }[] = [
    { id: 'orders',     icon: '📋', label: 'Master Plan',    count: orders.length,        sub: `${totalKva.toLocaleString()} kVA รวม`,  color: 'var(--blue)'   },
    { id: 'planorders', icon: '🗂',  label: 'Plan Orders',   count: counts.planOrders,    sub: 'plan order rows',                        color: 'var(--green)'  },
    { id: 'coil',       icon: '🔄', label: 'Coil Plan',     count: counts.coil,          sub: 'coil plan rows',                         color: '#89b4fa'       },
    { id: 'machines',      icon: '⚙️', label: 'Cutting Machines',  count: machines.length,       sub: 'เครื่องตัด',        color: 'var(--amber)'  },
    { id: 'coil_machines', icon: '🧲', label: 'Coil Machines',     count: counts.coilMachines,   sub: 'เครื่องพันคอยล์',   color: '#cba6f7'       },
    { id: 'employees',  icon: '👷', label: 'Employees',     count: employees,            sub: `${Object.values(state.employees ?? {}).flat().filter((e: { is_active: boolean }) => e.is_active).length} active`, color: 'var(--green)' },
    { id: 'holidays',   icon: '📆', label: 'Factory Holidays', count: holidays,          sub: 'วันหยุด',                                color: 'var(--red)'    },
    { id: 'sap',        icon: '🔧', label: 'SAP Routing',   count: counts.sapOps,        sub: counts.sapWCs != null ? `${counts.sapWCs} WCs` : undefined, color: 'var(--amber)' },
    { id: 'routing_cr', icon: '🪛', label: 'Routing CR',    count: counts.routingCrOps,  sub: counts.routingCrGroups != null ? `${counts.routingCrGroups} routing groups` : undefined, color: '#cba6f7' },
    { id: 'routing_hv', icon: '🔴', label: 'Routing HV',   count: counts.routingHvOps,  sub: 'พันคอยล์แรงสูง',  color: 'var(--amber)' },
    { id: 'routing_lv', icon: '🔵', label: 'Routing LV',   count: counts.routingLvOps,  sub: 'พันคอยล์แรงต่ำ',  color: '#89b4fa' },
    { id: 'cap',        icon: '📈', label: 'CAP พันคอยล์', count: counts.capRates,       sub: 'kVA rate entries', color: 'var(--green)' },
    { id: 'wc',         icon: '🏭', label: 'Work Centers',  count: wcs,                  sub: 'WC configured',                          color: 'var(--purple)' },
    { id: 'itemcodes',  icon: '🔑', label: 'Item Codes',    count: itemCodes,            sub: 'codes in catalog',                       color: '#3dc9b0'       },
    { id: 'orders',     icon: '📦', label: 'Products',      count: products,             sub: 'product types',                          color: 'var(--txt2)'   },
    { id: 'snapshots',  icon: '📅', label: 'Plan Snapshots', count: counts.planSnapshots, sub: 'cutting week plans',                    color: 'var(--green)'  },
    { id: 'openload',   icon: '⚖️', label: 'Open Load',     count: counts.openLoad,      sub: 'WCs with backlog',                       color: 'var(--amber)'  },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {CARDS.map((card, i) => {
          const hasData = card.count !== null && card.count > 0
          const loading = card.count === null
          const col = hasData ? card.color : 'var(--txt3)'
          return (
            <div key={i} onClick={() => onNavigate(card.id)}
              style={{ background: 'var(--bg2)', border: `1px solid ${hasData ? col + '40' : 'var(--bord)'}`, borderLeft: `4px solid ${col}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'background .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg2)')}
            >
              <div style={{ fontSize: 22, marginBottom: 6 }}>{card.icon}</div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 600, marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: col, lineHeight: 1 }}>
                {loading ? <span style={{ fontSize: 14, color: 'var(--txt3)' }}>…</span> : card.count === 0 ? <span style={{ fontSize: 18, color: 'var(--txt3)' }}>—</span> : card.count?.toLocaleString()}
              </div>
              {card.sub && <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>{card.sub}</div>}
              {!hasData && !loading && <div style={{ fontSize: 9, color: 'var(--red)', marginTop: 4 }}>ไม่มีข้อมูล</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 8. WC CONFIG ─────────────────────────────────────────────────────────────
function WCConfig() {
  const { state } = useApp()
  const wcs = useMemo(() =>
    Object.entries(state.wcConfig ?? {}).sort((a, b) => a[0].localeCompare(b[0])),
    [state.wcConfig]
  )
  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{wcs.length} Work Centers</span>
      </div>
      <div style={S.wrap}>
        <table style={S.tbl}>
          <thead><tr>
            {['WC ID','ชื่อ','Workers','hrs/day','OT hrs','Sat hrs','Sat OT','Efficiency %'].map((h, i) => (
              <th key={i} style={{ ...S.th, textAlign: i >= 2 ? 'center' as const : 'left' as const }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {wcs.map(([id, wc]) => (
              <tr key={id}>
                <td style={{ ...S.td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{id}</td>
                <td style={S.td}>{wc.name}</td>
                <td style={{ ...S.td, textAlign: 'center' as const, fontFamily: 'var(--mono)' }}>{wc.workers}</td>
                <td style={{ ...S.td, textAlign: 'center' as const, fontFamily: 'var(--mono)' }}>{wc.hrs}</td>
                <td style={{ ...S.td, textAlign: 'center' as const, fontFamily: 'var(--mono)' }}>{wc.ot}</td>
                <td style={{ ...S.td, textAlign: 'center' as const, fontFamily: 'var(--mono)' }}>{wc.sat_hrs}</td>
                <td style={{ ...S.td, textAlign: 'center' as const, fontFamily: 'var(--mono)' }}>{wc.sat_ot}</td>
                <td style={{ ...S.td, textAlign: 'center' as const, fontFamily: 'var(--mono)', color: wc.eff < 80 ? 'var(--red)' : wc.eff < 95 ? 'var(--amber)' : 'var(--green)' }}>{wc.eff}%</td>
              </tr>
            ))}
            {!wcs.length && <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center' as const, color: 'var(--txt3)', padding: 28 }}>ไม่มีข้อมูล WC</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 9. ITEM CODES ─────────────────────────────────────────────────────────────
function ItemCodes() {
  const { state } = useApp()
  const [q, setQ] = useState('')
  const all = useMemo(() => Object.entries(state.itemCodes ?? {}).sort((a, b) => a[0].localeCompare(b[0])), [state.itemCodes])
  const filtered = useMemo(() => {
    const lo = q.toLowerCase()
    return lo ? all.filter(([code, v]) => code.toLowerCase().includes(lo) || (v.description ?? '').toLowerCase().includes(lo) || (v.category ?? '').toLowerCase().includes(lo)) : all
  }, [all, q])

  const catCounts = useMemo(() => {
    const m: Record<string, number> = {}
    all.forEach(([, v]) => { m[v.category ?? 'other'] = (m[v.category ?? 'other'] ?? 0) + 1 })
    return m
  }, [all])

  return (
    <div style={S.card}>
      <div style={{ ...S.bar, padding: '10px 14px', borderBottom: '1px solid var(--bord)' }}>
        <span style={S.count}>{filtered.length} / {all.length} codes</span>
        <input style={{ ...S.search, width: 220 }} placeholder="ค้นหา code / description / category…" value={q} onChange={e => setQ(e.target.value)} />
        {q && <button style={S.btn} onClick={() => setQ('')}>✕</button>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 8 }}>
          {Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => (
            <span key={cat} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt3)', border: '1px solid var(--bord)' }}>
              {cat} <strong>{cnt}</strong>
            </span>
          ))}
        </div>
      </div>
      <div style={S.wrap}>
        <table style={S.tbl}>
          <thead><tr>
            {['Item Code','Description','Category'].map((h, i) => <th key={i} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.slice(0, 2000).map(([code, v]) => (
              <tr key={code}>
                <td style={{ ...S.td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)', fontSize: 10 }}>{code}</td>
                <td style={{ ...S.td, color: 'var(--txt2)' }}>{v.description}</td>
                <td style={{ ...S.td, color: 'var(--txt3)', fontSize: 10 }}>{v.category}</td>
              </tr>
            ))}
            {filtered.length > 2000 && <tr><td colSpan={3} style={{ ...S.td, textAlign: 'center' as const, color: 'var(--txt3)', fontSize: 10, padding: 10 }}>Showing 2,000 of {filtered.length.toLocaleString()} — use search to filter</td></tr>}
            {!filtered.length && <tr><td colSpan={3} style={{ ...S.td, textAlign: 'center' as const, color: 'var(--txt3)', padding: 28 }}>ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function DataTab() {
  const [sub, setSub] = useState<SubTab>('overview')
  return (
    <div style={S.root}>
      <div style={S.tabs}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            ...S.tab,
            borderBottom: `2px solid ${sub === t.id ? 'var(--blue)' : 'transparent'}`,
            color: sub === t.id ? 'var(--txt)' : 'var(--txt3)',
            fontWeight: sub === t.id ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>
      <div style={S.body}>
        {sub === 'overview'   && <Overview onNavigate={setSub} />}
        {sub === 'orders'     && <MasterPlan />}
        {sub === 'planorders' && <PlanOrders />}
        {sub === 'coil'       && <CoilPlan />}
        {sub === 'machines'      && <CuttingMachines />}
        {sub === 'coil_machines' && <CoilMachines />}
        {sub === 'employees'     && <Employees />}
        {sub === 'holidays'   && <Holidays />}
        {sub === 'sap'        && <SapRouting />}
        {sub === 'routing_cr' && <RoutingCr />}
        {sub === 'routing_hv' && <RoutingTable endpoint="/routing-hv" label="Routing HV" accentColor="var(--amber)" />}
        {sub === 'routing_lv' && <RoutingTable endpoint="/routing-lv" label="Routing LV" accentColor="#89b4fa" />}
        {sub === 'cap'        && <CapRates />}
        {sub === 'wc'         && <WCConfig />}
        {sub === 'itemcodes'  && <ItemCodes />}
        {sub === 'snapshots'  && <PlanSnapshots />}
        {sub === 'openload'   && <OpenLoad />}
      </div>
    </div>
  )
}
