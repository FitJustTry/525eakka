import { useState } from 'react'
import { api } from '../../api'
import { useApp } from '../../context/AppContext'
import type { CuttingMachine } from '../../types'
import styles from './CuttingMachines.module.css'

const DAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const REG_PER = 5 * 8 + 1 * 4   // 44h/week regular
const OT_PER  = 5 * 4            // 20h max OT

function fmtISO(d: Date) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

function getWeekRange(offset: number) {
  const today = new Date()
  const dow = today.getDay()
  const toMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(today)
  mon.setDate(today.getDate() + toMon + offset * 7)
  mon.setHours(0, 0, 0, 0)
  const sat = new Date(mon)
  sat.setDate(mon.getDate() + 5)
  sat.setHours(23, 59, 59, 999)
  return { mon, sat }
}

export default function CuttingMachines() {
  const { state, dispatch } = useApp()
  const { cuttingMachines: machines, orders, products } = state
  const [weekOffset, setWeekOffset] = useState(0)
  const [saving, setSaving] = useState<number | null>(null)

  // ── CRUD ────────────────────────────────────────────────────
  async function handleAdd() {
    const m = { name: 'เครื่องตัด', count: 1, min_kva: 160, max_kva: 2500, hrs_per_unit: 2.5, laser: false, m4: false, min_face_mm: 1, max_face_mm: 9999, drill_8mm: false, drill_22mm: false, notes: '' }
    const saved = await api.cuttingMachines.create(m)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: [...machines, saved] })
  }

  async function handleDelete(id: number) {
    await api.cuttingMachines.delete(id)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: machines.filter(m => m.id !== id) })
  }

  async function handleChange(id: number, field: keyof Omit<CuttingMachine, 'id'>, raw: string) {
    const updated = machines.map(m => {
      if (m.id !== id) return m
      const next = { ...m }
      if (field === 'name')         next.name         = raw
      if (field === 'count')        next.count        = Math.max(1, parseInt(raw) || 1)
      if (field === 'min_kva')      next.min_kva      = Math.max(0, parseInt(raw) || 0)
      if (field === 'max_kva')      next.max_kva      = Math.max(0, parseInt(raw) || 0)
      if (field === 'hrs_per_unit') next.hrs_per_unit = Math.max(0.1, parseFloat(raw) || 1)
      if (field === 'min_face_mm')  next.min_face_mm  = Math.max(1, parseInt(raw) || 1)
      if (field === 'max_face_mm')  next.max_face_mm  = Math.max(1, parseInt(raw) || 9999)
      if (field === 'notes')        next.notes        = raw
      return next
    })
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === id)!
    setSaving(id)
    await api.cuttingMachines.update(id, machine)
    setSaving(null)
  }

  async function handleToggle(id: number, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm') {
    const updated = machines.map(m => m.id !== id ? m : { ...m, [field]: !m[field] })
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === id)!
    setSaving(id)
    await api.cuttingMachines.update(id, machine)
    setSaving(null)
  }

  // ── Week plan data ───────────────────────────────────────────
  const { mon, sat } = getWeekRange(weekOffset)
  const monStr = fmtISO(mon)
  const satStr = fmtISO(sat)
  const fmtD = (d: Date) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
  const weekLabel = `${fmtD(mon)} – ${fmtD(sat)}/${String(sat.getFullYear() % 100).padStart(2, '0')}`

  const weekOrders = orders.filter(o => o.plan_date && o.plan_date >= monStr && o.plan_date <= satStr)

  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d
  })

  const mTotals = machines.map(m => {
    const hrs = weekOrders
      .filter(o => { const kva = products[o.product]?.kva ?? o.kva; return kva >= m.min_kva && kva <= m.max_kva })
      .reduce((a, o) => a + o.qty * m.hrs_per_unit, 0)
    const regCap = m.count * REG_PER
    const maxCap = regCap + m.count * OT_PER
    return { hrs, regCap, maxCap, ot: Math.max(0, hrs - regCap), over: hrs > maxCap }
  })

  const totalHrs    = mTotals.reduce((a, t) => a + t.hrs, 0)
  const totalRegCap = mTotals.reduce((a, t) => a + t.regCap, 0)
  const totalOT     = Math.max(0, totalHrs - totalRegCap)
  const summaryStatus = totalHrs > mTotals.reduce((a, t) => a + t.maxCap, 0) ? 'over' : totalOT > 0 ? 'warn' : 'ok'

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className={styles.root}>

      {/* ── Config table ──────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.sectionTitle}>เครื่องตัดโลหะ — Metal Cutting Machines</span>
          <button className={styles.btn} onClick={handleAdd}>+ เพิ่มเครื่อง</button>
        </div>

        {machines.length === 0 ? (
          <p className={styles.empty}>ยังไม่มีเครื่องตัดโลหะ — กด "+ เพิ่มเครื่อง"</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>เครื่อง</th>
                  <th>จำนวน</th>
                  <th style={{ color: 'var(--blue)' }}>kVA ต่ำสุด</th>
                  <th style={{ color: 'var(--red)' }}>kVA สูงสุด</th>
                  <th style={{ color: 'var(--green)' }}>h/ตัว</th>
                  <th style={{ textAlign: 'center' }}>Laser</th>
                  <th style={{ textAlign: 'center' }}>M4</th>
                  <th style={{ textAlign: 'center' }}>หน้ากว้างต่ำสุด (mm)</th>
                  <th style={{ textAlign: 'center' }}>หน้ากว้างสูงสุด (mm)</th>
                  <th style={{ textAlign: 'center' }}>เจาะรู 8mm</th>
                  <th style={{ textAlign: 'center' }}>เจาะรู 22mm</th>
                  <th style={{ textAlign: 'left', minWidth: 180 }}>หมายเหตุ / ข้อจำกัด</th>
                  <th style={{ textAlign: 'left' }}>หม้อแปลงที่รองรับ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {machines.map(m => {
                  const supported = Object.values(products)
                    .filter(p => p.kva && p.kva >= m.min_kva && p.kva <= m.max_kva)
                    .sort((a, b) => a.kva - b.kva)
                  const boolBtn = (val: boolean, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm') => (
                    <button onClick={() => handleToggle(m.id, field)} style={{
                      fontSize: 14, background: 'none', border: 'none', cursor: 'pointer',
                      opacity: val ? 1 : 0.35, padding: '2px 4px',
                    }}>{val ? '✅' : '❌'}</button>
                  )
                  return (
                    <tr key={m.id} className={saving === m.id ? styles.saving : ''}>
                      <td>
                        <input
                          className={styles.input}
                          defaultValue={m.name}
                          onBlur={e => handleChange(m.id, 'name', e.target.value)}
                          style={{ width: 130 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={1} max={20}
                          defaultValue={m.count}
                          onBlur={e => handleChange(m.id, 'count', e.target.value)}
                          style={{ color: 'var(--txt)', width: 46, fontWeight: 700, fontSize: 13 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={0} step={50}
                          defaultValue={m.min_kva <= 0 ? '' : m.min_kva}
                          placeholder="ไม่จำกัด"
                          onBlur={e => handleChange(m.id, 'min_kva', e.target.value || '0')}
                          style={{ color: 'var(--blue)', width: 72 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={0} step={50}
                          defaultValue={m.max_kva >= 9999 ? '' : m.max_kva}
                          placeholder="ไม่จำกัด"
                          onBlur={e => handleChange(m.id, 'max_kva', e.target.value || '9999')}
                          style={{ color: 'var(--red)', width: 72 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={0.1} step={0.5}
                          defaultValue={m.hrs_per_unit}
                          onBlur={e => handleChange(m.id, 'hrs_per_unit', e.target.value)}
                          style={{ color: 'var(--green)', width: 52 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.laser, 'laser')}</td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.m4, 'm4')}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={1}
                          defaultValue={m.min_face_mm <= 1 ? '' : m.min_face_mm}
                          placeholder="ไม่จำกัด"
                          onBlur={e => handleChange(m.id, 'min_face_mm', e.target.value || '1')}
                          style={{ width: 72, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={1}
                          defaultValue={m.max_face_mm >= 9999 ? '' : m.max_face_mm}
                          placeholder="ไม่จำกัด"
                          onBlur={e => handleChange(m.id, 'max_face_mm', e.target.value || '9999')}
                          style={{ width: 72, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.drill_8mm, 'drill_8mm')}</td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.drill_22mm, 'drill_22mm')}</td>
                      <td>
                        <input
                          className={styles.input}
                          defaultValue={m.notes}
                          onBlur={e => handleChange(m.id, 'notes', e.target.value)}
                          style={{ width: '100%', minWidth: 180 }}
                        />
                      </td>
                      <td>
                        <div className={styles.chips}>
                          {supported.length === 0
                            ? <span className={styles.dim}>—</span>
                            : supported.map(p => {
                                const col = p.kva <= 400 ? 'var(--blue)' : p.kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                                return (
                                  <span key={p.kva} className={styles.chip} style={{ color: col }}>
                                    {p.label.split('—')[0].trim()}
                                  </span>
                                )
                              })}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className={styles.delBtn} onClick={() => handleDelete(m.id)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Weekly plan ──────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.sectionTitle}>แผนการตัดโลหะ — สัปดาห์</span>
          <div className={styles.weekNav}>
            <button className={styles.btn} onClick={() => setWeekOffset(w => w - 1)}>‹ ก่อนหน้า</button>
            <span className={styles.weekLabel}>{weekLabel}</span>
            <button className={styles.btn} onClick={() => setWeekOffset(w => w + 1)}>ถัดไป ›</button>
            {weekOffset !== 0 && (
              <button className={styles.btnGhost} onClick={() => setWeekOffset(0)}>สัปดาห์นี้</button>
            )}
          </div>
        </div>

        {machines.length === 0 ? (
          <p className={styles.empty}>เพิ่มเครื่องตัดโลหะก่อน</p>
        ) : weekOrders.length === 0 ? (
          <p className={styles.empty}>📭 ไม่มี orders ในสัปดาห์ {weekLabel}</p>
        ) : (
          <>
            {/* Summary */}
            <div className={styles.summary}>
              <span className={styles.dim}>รวมทุกเครื่อง</span>
              <span className={styles.bigNum} data-status={summaryStatus}>
                {totalHrs.toFixed(1)}h
              </span>
              <span className={styles.dim}>/ {totalRegCap}h ปกติ</span>
              {totalOT > 0
                ? <span className={styles.warn}>⚠ OT รวม {totalOT.toFixed(1)}h</span>
                : <span className={styles.ok}>✓ เสร็จได้ปกติ</span>}
              <span className={styles.dim} style={{ marginLeft: 'auto' }}>
                {weekOrders.length} orders · {weekOrders.reduce((a, o) => a + o.qty, 0)} ตัว
              </span>
            </div>

            {/* Day × Machine table */}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', minWidth: 110 }}>วัน</th>
                    {machines.map((m, i) => {
                      const t = mTotals[i]
                      const col = t.over ? 'var(--red)' : t.ot > 0 ? 'var(--amber)' : 'var(--green)'
                      return (
                        <th key={m.id} style={{ textAlign: 'center', minWidth: 130, borderLeft: '1px solid var(--bord)' }}>
                          <div>{m.name}</div>
                          <div style={{ fontSize: 9, color: 'var(--txt3)', fontWeight: 400 }}>
                            {m.min_kva}–{m.max_kva}kVA · {m.hrs_per_unit}h/ตัว
                          </div>
                          <div style={{ fontSize: 9, color: col, fontWeight: 600, marginTop: 2 }}>
                            {t.hrs.toFixed(1)}h / {t.regCap}h
                            {t.ot > 0 && ` · OT ${t.ot.toFixed(1)}h`}
                          </div>
                        </th>
                      )
                    })}
                    <th style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)', whiteSpace: 'nowrap' }}>รวม/วัน</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(d => {
                    const dStr = fmtISO(d)
                    const dayOrders = weekOrders.filter(o => o.plan_date === dStr)
                    const isSat = d.getDay() === 6
                    const isToday = dStr === fmtISO(new Date())
                    const dayTotalHrs = machines.reduce((a, m) => {
                      return a + dayOrders
                        .filter(o => { const kva = products[o.product]?.kva ?? o.kva; return kva >= m.min_kva && kva <= m.max_kva })
                        .reduce((s, o) => s + o.qty * m.hrs_per_unit, 0)
                    }, 0)

                    return (
                      <tr key={dStr} className={isToday ? styles.today : isSat ? styles.saturday : ''}>
                        <td>
                          <div style={{ fontWeight: isToday ? 700 : 600, color: isToday ? 'var(--blue)' : isSat ? 'var(--txt2)' : 'var(--txt)', fontSize: 11 }}>
                            {DAY_TH[d.getDay()]} {fmtD(d)}{isToday ? ' ◀' : ''}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--txt3)' }}>
                            {dayOrders.length} orders · {dayOrders.reduce((a, o) => a + o.qty, 0)} ตัว
                          </div>
                        </td>
                        {machines.map(m => {
                          const mOrders = dayOrders.filter(o => {
                            const kva = products[o.product]?.kva ?? o.kva
                            return kva >= m.min_kva && kva <= m.max_kva
                          })
                          const hrs = mOrders.reduce((a, o) => a + o.qty * m.hrs_per_unit, 0)
                          const grp: Record<number, number> = {}
                          mOrders.forEach(o => { const kva = products[o.product]?.kva ?? o.kva; grp[kva] = (grp[kva] ?? 0) + o.qty })

                          return (
                            <td key={m.id} style={{ verticalAlign: 'top', borderLeft: '1px solid var(--bord)' }}>
                              {mOrders.length === 0 ? (
                                <span className={styles.dim}>—</span>
                              ) : (
                                <>
                                  <div className={styles.chips} style={{ marginBottom: 3 }}>
                                    {Object.entries(grp).sort((a, b) => +a[0] - +b[0]).map(([kva, qty]) => {
                                      const col = +kva <= 400 ? 'var(--blue)' : +kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                                      return (
                                        <span key={kva} className={styles.chip} style={{ color: col }}>
                                          {kva}kVA×{qty}
                                        </span>
                                      )
                                    })}
                                  </div>
                                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 10 }}>
                                    {hrs.toFixed(1)}h
                                  </div>
                                </>
                              )}
                            </td>
                          )
                        })}
                        <td style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)', verticalAlign: 'middle' }}>
                          {dayTotalHrs > 0
                            ? <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12 }}>{dayTotalHrs.toFixed(1)}h</span>
                            : <span className={styles.dim}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className={styles.footerRow}>
                    <td style={{ fontWeight: 700, color: 'var(--txt2)', fontSize: 10 }}>รวมสัปดาห์</td>
                    {machines.map((m, i) => {
                      const t = mTotals[i]
                      const col = t.over ? 'var(--red)' : t.ot > 0 ? 'var(--amber)' : 'var(--green)'
                      const pct = Math.min(100, Math.round(t.hrs / t.regCap * 100))
                      return (
                        <td key={m.id} style={{ textAlign: 'center', borderLeft: '1px solid var(--bord)' }}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: col }}>
                            {t.hrs.toFixed(1)}h
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--txt3)' }}>/ {t.regCap}h ปกติ</div>
                          <div style={{ height: 5, background: 'var(--bg4)', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3 }} />
                          </div>
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: `var(--${summaryStatus === 'ok' ? 'green' : summaryStatus === 'warn' ? 'amber' : 'red'})` }}>
                        {totalHrs.toFixed(1)}h
                      </span>
                    </td>
                  </tr>
                  {totalOT > 0 && (
                    <tr style={{ background: 'rgba(255,165,0,.05)' }}>
                      <td style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700 }}>OT ที่ต้องการ</td>
                      {machines.map((m, i) => {
                        const t = mTotals[i]
                        return (
                          <td key={m.id} style={{ textAlign: 'center', borderLeft: '1px solid var(--bord)', fontSize: 10 }}>
                            {t.ot > 0 ? (
                              <>
                                <span style={{ color: 'var(--amber)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{t.ot.toFixed(1)}h</span>
                                <span className={styles.dim}> ({Math.ceil(t.ot / (m.count * 4))}วัน×{m.count * 4}h)</span>
                              </>
                            ) : <span style={{ color: 'var(--green)' }}>✓</span>}
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--amber)' }}>
                        {totalOT.toFixed(1)}h
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
