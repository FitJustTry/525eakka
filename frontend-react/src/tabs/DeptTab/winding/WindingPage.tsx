import { useState, useEffect } from 'react'
import styles from '../cutting/CuttingPage.module.css'

interface CoilMachine {
  id: number; name: string; count: number; type: string
  min_kva: number; max_kva: number; hrs_per_unit: number
  wire: string; hv_lv: string; notes: string; off_days: number[]
}

const DAY_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส']
const DAY_TH    = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']

const TYPE_OPTIONS = ['HV (แรงสูง)','LV (แรงต่ำ)','HV+LV','Foil','Cast Resin']
const WIRE_OPTIONS = ['ทองแดง (Cu)','อะลูมิเนียม (Al)','Foil Cu','Foil Al']
const HVLV_OPTIONS = ['HV','LV','HV+LV']

async function apiFetch(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return null
  return res.json()
}

export default function CoilMachines() {
  const [machines, setMachines] = useState<CoilMachine[]>([])
  const [saving, setSaving] = useState<number | null>(null)

  useEffect(() => {
    apiFetch('/coil-machines').then(setMachines).catch(() => {})
  }, [])

  async function handleAdd() {
    const m = await apiFetch('/coil-machines', 'POST', { name: 'เครื่องพัน', count: 1, type: 'HV (แรงสูง)', min_kva: 0, max_kva: 9999, hrs_per_unit: 2, wire: 'ทองแดง (Cu)', hv_lv: 'HV', notes: '', off_days: [] })
    setMachines(prev => [...prev, m])
  }

  async function handleDelete(id: number) {
    if (!confirm('ลบเครื่องพันคอยล์นี้?')) return
    await apiFetch(`/coil-machines/${id}`, 'DELETE')
    setMachines(prev => prev.filter(m => m.id !== id))
  }

  async function handleChange(id: number, field: keyof CoilMachine, value: unknown) {
    const updated = machines.map(m => m.id !== id ? m : { ...m, [field]: value })
    setMachines(updated)
    const machine = updated.find(m => m.id === id)!
    setSaving(id)
    try { await apiFetch(`/coil-machines/${id}`, 'PUT', machine) } catch { /* ignore */ }
    setSaving(null)
  }

  async function toggleOffDay(id: number, dow: number) {
    const m = machines.find(mc => mc.id === id)!
    const cur = m.off_days ?? []
    const next = cur.includes(dow) ? cur.filter(d => d !== dow) : [...cur, dow]
    await handleChange(id, 'off_days', next)
  }

  return (
    <div className={styles.card} style={{ marginTop: 12 }}>
      <div className={styles.cardHeader}>
        <span className={styles.sectionTitle}>🌀 เครื่องพันคอยล์ — Coil Winding Machines</span>
        <button className={styles.btn} onClick={handleAdd}>+ เพิ่มเครื่อง</button>
      </div>

      {machines.length === 0 ? (
        <p className={styles.empty}>ยังไม่มีเครื่องพันคอยล์ — กด "+ เพิ่มเครื่อง"</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>ชื่อเครื่อง</th>
                <th style={{ textAlign: 'center' }}>จำนวน</th>
                <th style={{ textAlign: 'center' }}>ประเภท</th>
                <th style={{ textAlign: 'center' }}>HV/LV</th>
                <th style={{ textAlign: 'center', color: 'var(--blue)' }}>kVA ต่ำสุด</th>
                <th style={{ textAlign: 'center', color: 'var(--red)' }}>kVA สูงสุด</th>
                <th style={{ textAlign: 'center', color: 'var(--green)' }}>h/ตัว</th>
                <th style={{ textAlign: 'center' }}>ลวด</th>
                <th style={{ textAlign: 'center', minWidth: 160 }}>วันทำงาน (คลิกปิด)</th>
                <th style={{ textAlign: 'left', minWidth: 160 }}>หมายเหตุ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {machines.map(m => (
                <tr key={m.id} className={saving === m.id ? styles.saving : ''}>
                  <td>
                    <input className={styles.input} defaultValue={m.name}
                      onBlur={e => handleChange(m.id, 'name', e.target.value)}
                      style={{ width: 130 }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input className={styles.inputNum} type="number" min={1} defaultValue={m.count}
                      onBlur={e => handleChange(m.id, 'count', parseInt(e.target.value)||1)}
                      style={{ width: 46, color: 'var(--txt)', fontWeight: 700 }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <select value={m.type}
                      onChange={e => handleChange(m.id, 'type', e.target.value)}
                      style={{ fontSize: 10, padding: '3px 4px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)' }}>
                      <option value="">—</option>
                      {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <select value={m.hv_lv}
                      onChange={e => handleChange(m.id, 'hv_lv', e.target.value)}
                      style={{ fontSize: 10, padding: '3px 4px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)' }}>
                      <option value="">—</option>
                      {HVLV_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input className={styles.inputNum} type="number" min={0} defaultValue={m.min_kva <= 0 ? '' : m.min_kva}
                      placeholder="ไม่จำกัด"
                      onBlur={e => handleChange(m.id, 'min_kva', parseInt(e.target.value)||0)}
                      style={{ width: 72, color: 'var(--blue)' }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input className={styles.inputNum} type="number" min={0} defaultValue={m.max_kva >= 9999 ? '' : m.max_kva}
                      placeholder="ไม่จำกัด"
                      onBlur={e => handleChange(m.id, 'max_kva', parseInt(e.target.value)||9999)}
                      style={{ width: 72, color: 'var(--red)' }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input className={styles.inputNum} type="number" min={0.1} step={0.5} defaultValue={m.hrs_per_unit}
                      onBlur={e => handleChange(m.id, 'hrs_per_unit', parseFloat(e.target.value)||2)}
                      style={{ width: 58, color: 'var(--green)', fontWeight: 700 }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <select value={m.wire}
                      onChange={e => handleChange(m.id, 'wire', e.target.value)}
                      style={{ fontSize: 10, padding: '3px 4px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)' }}>
                      <option value="">—</option>
                      {WIRE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                      {[1,2,3,4,5,6].map(dow => {
                        const isOff = (m.off_days ?? []).includes(dow)
                        return (
                          <button key={dow} onClick={() => toggleOffDay(m.id, dow)}
                            title={isOff ? `เปิด ${DAY_TH[dow]}` : `ปิด ${DAY_TH[dow]}`}
                            style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--bord2)', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                              background: isOff ? 'rgba(224,90,78,.15)' : 'rgba(166,227,161,.15)',
                              color: isOff ? 'var(--red)' : 'var(--green)',
                              textDecoration: isOff ? 'line-through' : 'none' }}>
                            {DAY_SHORT[dow]}
                          </button>
                        )
                      })}
                    </div>
                    {(m.off_days ?? []).length > 0 && (
                      <div style={{ fontSize: 8, color: 'var(--red)', marginTop: 2 }}>
                        ปิด: {(m.off_days ?? []).map(d => DAY_SHORT[d]).join(' ')}
                      </div>
                    )}
                  </td>
                  <td>
                    <input className={styles.input} defaultValue={m.notes}
                      onBlur={e => handleChange(m.id, 'notes', e.target.value)}
                      style={{ width: '100%', minWidth: 150 }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className={styles.delBtn} onClick={() => handleDelete(m.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
