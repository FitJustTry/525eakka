import React, { useState } from 'react'
import type { CuttingMachine, MachineDowntime } from '../../../types'

const REASONS = ['Breakdown', 'Preventive Maintenance', 'No Operator', 'Setup/Changeover', 'Other']

interface Props {
  machines: CuttingMachine[]
  downtimes: MachineDowntime[]
  onAdd: (d: Omit<MachineDowntime, 'id' | 'created_at'>) => Promise<MachineDowntime>
  onUpdate: (id: number, patch: Partial<Omit<MachineDowntime, 'id' | 'created_at' | 'machine_id'>>) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

const blank = { machine_id: 0, start_date: '', end_date: '', reason: 'Breakdown', notes: '' }

export default function DowntimePanel({ machines, downtimes, onAdd, onUpdate, onDelete }: Props) {
  const [form, setForm] = useState({ ...blank })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.machine_id || !form.start_date || !form.end_date) { setErr('กรุณาระบุข้อมูลให้ครบ'); return }
    if (form.end_date < form.start_date) { setErr('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'); return }
    setSaving(true); setErr('')
    try {
      await onAdd({ machine_id: Number(form.machine_id), start_date: form.start_date, end_date: form.end_date, reason: form.reason, notes: form.notes })
      setForm({ ...blank })
    } catch { setErr('บันทึกไม่สำเร็จ') }
    setSaving(false)
  }

  const mName = (id: number) => machines.find(m => m.id === id)?.name ?? `#${id}`

  const grouped = [...machines].map(m => ({
    m,
    items: downtimes.filter(d => d.machine_id === m.id).sort((a, b) => b.start_date.localeCompare(a.start_date)),
  })).filter(g => g.items.length > 0)

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>🔧 บันทึก Downtime เครื่องจักร</div>

      {/* Add form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>เครื่อง</span>
          <select value={form.machine_id} onChange={e => setForm(f => ({ ...f, machine_id: Number(e.target.value) }))}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--txt)', minWidth: 120 }}>
            <option value={0}>-- เลือกเครื่อง --</option>
            {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>วันเริ่ม</span>
          <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--txt)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>วันสิ้นสุด</span>
          <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--txt)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>สาเหตุ</span>
          <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--txt)' }}>
            {REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>หมายเหตุ</span>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="optional"
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--txt)', width: 120 }} />
        </div>
        <button type="submit" disabled={saving}
          style={{ fontSize: 11, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
          {saving ? '...' : '+ บันทึก'}
        </button>
        {err && <span style={{ fontSize: 10, color: 'var(--red)' }}>{err}</span>}
      </form>

      {/* Downtime list grouped by machine */}
      {grouped.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>ยังไม่มีรายการ downtime</div>
      ) : (
        grouped.map(({ m, items }) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', marginBottom: 4 }}>{m.name}</div>
            <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--bord)' }}>
                  {['เริ่ม', 'สิ้นสุด', 'วัน', 'สาเหตุ', 'หมายเหตุ', ''].map(h => (
                    <th key={h} style={{ padding: '3px 8px', textAlign: 'left', color: 'var(--txt3)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(d => {
                  const days = Math.round((new Date(d.end_date).getTime() - new Date(d.start_date).getTime()) / 86400000) + 1
                  return (
                    <tr key={d.id} style={{ borderBottom: '0.5px solid var(--bord)' }}>
                      <td style={{ padding: '3px 8px', fontFamily: 'var(--mono)' }}>{d.start_date}</td>
                      <td style={{ padding: '3px 8px', fontFamily: 'var(--mono)' }}>{d.end_date}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--red)', fontWeight: 700 }}>{days}d</td>
                      <td style={{ padding: '3px 8px' }}>{d.reason}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--txt3)' }}>{d.notes || '—'}</td>
                      <td style={{ padding: '3px 8px' }}>
                        <button onClick={() => onDelete(d.id)}
                          style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--bord2)', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}>
                          🗑
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
