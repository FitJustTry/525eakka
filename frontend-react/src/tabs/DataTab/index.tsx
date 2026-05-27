import { useEffect, useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import type { Order } from '../../types'

// ── shared styles ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:    { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 12, background: 'var(--bg)' },
  card:    { background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  bar:     { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--bord)', flexWrap: 'wrap' },
  title:   { fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginRight: 4 },
  input:   { background: 'var(--bg3)', border: '1px solid var(--bord)', borderRadius: 6, color: 'var(--txt)', fontSize: 11, padding: '4px 8px', outline: 'none' },
  badge:   { fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600 },
  wrap:    { flex: 1, overflow: 'auto' },
  tbl:     { borderCollapse: 'collapse' as const, width: '100%', fontSize: 11 },
  th:      { background: 'var(--bg3)', position: 'sticky' as const, top: 0, zIndex: 2, padding: '6px 10px', fontWeight: 700, color: 'var(--txt2)', borderBottom: '1px solid var(--bord)', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
  td:      { padding: '5px 10px', borderBottom: '1px solid var(--bord)', verticalAlign: 'middle' as const },
  editInp: { background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 4, color: 'var(--txt)', fontSize: 11, padding: '2px 6px', width: '100%' },
  del:     { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 13, padding: '2px 6px', borderRadius: 4, opacity: 0.6 },
  btn:     { background: 'var(--bg3)', border: '1px solid var(--bord)', borderRadius: 6, color: 'var(--txt2)', cursor: 'pointer', fontSize: 11, padding: '4px 12px' },
  btnRed:  { background: 'rgba(224,90,78,.12)', border: '1px solid rgba(224,90,78,.3)', borderRadius: 6, color: 'var(--red)', cursor: 'pointer', fontSize: 11, padding: '4px 12px' },
  sub:     { display: 'flex', gap: 0, borderBottom: '1px solid var(--bord)' },
  subBtn:  (active: boolean): React.CSSProperties => ({ background: 'none', border: 'none', borderBottom: `2px solid ${active ? 'var(--blue)' : 'transparent'}`, color: active ? 'var(--txt)' : 'var(--txt3)', cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 400, padding: '8px 16px' }),
}

// ── tiny inline editable cell ──────────────────────────────────────────────────
function EditCell({ value, onSave, width = 90, mono = false }: { value: string; onSave: (v: string) => void; width?: number; mono?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) return (
    <span onClick={() => { setDraft(value); setEditing(true) }}
      style={{ cursor: 'text', fontFamily: mono ? 'var(--mono)' : undefined, color: value ? 'var(--txt)' : 'var(--txt3)', minWidth: width, display: 'inline-block' }}>
      {value || '—'}
    </span>
  )
  return (
    <input autoFocus style={{ ...s.editInp, width }}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft) }}
      onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); if (draft !== value) onSave(draft) } if (e.key === 'Escape') setEditing(false) }}
    />
  )
}

