import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { api } from '../../api'
import type { Order } from '../../types'

const CAT_COL: Record<string, string> = {
  Fast: 'var(--red)', หลัก: 'var(--blue)', เสริม: 'var(--green)', '': 'var(--txt3)',
}

export default function OrdersTab() {
  const { state, dispatch } = useApp()
  const { orders, products, itemCodes } = state

  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<Order> | null>(null)

  const q = search.toLowerCase()
  const filtered = useMemo(() => {
    let list = [...orders].sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''))
    if (filterCat) list = list.filter(o => o.category === filterCat)
    if (q) list = list.filter(o =>
      o.id.toLowerCase().includes(q) ||
      o.customer.toLowerCase().includes(q) ||
      (o.sap_so ?? '').toLowerCase().includes(q) ||
      (o.item_code ?? '').toLowerCase().includes(q)
    )
    return list
  }, [orders, filterCat, q])

  const cats = useMemo(() => [...new Set(orders.map(o => o.category).filter(Boolean))].sort(), [orders])

  const totalKVA = useMemo(() => orders.reduce((s, o) => s + o.kva * o.qty, 0), [orders])
  const overdue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return orders.filter(o => o.deadline < today).length
  }, [orders])
  const unscheduled = useMemo(() => orders.filter(o => !o.plan_date).length, [orders])

  async function handleDelete(id: string) {
    if (!confirm(`ลบ Order ${id}?`)) return
    const next = orders.filter(o => o.id !== id)
    dispatch({ type: 'SET_ORDERS', orders: next })
    await api.orders.delete(id)
  }

  async function handleSaveEdit() {
    if (!editing || !editing.id) return
    const orig = orders.find(o => o.id === editing.id)
    if (!orig) return
    const updated: Order = { ...orig, ...editing } as Order
    const next = orders.map(o => o.id === updated.id ? updated : o)
    dispatch({ type: 'SET_ORDERS', orders: next })
    await api.orders.upsert(updated)
    setEditing(null)
  }

  const today = new Date().toISOString().slice(0, 10)
  const th: React.CSSProperties = { padding: '7px 8px', textAlign: 'left', color: 'var(--txt3)', fontSize: 10, fontWeight: 600, background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2 }
  const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '0.5px solid var(--bord)', fontSize: 11, verticalAlign: 'middle' }

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>📋 Orders</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>รายการ Production Orders ที่รับเข้าระบบ</div>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          ['Orders ทั้งหมด', orders.length, 'var(--txt)'],
          ['MVA รวม', (totalKVA / 1000).toFixed(1) + ' MVA', 'var(--blue)'],
          ['เกินกำหนด', overdue, overdue > 0 ? 'var(--red)' : 'var(--green)'],
          ['ยังไม่กำหนดวัน', unscheduled, unscheduled > 0 ? 'var(--amber)' : 'var(--green)'],
        ].map(([lbl, val, col]) => (
          <div key={String(lbl)} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--bord)' }}>
            <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{lbl}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: col as string }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="ค้นหา Order / ลูกค้า / SAP SO..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none', width: 260 }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ fontSize: 11, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none' }}>
          <option value="">หมวดทั้งหมด</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || filterCat) && <button onClick={() => { setSearch(''); setFilterCat('') }}
          style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>✕ ล้าง</button>}
        <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 'auto' }}>แสดง {filtered.length}/{orders.length}</span>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={th}>Order ID</th>
                <th style={th}>ลูกค้า</th>
                <th style={{ ...th, textAlign: 'center' }}>kVA</th>
                <th style={{ ...th, textAlign: 'center' }}>จำนวน</th>
                <th style={{ ...th, textAlign: 'center' }}>หมวด</th>
                <th style={{ ...th, textAlign: 'center' }}>กำหนดส่ง</th>
                <th style={{ ...th, textAlign: 'center' }}>วันผลิต</th>
                <th style={{ ...th, textAlign: 'center' }}>Item Code</th>
                <th style={{ ...th }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const isOver = o.deadline < today
                const isExp = expanded === o.id
                const isEdit = editing?.id === o.id
                const catCol = CAT_COL[o.category] ?? 'var(--txt3)'
                const p = products[o.product]
                const ic = o.item_code ? itemCodes[o.item_code] : null

                return (
                  <>
                    <tr key={o.id}
                      style={{ background: isExp ? 'rgba(91,142,240,.06)' : isOver ? 'rgba(224,90,78,.04)' : 'transparent', cursor: 'pointer' }}
                      onClick={() => setExpanded(isExp ? null : o.id)}>
                      <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{o.id}</td>
                      <td style={td}>{o.customer || <span style={{ color: 'var(--txt3)', fontStyle: 'italic' }}>—</span>}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)' }}>{o.kva.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)' }}>{o.qty}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {o.category
                          ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: catCol + '20', color: catCol, fontWeight: 700 }}>{o.category}</span>
                          : <span style={{ color: 'var(--bord2)', fontSize: 9 }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'center', color: isOver ? 'var(--red)' : 'var(--txt2)', fontWeight: isOver ? 700 : 400 }}>
                        {o.deadline}{isOver && ' ⚠'}
                      </td>
                      <td style={{ ...td, textAlign: 'center', color: o.plan_date ? 'var(--txt2)' : 'var(--txt3)', fontStyle: o.plan_date ? 'normal' : 'italic', fontSize: 10 }}>
                        {o.plan_date ?? 'ยังไม่กำหนด'}
                      </td>
                      <td style={{ ...td, textAlign: 'center', fontSize: 9 }}>
                        {o.item_code
                          ? <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt2)' }} title={ic?.description}>{o.item_code}</span>
                          : <span style={{ color: 'var(--bord2)' }}>—</span>}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setEditing({ ...o })} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer', marginRight: 4 }}>✏</button>
                        <button onClick={() => handleDelete(o.id)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(224,90,78,.3)', background: 'rgba(224,90,78,.06)', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
                      </td>
                    </tr>
                    {isExp && !isEdit && (
                      <tr key={o.id + '_detail'}>
                        <td colSpan={9} style={{ padding: '10px 16px', background: 'rgba(91,142,240,.04)', borderBottom: '1px solid var(--bord)' }}>
                          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 11 }}>
                            <div>
                              <div style={{ color: 'var(--txt3)', fontSize: 10, marginBottom: 4 }}>ผลิตภัณฑ์</div>
                              <div style={{ color: 'var(--txt)', fontWeight: 500 }}>{p?.label ?? o.product}</div>
                            </div>
                            {o.sap_so && <div>
                              <div style={{ color: 'var(--txt3)', fontSize: 10, marginBottom: 4 }}>SAP SO</div>
                              <div style={{ fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{o.sap_so}</div>
                            </div>}
                            {o.comment && <div>
                              <div style={{ color: 'var(--txt3)', fontSize: 10, marginBottom: 4 }}>หมายเหตุ</div>
                              <div style={{ color: 'var(--txt2)' }}>{o.comment}</div>
                            </div>}
                            {p && <div>
                              <div style={{ color: 'var(--txt3)', fontSize: 10, marginBottom: 4 }}>Operations ({p.ops.length})</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {p.ops.map(op => (
                                  <span key={op.wc + op.name} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'var(--bg3)', border: '1px solid var(--bord2)', color: 'var(--txt2)' }}>
                                    <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{op.wc}</span> {(op.hrs * o.qty).toFixed(1)}h
                                  </span>
                                ))}
                              </div>
                            </div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
                  {q || filterCat ? 'ไม่พบ Order ที่ตรงกับเงื่อนไข' : 'ยังไม่มี Orders — ไปที่แท็บ Simulate หรือ Import'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setEditing(null)}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 12, padding: '1.5rem', width: 380, maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>✏ แก้ไข Order — {editing.id}</div>
            {[
              ['ลูกค้า', 'customer', 'text'],
              ['จำนวน', 'qty', 'number'],
              ['kVA', 'kva', 'number'],
              ['วันกำหนดส่ง', 'deadline', 'date'],
              ['วันที่ผลิต', 'plan_date', 'date'],
              ['SAP SO', 'sap_so', 'text'],
              ['Item Code', 'item_code', 'text'],
              ['หมายเหตุ', 'comment', 'text'],
            ].map(([lbl, key, type]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--txt2)', display: 'block', marginBottom: 4 }}>{lbl}</label>
                <input type={type} value={String((editing as Record<string, unknown>)[key] ?? '')}
                  onChange={e => setEditing(prev => ({ ...prev, [key]: type === 'number' ? parseInt(e.target.value) || 0 : e.target.value }))}
                  style={{ width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none' }} />
              </div>
            ))}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--txt2)', display: 'block', marginBottom: 4 }}>หมวด</label>
              <select value={editing.category ?? ''} onChange={e => setEditing(prev => ({ ...prev, category: e.target.value }))}
                style={{ width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none' }}>
                <option value="">—</option>
                <option value="Fast">Fast</option>
                <option value="หลัก">หลัก</option>
                <option value="เสริม">เสริม</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleSaveEdit} style={{ flex: 1, padding: '8px', background: 'var(--green)', border: 'none', color: '#000', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>บันทึก</button>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '8px', background: 'var(--bg3)', border: '1px solid var(--bord2)', color: 'var(--txt2)', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
