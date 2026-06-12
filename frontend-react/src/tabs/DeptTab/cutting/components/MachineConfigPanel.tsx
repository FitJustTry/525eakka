import React from 'react'
import type { CuttingMachine, Product } from '../../../../types'
import styles from '../CuttingPage.module.css'
import { DAY_TH, DAY_SHORT } from '../scheduling/constants'
import { mLabel } from '../scheduling/utils'

export interface MachineConfigPanelProps {
  machines: CuttingMachine[]
  products: Record<string, Product>
  shiftHrsDefault: number
  saving: number | null
  open: boolean
  setOpen: (v: boolean) => void
  handleAdd: () => void
  handleDelete: (id: number) => void
  handleChange: (id: number, field: keyof Omit<CuttingMachine, 'id'>, raw: string) => void
  handleToggle: (id: number, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm' | 'shift_enabled') => void
  toggleOffDay: (id: number, dow: number) => void
}

export default function MachineConfigPanel({
  machines,
  products,
  shiftHrsDefault,
  saving,
  open,
  setOpen,
  handleAdd,
  handleDelete,
  handleChange,
  handleToggle,
  toggleOffDay,
}: MachineConfigPanelProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader} style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span className={styles.sectionTitle}>
          {open ? '▾' : '▸'} เครื่องตัดโลหะ — Metal Cutting Machines
          {!open && machines.length > 0 && (
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--txt3)', marginLeft: 10 }}>
              {machines.map(m => `${mLabel(m)} (${m.min_kva}–${m.max_kva >= 9999 ? '∞' : m.max_kva}kVA)`).join(' · ')}
            </span>
          )}
        </span>
        <button className={styles.btn} onClick={e => { e.stopPropagation(); handleAdd() }}>+ เพิ่มเครื่อง</button>
      </div>

      {!open ? null : machines.length === 0 ? (
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
                <th style={{ textAlign: 'center' }}>ชม.ปกติ/วัน</th>
                <th style={{ textAlign: 'center' }}>OT สูงสุด/วัน</th>
                <th style={{ textAlign: 'center', color: 'var(--amber)' }} title="Speed multiplier: final_hrs = base × ×Rate + TMC">×Rate</th>
                <th style={{ textAlign: 'center', color: 'var(--purple)' }} title="TMC: fixed setup/overhead hours added per order">TMC (h)</th>
                <th style={{ textAlign: 'center', color: 'var(--red)' }} title="TR Power: fixed hours for power transformer orders">⚡ TR (h)</th>
                <th style={{ textAlign: 'center', color: 'var(--blue)' }} title="กะกลางคืน: เปิด/ปิด + ชั่วโมง/คืน (blank = ใช้ค่า default ของแผน)">🌙 กะ</th>
                <th style={{ textAlign: 'center', minWidth: 160 }}>วันทำงาน (คลิกปิด)</th>
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
                    <td style={{ textAlign: 'center' }}>
                      <input className={styles.inputNum} type="number" min={1} max={24} step={0.5}
                        defaultValue={m.reg_hrs ?? 8}
                        onBlur={e => handleChange(m.id, 'reg_hrs', e.target.value || '8')}
                        style={{ width: 52, color: 'var(--green)', fontWeight: 700 }} />
                      <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input className={styles.inputNum} type="number" min={0} max={12} step={0.5}
                        defaultValue={m.ot_hrs ?? 4}
                        onBlur={e => handleChange(m.id, 'ot_hrs', e.target.value || '0')}
                        style={{ width: 52, color: 'var(--amber)', fontWeight: 700 }} />
                      <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input className={styles.inputNum} type="number" min={0.1} max={5} step={0.05}
                        defaultValue={m.time_mul ?? 1}
                        onBlur={e => handleChange(m.id, 'time_mul', e.target.value || '1')}
                        title="Speed multiplier — final_hrs = base × this"
                        style={{ width: 52, color: 'var(--amber)', fontWeight: 700 }} />
                      <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>×</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input className={styles.inputNum} type="number" min={0} max={8} step={0.1}
                        defaultValue={m.tmc_hrs ?? 0}
                        onBlur={e => handleChange(m.id, 'tmc_hrs', e.target.value || '0')}
                        title="TMC — fixed setup hours added per order"
                        style={{ width: 52, color: 'var(--purple)', fontWeight: 700 }} />
                      <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input className={styles.inputNum} type="number" min={0} max={99} step={0.1}
                        defaultValue={m.tr_power_hrs ?? 0}
                        onBlur={e => handleChange(m.id, 'tr_power_hrs', e.target.value || '0')}
                        title="TR Power — fixed hours for power transformer orders"
                        style={{ width: 52, color: 'var(--red)', fontWeight: 700 }} />
                      <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span>
                    </td>
                    {/* Shift: enabled toggle + per-machine hrs */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <button onClick={() => handleToggle(m.id, 'shift_enabled')}
                          title={(m.shift_enabled ?? true) ? 'กะเปิด — คลิกเพื่อปิด' : 'กะปิด — คลิกเพื่อเปิด'}
                          style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', opacity: (m.shift_enabled ?? true) ? 1 : 0.35, padding: '2px 4px' }}>
                          {(m.shift_enabled ?? true) ? '🌙' : '🌑'}
                        </button>
                        {(m.shift_enabled ?? true) && (
                          <>
                            <input className={styles.inputNum} type="number" min={1} max={24} step={0.5}
                              defaultValue={m.shift_hrs ?? ''}
                              placeholder={String(shiftHrsDefault)}
                              onBlur={e => { if (e.target.value) handleChange(m.id, 'shift_hrs', e.target.value) }}
                              title="ชั่วโมงกะ/คืน (blank = ใช้ค่า default)"
                              style={{ width: 44, color: 'var(--blue)', fontWeight: 700 }} />
                            <span style={{ fontSize: 9, color: 'var(--txt3)' }}>h</span>
                          </>
                        )}
                      </div>
                    </td>
                    {/* Day-on/off picker */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                        {[1,2,3,4,5,6].map(dow => {
                          const isOff = (m.off_days ?? []).includes(dow)
                          const label = DAY_SHORT[dow]
                          return (
                            <button key={dow} onClick={() => toggleOffDay(m.id, dow)}
                              title={isOff ? `เปิด ${DAY_TH[dow]}` : `ปิด ${DAY_TH[dow]}`}
                              style={{
                                width: 22, height: 22, borderRadius: 4, border: '1px solid var(--bord2)',
                                fontSize: 9, fontWeight: 700, cursor: 'pointer',
                                background: isOff ? 'rgba(224,90,78,.15)' : 'rgba(166,227,161,.15)',
                                color: isOff ? 'var(--red)' : 'var(--green)',
                                textDecoration: isOff ? 'line-through' : 'none',
                              }}>
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      {(m.off_days ?? []).length > 0 && (
                        <div style={{ fontSize: 8, color: 'var(--red)', marginTop: 3 }}>
                          ปิด: {(m.off_days ?? []).map(d => DAY_SHORT[d]).join(' ')}
                        </div>
                      )}
                    </td>
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
  )
}
