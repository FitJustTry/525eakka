import { useEffect, useState, useMemo, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import type { Order, CuttingMachine } from '../../types'

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

type SubTab = 'orders' | 'coil' | 'machines' | 'employees' | 'holidays'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'orders',    label: '📋 Master Plan' },
  { id: 'coil',      label: '🔄 Coil Plan' },
  { id: 'machines',  label: '⚙️ เครื่องตัด' },
  { id: 'employees', label: '👷 พนักงาน' },
  { id: 'holidays',  label: '📆 วันหยุด' },
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
        </div>
      </div>
      <div style={S.wrap}>
        <table style={S.tbl}>
          <thead><tr>
            {['plan_date','SAP SO','ลูกค้า','kVA','จำนวน','Deadline','ประเภท','Comment','Product',''].map((h, i) => <th key={i} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} style={{ opacity: busy === o.id ? 0.5 : 1 }}>
                <td style={S.td}><EC mono v={o.plan_date ?? ''} w={100} onSave={v => save(o.id, 'plan_date', v)} /></td>
                <td style={S.td}><EC mono v={o.sap_so ?? ''} w={110} onSave={v => save(o.id, 'sap_so', v)} /></td>
                <td style={S.td}><EC v={o.customer ?? ''} w={120} onSave={v => save(o.id, 'customer', v)} /></td>
                <td style={{ ...S.td, textAlign: 'right' }}><EC mono v={String(o.kva ?? '')} w={58} onSave={v => save(o.id, 'kva', v)} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}><EC mono v={String(o.qty ?? '')} w={38} onSave={v => save(o.id, 'qty', v)} /></td>
                <td style={S.td}><EC mono v={o.deadline ?? ''} w={100} onSave={v => save(o.id, 'deadline', v)} /></td>
                <td style={{ ...S.td, textAlign: 'center' }}>
                  <span style={{ ...S.badge, background: `${catCol(o.category)}22`, color: catCol(o.category) }}>{o.category || '—'}</span>
                </td>
                <td style={S.td}><EC v={o.comment ?? ''} w={160} onSave={v => save(o.id, 'comment', v)} /></td>
                <td style={{ ...S.td, color: 'var(--txt3)', fontFamily: 'var(--mono)', fontSize: 10 }}>{o.product}</td>
                <td style={S.td}><button style={S.del} onClick={() => del(o.id)}>🗑</button></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={10} style={{ ...S.td, textAlign: 'center', color: 'var(--txt3)', padding: 28 }}>ไม่พบข้อมูล</td></tr>}
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
            {['ชื่อเครื่อง','จำนวน','kVA ต่ำสุด','kVA สูงสุด','h/ตัว','Laser','M4','หน้า min','หน้า max','เจาะ 8','เจาะ 22','หมายเหตุ',''].map((h, i) => <th key={i} style={S.th}>{h}</th>)}
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

// ── 4. EMPLOYEES ─────────────────────────────────────────────────────────────
interface EmpRow { id: string; emp_id: string; emp_name: string; firstname: string; lastname: string; dept: string; title: string; wc_id: string; is_active: boolean; is_head: boolean }

function Employees() {
  const [rows, setRows] = useState<EmpRow[]>([]); const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    apiFetch('/employees').then((d: EmpRow[]) => { setRows(d.sort((a, b) => (a.wc_id ?? '').localeCompare(b.wc_id ?? ''))); setLoading(false) })
  }, [])
  const filtered = useMemo(() => {
    const lo = q.toLowerCase()
    return lo ? rows.filter(r => (r.emp_name ?? '').toLowerCase().includes(lo) || (r.dept ?? '').toLowerCase().includes(lo) || (r.wc_id ?? '').toLowerCase().includes(lo)) : rows
  }, [rows, q])

  const save = async (id: string, field: string, val: unknown) => {
    setBusy(id)
    try {
      const updated = await apiFetch(`/employees/${encodeURIComponent(id)}`, 'PUT', { [field]: val })
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
    } catch (e) { alert(String(e)) }
    setBusy(null)
  }
  const del = async (id: string, name: string) => {
    if (!confirm(`ลบ ${name}?`)) return
    await apiFetch(`/employees/${encodeURIComponent(id)}`, 'DELETE')
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
      dispatch({ type: 'SET_FACTORY_HOLIDAYS', holidays: { ...state.factoryHolidays, [newDate]: newName.trim() } })
      setNewDate(''); setNewName('')
    } catch (e) { alert(String(e)) }
    setBusy(false)
  }
  const del = async (date: string) => {
    if (!confirm(`ลบวันหยุด ${date}?`)) return
    await apiFetch(`/factory-holidays/${encodeURIComponent(date)}`, 'DELETE')
    const next = { ...state.factoryHolidays }; delete next[date]
    dispatch({ type: 'SET_FACTORY_HOLIDAYS', holidays: next })
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

// ── Root ──────────────────────────────────────────────────────────────────────
export default function DataTab() {
  const [sub, setSub] = useState<SubTab>('orders')
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
        {sub === 'orders'    && <MasterPlan />}
        {sub === 'coil'      && <CoilPlan />}
        {sub === 'machines'  && <CuttingMachines />}
        {sub === 'employees' && <Employees />}
        {sub === 'holidays'  && <Holidays />}
      </div>
    </div>
  )
}