// ── Master Plan section ────────────────────────────────────────────────────────
function MasterPlanSection() {
  const { state, dispatch } = useApp()
  const orders = state.orders ?? []
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [confirmWeek, setConfirmWeek] = useState('')

  const filtered = useMemo(() => {
    let list = orders
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(o =>
        o.sap_so?.toLowerCase().includes(q) ||
        o.customer?.toLowerCase().includes(q) ||
        o.product?.toLowerCase().includes(q) ||
        String(o.kva).includes(q)
      )
    }
    if (dateFrom) list = list.filter(o => (o.plan_date ?? '') >= dateFrom)
    if (dateTo)   list = list.filter(o => (o.plan_date ?? '') <= dateTo)
    return list.slice().sort((a, b) => (a.plan_date ?? '').localeCompare(b.plan_date ?? '') || a.id.localeCompare(b.id))
  }, [orders, search, dateFrom, dateTo])

  const weeks = useMemo(() => {
    const set = new Set<string>()
    orders.forEach(o => { if (o.plan_date) set.add(o.plan_date.slice(0, 10).slice(0, 8) + '01') })
    const ws = new Set<string>()
    orders.forEach(o => {
      if (!o.plan_date) return
      const d = new Date(o.plan_date)
      const dow = d.getDay(); const toMon = dow === 0 ? -6 : 1 - dow
      d.setDate(d.getDate() + toMon)
      ws.add(d.toISOString().slice(0, 10))
    })
    return [...ws].sort()
  }, [orders])

  async function save(id: string, field: string, value: string) {
    setSaving(id)
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated: Order = await res.json()
      dispatch({ type: 'SET_ORDERS', orders: orders.map(o => o.id === id ? updated : o) })
    } catch (e) { alert('บันทึกไม่ได้: ' + String(e)) }
    setSaving(null)
  }

  async function deleteRow(id: string) {
    setDeleting(id)
    await fetch(`/api/orders/${encodeURIComponent(id)}`, { method: 'DELETE' })
    dispatch({ type: 'SET_ORDERS', orders: orders.filter(o => o.id !== id) })
    setDeleting(null)
  }

  async function deleteWeek(weekStart: string) {
    const toDelete = orders.filter(o => {
      if (!o.plan_date) return false
      const d = new Date(o.plan_date)
      const dow = d.getDay(); const toMon = dow === 0 ? -6 : 1 - dow
      d.setDate(d.getDate() + toMon)
      return d.toISOString().slice(0, 10) === weekStart
    })
    for (const o of toDelete) {
      await fetch(`/api/orders/${encodeURIComponent(o.id)}`, { method: 'DELETE' })
    }
    dispatch({ type: 'SET_ORDERS', orders: orders.filter(o => !toDelete.find(d => d.id === o.id)) })
    setConfirmWeek('')
  }

  const catColor = (cat: string) =>
    cat === 'หลัก' ? 'var(--blue)' : cat === 'เสริม' ? 'var(--green)' : 'var(--txt3)'

  return (
    <div style={s.card}>
      <div style={s.bar}>
        <span style={s.title}>Master Plan</span>
        <span style={{ ...s.badge, background: 'rgba(137,180,250,.15)', color: 'var(--blue)' }}>
          {filtered.length} / {orders.length} รายการ
        </span>
        <input style={{ ...s.input, width: 180 }} placeholder="ค้นหา SAP SO / ลูกค้า / kVA…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <input style={{ ...s.input, width: 118 }} type="date" value={dateFrom}
          onChange={e => setDateFrom(e.target.value)} title="ตั้งแต่วันที่" />
        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>–</span>
        <input style={{ ...s.input, width: 118 }} type="date" value={dateTo}
          onChange={e => setDateTo(e.target.value)} title="ถึงวันที่" />
        {(dateFrom || dateTo || search) && (
          <button style={s.btn} onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}>✕ ล้าง</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select style={{ ...s.input }} value={confirmWeek} onChange={e => setConfirmWeek(e.target.value)}>
            <option value="">ลบทั้งสัปดาห์…</option>
            {weeks.map(w => <option key={w} value={w}>สัปดาห์ {w}</option>)}
          </select>
          {confirmWeek && (
            <button style={s.btnRed} onClick={() => deleteWeek(confirmWeek)}>
              🗑 ลบสัปดาห์ {confirmWeek}
            </button>
          )}
        </div>
      </div>

      <div style={s.wrap}>
        <table style={s.tbl}>
          <thead>
            <tr>
              {['plan_date','SAP SO','ลูกค้า','kVA','จำนวน','Deadline','ประเภท','Comment','Product',''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} style={{ background: saving === o.id ? 'rgba(137,180,250,.06)' : undefined, opacity: deleting === o.id ? 0.4 : 1 }}>
                <td style={s.td}>
                  <EditCell mono value={o.plan_date ?? ''} width={100}
                    onSave={v => save(o.id, 'plan_date', v)} />
                </td>
                <td style={s.td}>
                  <EditCell mono value={o.sap_so ?? ''} width={110}
                    onSave={v => save(o.id, 'sap_so', v)} />
                </td>
                <td style={s.td}>
                  <EditCell value={o.customer ?? ''} width={120}
                    onSave={v => save(o.id, 'customer', v)} />
                </td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  <EditCell mono value={String(o.kva ?? '')} width={60}
                    onSave={v => save(o.id, 'kva', v)} />
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <EditCell mono value={String(o.qty ?? '')} width={40}
                    onSave={v => save(o.id, 'qty', v)} />
                </td>
                <td style={s.td}>
                  <EditCell mono value={o.deadline ?? ''} width={100}
                    onSave={v => save(o.id, 'deadline', v)} />
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <span style={{ ...s.badge, background: `${catColor(o.category)}22`, color: catColor(o.category) }}>
                    {o.category || '—'}
                  </span>
                </td>
                <td style={s.td}>
                  <EditCell value={o.comment ?? ''} width={160}
                    onSave={v => save(o.id, 'comment', v)} />
                </td>
                <td style={{ ...s.td, color: 'var(--txt3)', fontFamily: 'var(--mono)', fontSize: 10 }}>{o.product}</td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <button style={s.del} title="ลบแถวนี้"
                    onClick={() => { if (confirm(`ลบ ${o.sap_so || o.id}?`)) deleteRow(o.id) }}>🗑</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ ...s.td, textAlign: 'center', color: 'var(--txt3)', padding: 32 }}>ไม่พบข้อมูล</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Coil Plan section ──────────────────────────────────────────────────────────
interface CoilRow {
  id: number; plan_date: string; seq: number; importance: string
  sap_so: string; item_code: string; comment: string; plant: string
  kva: number; electrical: string; customer: string
  total_kva: number; qty: number
  enter_test: string; cable_box: string; control: string
  due_store: string; due_so: string; adjust_plan: string
  due_clamp: string; due_box_ctrl: string; raw_mat: string
  lv: string; hv: string; week_start: string
}

function CoilPlanSection() {
  const [rows, setRows] = useState<CoilRow[]>([])
  const [loading, setLoading] = useState(true)
  const [weekFilter, setWeekFilter] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/coil-plan').then(r => r.json()).then(d => { setRows(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const weeks = useMemo(() => [...new Set(rows.map(r => r.week_start))].sort(), [rows])

  const filtered = useMemo(() =>
    weekFilter ? rows.filter(r => r.week_start === weekFilter) : rows
  , [rows, weekFilter])

  async function deleteRow(id: number) {
    setDeleting(id)
    await fetch(`/api/coil-plan/${id}`, { method: 'DELETE' })
    setRows(prev => prev.filter(r => r.id !== id))
    setDeleting(null)
  }

  async function deleteWeek(week: string) {
    await fetch(`/api/coil-plan/week/${encodeURIComponent(week)}`, { method: 'DELETE' })
    setRows(prev => prev.filter(r => r.week_start !== week))
    setWeekFilter('')
  }

  const catColor = (imp: string) =>
    imp === 'หลัก' ? 'var(--blue)' : imp === 'เสริม' ? 'var(--green)' : 'var(--txt3)'

  return (
    <div style={s.card}>
      <div style={s.bar}>
        <span style={s.title}>Coil Plan</span>
        <span style={{ ...s.badge, background: 'rgba(137,180,250,.15)', color: 'var(--blue)' }}>
          {filtered.length} / {rows.length} รายการ
        </span>
        <select style={s.input} value={weekFilter} onChange={e => setWeekFilter(e.target.value)}>
          <option value="">ทุกสัปดาห์</option>
          {weeks.map(w => <option key={w} value={w}>สัปดาห์ {w}</option>)}
        </select>
        {weekFilter && (
          <button style={s.btnRed} onClick={() => { if (confirm(`ลบทั้งสัปดาห์ ${weekFilter}?`)) deleteWeek(weekFilter) }}>
            🗑 ลบสัปดาห์ {weekFilter}
          </button>
        )}
        {weekFilter && <button style={s.btn} onClick={() => setWeekFilter('')}>✕ ล้าง</button>}
      </div>

      <div style={s.wrap}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)' }}>กำลังโหลด…</div>
        ) : (
          <table style={s.tbl}>
            <thead>
              <tr>
                {['วันที่','ลำดับ','ความสำคัญ','SAP SO','Itemcode','Comment','Plant','kVA','ระบบไฟฟ้า','ลูกค้า','Total kVA','จำนวน','เข้าเทส','CableBox','Control','กำหนดส่งสโตร์','DUE SO','แจ้งปรับแผน','Due Clamp','Due BOX/CTRL','Raw Mat','LV','HV','สัปดาห์',''].map((h, i) => (
                  <th key={i} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const dim: React.CSSProperties = { ...s.td, fontSize: 10, whiteSpace: 'nowrap' }
                const mono: React.CSSProperties = { ...dim, fontFamily: 'var(--mono)' }
                return (
                <tr key={r.id} style={{ opacity: deleting === r.id ? 0.4 : 1 }}>
                  <td style={{ ...mono, color: 'var(--blue)' }}>{r.plan_date}</td>
                  <td style={{ ...mono, textAlign: 'center' }}>{r.seq}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <span style={{ ...s.badge, background: `${catColor(r.importance)}22`, color: catColor(r.importance) }}>
                      {r.importance || '—'}
                    </span>
                  </td>
                  <td style={{ ...mono, fontWeight: 700, color: 'var(--amber)' }}>{r.sap_so || '—'}</td>
                  <td style={{ ...mono, color: 'var(--txt3)' }}>{r.item_code || '—'}</td>
                  <td style={{ ...dim, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.comment || '—'}</td>
                  <td style={{ ...dim, color: 'var(--txt3)' }}>{r.plant || '—'}</td>
                  <td style={{ ...mono, textAlign: 'right', color: 'var(--blue)', fontWeight: 700 }}>{r.kva?.toLocaleString()}</td>
                  <td style={{ ...dim, textAlign: 'center' }}>{r.electrical || '—'}</td>
                  <td style={{ ...dim, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customer || '—'}</td>
                  <td style={{ ...mono, textAlign: 'right' }}>{r.total_kva?.toLocaleString()}</td>
                  <td style={{ ...mono, textAlign: 'center', fontWeight: 700 }}>{r.qty}</td>
                  <td style={mono}>{r.enter_test || '—'}</td>
                  <td style={dim}>{r.cable_box || '—'}</td>
                  <td style={dim}>{r.control || '—'}</td>
                  <td style={mono}>{r.due_store || '—'}</td>
                  <td style={{ ...mono, color: 'var(--amber)' }}>{r.due_so || '—'}</td>
                  <td style={mono}>{r.adjust_plan || '—'}</td>
                  <td style={mono}>{r.due_clamp || '—'}</td>
                  <td style={mono}>{r.due_box_ctrl || '—'}</td>
                  <td style={{ ...dim, color: 'var(--txt2)' }}>{r.raw_mat || '—'}</td>
                  <td style={{ ...dim, color: 'var(--txt2)' }}>{r.lv || '—'}</td>
                  <td style={{ ...dim, color: 'var(--txt2)' }}>{r.hv || '—'}</td>
                  <td style={{ ...mono, color: 'var(--txt3)' }}>{r.week_start}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <button style={s.del} title="ลบแถวนี้"
                      onClick={() => { if (confirm(`ลบ #${r.id} ${r.sap_so}?`)) deleteRow(r.id) }}>🗑</button>
                  </td>
                </tr>
              )})}
              {filtered.length === 0 && (
                <tr><td colSpan={25} style={{ ...s.td, textAlign: 'center', color: 'var(--txt3)', padding: 32 }}>ไม่พบข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function DataTab() {
  const [sub, setSub] = useState<'master' | 'coil'>('master')
  return (
    <div style={s.root}>
      <div style={{ display: 'flex', gap: 0, background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
        <button style={s.subBtn(sub === 'master')} onClick={() => setSub('master')}>📋 Master Plan</button>
        <button style={s.subBtn(sub === 'coil')}   onClick={() => setSub('coil')}>🔄 Coil Plan</button>
      </div>
      {sub === 'master' && <MasterPlanSection />}
      {sub === 'coil'   && <CoilPlanSection />}
    </div>
  )
}
