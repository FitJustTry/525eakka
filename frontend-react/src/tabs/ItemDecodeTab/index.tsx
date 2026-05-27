import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { api } from '../../api'
import type { ItemCode } from '../../types'

export default function ItemDecodeTab() {
  const { state, dispatch } = useApp()
  const { itemCodes, orders } = state

  const [search, setSearch] = useState('')
  const [editCode, setEditCode] = useState<string | null>(null)
  const [addMode, setAddMode]  = useState(false)

  const [newCode, setNewCode]  = useState('')
  const [newDesc, setNewDesc]  = useState('')
  const [newCat,  setNewCat]   = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCat,  setEditCat]  = useState('')

  const seenInOrders: Record<string, number> = {}
  orders.forEach(o => { if (o.item_code) seenInOrders[o.item_code] = (seenInOrders[o.item_code] ?? 0) + 1 })

  const allCodes = [...new Set([...Object.keys(itemCodes), ...Object.keys(seenInOrders)])].sort()
  const q = search.toLowerCase()
  const filtered = q
    ? allCodes.filter(c => c.toLowerCase().includes(q) || (itemCodes[c]?.description ?? '').toLowerCase().includes(q))
    : allCodes

  const unregistered = allCodes.filter(c => !itemCodes[c])

  async function handleSave(code: string, desc: string, cat: string) {
    const data: ItemCode = { description: desc, category: cat }
    const next = { ...itemCodes, [code]: data }
    dispatch({ type: 'SET_ITEM_CODES', itemCodes: next })
    await api.itemCodes.upsert(code, data)
    setEditCode(null); setAddMode(false)
    setNewCode(''); setNewDesc(''); setNewCat('')
  }

  async function handleDelete(code: string) {
    if (!confirm(`ลบ Item Code "${code}" ออกจากระบบ?`)) return
    const next = { ...itemCodes }; delete next[code]
    dispatch({ type: 'SET_ITEM_CODES', itemCodes: next })
    await api.itemCodes.delete(code)
  }

  function startEdit(code: string) {
    setEditCode(code); setAddMode(false)
    setEditDesc(itemCodes[code]?.description ?? '')
    setEditCat(itemCodes[code]?.category ?? '')
  }

  const catCol: Record<string, string> = { 'หลัก': 'var(--blue)', 'Fast': 'var(--red)', 'เสริม': 'var(--green)', '': 'var(--txt3)' }
  const th: React.CSSProperties = { padding: '8px 8px', textAlign: 'left', color: 'var(--txt3)', fontWeight: 600, fontSize: 10, background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', position: 'sticky', top: 0, zIndex: 2 }
  const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '0.5px solid var(--bord)', fontSize: 11 }

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>🔑 Item Code Decoder</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>แปลง Item Code จาก Excel เป็นคำอธิบาย</div>
        </div>
        <button onClick={() => { setAddMode(true); setEditCode(null) }}
          style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#000', fontWeight: 700, cursor: 'pointer' }}>
          + เพิ่ม Item Code
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        {[['รหัสทั้งหมด', allCodes.length, 'var(--txt)'],['ลงทะเบียนแล้ว', Object.keys(itemCodes).length, 'var(--green)'],['ยังไม่มีคำอธิบาย', unregistered.length, unregistered.length > 0 ? 'var(--amber)' : 'var(--green)'],['พบใน Orders', Object.keys(seenInOrders).length, 'var(--txt)']].map(([lbl, val, col]) => (
          <div key={String(lbl)} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--bord)' }}>
            <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{lbl}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: col as string }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="text" placeholder="ค้นหา Code หรือ คำอธิบาย..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none', width: 280 }} />
        {search && <button onClick={() => setSearch('')} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>✕ ล้าง</button>}
        <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 'auto' }}>แสดง {filtered.length} รหัส</span>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 600 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 110 }}>Item Code</th>
                <th style={{ ...th, minWidth: 200 }}>คำอธิบาย</th>
                <th style={{ ...th, width: 80, textAlign: 'center' }}>หมวด</th>
                <th style={{ ...th, width: 80, textAlign: 'center' }}>ใช้ใน Orders</th>
                <th style={{ ...th, width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {addMode && (
                <tr style={{ background: 'rgba(76,175,125,.06)' }}>
                  <td style={td}>
                    <input autoFocus value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="EN-T-001"
                      style={{ width: 120, fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--green)', background: 'var(--bg)', color: 'var(--amber)', outline: 'none' }} />
                  </td>
                  <td style={td}>
                    <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="คำอธิบาย..."
                      style={{ width: '100%', maxWidth: 320, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--green)', background: 'var(--bg)', color: 'var(--txt)', outline: 'none' }} />
                  </td>
                  <td style={td}>
                    <CatSelect value={newCat} onChange={setNewCat} />
                  </td>
                  <td style={td} />
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => { if (newCode.trim()) handleSave(newCode.trim(), newDesc, newCat) }}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: 'none', background: 'var(--green)', color: '#000', cursor: 'pointer', fontWeight: 700, marginRight: 4 }}>+ เพิ่ม</button>
                    <button onClick={() => setAddMode(false)}
                      style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>ยกเลิก</button>
                  </td>
                </tr>
              )}
              {filtered.map(code => {
                const ic = itemCodes[code]
                const usedCount = seenInOrders[code] ?? 0
                if (editCode === code) {
                  return (
                    <tr key={code} style={{ background: 'rgba(91,142,240,.06)', borderBottom: '0.5px solid var(--bord)' }}>
                      <td style={td}><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{code}</span></td>
                      <td style={td}>
                        <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                          style={{ width: '100%', maxWidth: 320, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--blue)', background: 'var(--bg)', color: 'var(--txt)', outline: 'none' }} />
                      </td>
                      <td style={td}><CatSelect value={editCat} onChange={setEditCat} /></td>
                      <td style={td}>{usedCount > 0 ? <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{usedCount} orders</span> : null}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <button onClick={() => handleSave(code, editDesc, editCat)}
                          style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: 'none', background: 'var(--green)', color: '#000', cursor: 'pointer', fontWeight: 700, marginRight: 4 }}>บันทึก</button>
                        <button onClick={() => setEditCode(null)}
                          style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>ยกเลิก</button>
                      </td>
                    </tr>
                  )
                }
                const col = catCol[ic?.category ?? ''] ?? 'var(--txt3)'
                return (
                  <tr key={code} style={{ background: !ic ? 'rgba(224,156,42,.04)' : 'transparent', borderBottom: '0.5px solid var(--bord)' }}>
                    <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{code}</td>
                    <td style={{ ...td, color: ic?.description ? 'var(--txt)' : 'var(--txt3)', fontStyle: ic?.description ? 'normal' : 'italic' }}>
                      {ic?.description || (!ic ? <span style={{ color: 'var(--amber)', fontSize: 10 }}>⚠ ยังไม่มีคำอธิบาย</span> : '—')}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {ic?.category ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: col + '20', color: col, fontWeight: 700 }}>{ic.category}</span> : <span style={{ color: 'var(--bord2)', fontSize: 10 }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: usedCount > 0 ? 'var(--txt2)' : 'var(--bord2)' }}>{usedCount > 0 ? usedCount : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => startEdit(code)} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer', marginRight: 4 }}>✏ แก้ไข</button>
                      {ic && <button onClick={() => handleDelete(code)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(224,90,78,.3)', background: 'rgba(224,90,78,.06)', color: 'var(--red)', cursor: 'pointer' }}>✕</button>}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && !addMode && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
                  {q ? `ไม่พบ Item Code ที่ตรงกับ "${q}"` : 'ยังไม่มี Item Code ในระบบ — กด "+ เพิ่ม Item Code" เพื่อเริ่มต้น'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {unregistered.length > 0 && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(224,156,42,.07)', border: '1px solid rgba(224,156,42,.2)', fontSize: 12 }}>
          <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ รหัสที่พบใน Orders แต่ยังไม่มีคำอธิบาย:</span>
          <span style={{ color: 'var(--txt2)', marginLeft: 8 }}>{unregistered.join(' · ')}</span>
        </div>
      )}
    </div>
  )
}

function CatSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none' }}>
      <option value="">—</option>
      <option value="Fast">Fast</option>
      <option value="หลัก">หลัก</option>
      <option value="เสริม">เสริม</option>
    </select>
  )
}
