import React, { useState } from 'react'
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

const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ fontSize: 8, color: 'var(--txt3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
    {children}
  </div>
)

const Divider = () => <div style={{ height: 1, background: 'var(--bord)', margin: '8px 0' }} />

export default function MachineConfigPanel({
  machines, products, shiftHrsDefault, saving, open, setOpen,
  handleAdd, handleDelete, handleChange, handleToggle, toggleOffDay,
}: MachineConfigPanelProps) {
  const [layout, setLayout] = useState<'cards' | 'table'>('cards')

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader} style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span className={styles.sectionTitle}>
          {open ? '▾' : '▸'} เครื่องตัดโลหะ
          {!open && machines.length > 0 && (
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--txt3)', marginLeft: 10 }}>
              {machines.map(m => `${mLabel(m)} (${m.min_kva}–${m.max_kva >= 9999 ? '∞' : m.max_kva}kVA)`).join(' · ')}
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {open && (
            <>
              <button onClick={e => { e.stopPropagation(); setLayout('cards') }} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, border: `1px solid ${layout === 'cards' ? 'var(--blue)' : 'var(--bord2)'}`, background: layout === 'cards' ? 'rgba(137,180,250,.18)' : 'var(--bg3)', color: layout === 'cards' ? 'var(--blue)' : 'var(--txt3)', cursor: 'pointer' }}>Cards</button>
              <button onClick={e => { e.stopPropagation(); setLayout('table') }} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, border: `1px solid ${layout === 'table' ? 'var(--blue)' : 'var(--bord2)'}`, background: layout === 'table' ? 'rgba(137,180,250,.18)' : 'var(--bg3)', color: layout === 'table' ? 'var(--blue)' : 'var(--txt3)', cursor: 'pointer' }}>Table</button>
            </>
          )}
          <button className={styles.btn} onClick={e => { e.stopPropagation(); handleAdd() }}>+ เพิ่มเครื่อง</button>
        </div>
      </div>

      {open && (
        machines.length === 0 ? (
          <p className={styles.empty}>ยังไม่มีเครื่องตัดโลหะ — กด "+ เพิ่มเครื่อง"</p>
        ) : layout === 'table' ? (
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
                  <th style={{ textAlign: 'center', color: 'var(--amber)' }}>×Rate</th>
                  <th style={{ textAlign: 'center', color: 'var(--purple)' }}>TMC (h)</th>
                  <th style={{ textAlign: 'center', color: 'var(--red)' }}>⚡ TR (h)</th>
                  <th style={{ textAlign: 'center', color: 'var(--green)' }}>🧱 H (h)</th>
                  <th style={{ textAlign: 'center', color: 'var(--blue)' }}>🌙 กะ</th>
                  <th style={{ textAlign: 'center', minWidth: 160 }}>วันทำงาน</th>
                  <th style={{ textAlign: 'left', minWidth: 180 }}>หมายเหตุ</th>
                  <th style={{ textAlign: 'left' }}>รองรับ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {machines.map(m => {
                  const supported = Object.values(products).filter(p => p.kva && p.kva >= m.min_kva && p.kva <= m.max_kva).sort((a, b) => a.kva - b.kva)
                  const boolBtn = (val: boolean, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm') => (
                    <button onClick={() => handleToggle(m.id, field)} style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', opacity: val ? 1 : 0.35, padding: '2px 4px' }}>{val ? '✅' : '❌'}</button>
                  )
                  return (
                    <tr key={m.id} className={saving === m.id ? styles.saving : ''}>
                      <td><input className={styles.input} defaultValue={m.name} onBlur={e => handleChange(m.id, 'name', e.target.value)} style={{ width: 130 }} /></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={1} max={20} defaultValue={m.count} onBlur={e => handleChange(m.id, 'count', e.target.value)} style={{ color: 'var(--txt)', width: 46, fontWeight: 700, fontSize: 13 }} /></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={0} step={50} defaultValue={m.min_kva <= 0 ? '' : m.min_kva} placeholder="ไม่จำกัด" onBlur={e => handleChange(m.id, 'min_kva', e.target.value || '0')} style={{ color: 'var(--blue)', width: 72 }} /></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={0} step={50} defaultValue={m.max_kva >= 9999 ? '' : m.max_kva} placeholder="ไม่จำกัด" onBlur={e => handleChange(m.id, 'max_kva', e.target.value || '9999')} style={{ color: 'var(--red)', width: 72 }} /></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={0.1} step={0.5} defaultValue={m.hrs_per_unit} onBlur={e => handleChange(m.id, 'hrs_per_unit', e.target.value)} style={{ color: 'var(--green)', width: 52 }} /></td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.laser, 'laser')}</td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.m4, 'm4')}</td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={1} defaultValue={m.min_face_mm <= 1 ? '' : m.min_face_mm} placeholder="ไม่จำกัด" onBlur={e => handleChange(m.id, 'min_face_mm', e.target.value || '1')} style={{ width: 72, textAlign: 'center' }} /></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={1} defaultValue={m.max_face_mm >= 9999 ? '' : m.max_face_mm} placeholder="ไม่จำกัด" onBlur={e => handleChange(m.id, 'max_face_mm', e.target.value || '9999')} style={{ width: 72, textAlign: 'center' }} /></td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.drill_8mm, 'drill_8mm')}</td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.drill_22mm, 'drill_22mm')}</td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={1} max={24} step={0.5} defaultValue={m.reg_hrs ?? 8} onBlur={e => handleChange(m.id, 'reg_hrs', e.target.value || '8')} style={{ width: 52, color: 'var(--green)', fontWeight: 700 }} /><span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={0} max={12} step={0.5} defaultValue={m.ot_hrs ?? 4} onBlur={e => handleChange(m.id, 'ot_hrs', e.target.value || '0')} style={{ width: 52, color: 'var(--amber)', fontWeight: 700 }} /><span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={0.1} max={5} step={0.05} defaultValue={m.time_mul ?? 1} onBlur={e => handleChange(m.id, 'time_mul', e.target.value || '1')} style={{ width: 52, color: 'var(--amber)', fontWeight: 700 }} /><span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>×</span></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={0} max={8} step={0.1} defaultValue={m.tmc_hrs ?? 0} onBlur={e => handleChange(m.id, 'tmc_hrs', e.target.value || '0')} style={{ width: 52, color: 'var(--purple)', fontWeight: 700 }} /><span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={0} max={99} step={0.1} defaultValue={m.tr_power_hrs ?? 0} onBlur={e => handleChange(m.id, 'tr_power_hrs', e.target.value || '0')} style={{ width: 52, color: 'var(--red)', fontWeight: 700 }} /><span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span></td>
                      <td style={{ textAlign: 'center' }}><input className={styles.inputNum} type="number" min={0} max={99} step={0.1} defaultValue={m.class_h_hrs ?? 0} onBlur={e => handleChange(m.id, 'class_h_hrs', e.target.value || '0')} style={{ width: 52, color: 'var(--green)', fontWeight: 700 }} /><span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span></td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <button onClick={() => handleToggle(m.id, 'shift_enabled')} title={(m.shift_enabled ?? true) ? 'กะเปิด — คลิกเพื่อปิด' : 'กะปิด — คลิกเพื่อเปิด'} style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', opacity: (m.shift_enabled ?? true) ? 1 : 0.35, padding: '2px 4px' }}>{(m.shift_enabled ?? true) ? '🌙' : '🌑'}</button>
                          {(m.shift_enabled ?? true) && (<><input className={styles.inputNum} type="number" min={1} max={24} step={0.5} defaultValue={m.shift_hrs ?? ''} placeholder={String(shiftHrsDefault)} onBlur={e => { if (e.target.value) handleChange(m.id, 'shift_hrs', e.target.value) }} style={{ width: 44, color: 'var(--blue)', fontWeight: 700 }} /><span style={{ fontSize: 9, color: 'var(--txt3)' }}>h</span></>)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                          {[1,2,3,4,5,6].map(dow => {
                            const isOff = (m.off_days ?? []).includes(dow)
                            return (<button key={dow} onClick={() => toggleOffDay(m.id, dow)} title={isOff ? `เปิด ${DAY_TH[dow]}` : `ปิด ${DAY_TH[dow]}`} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--bord2)', fontSize: 9, fontWeight: 700, cursor: 'pointer', background: isOff ? 'rgba(224,90,78,.15)' : 'rgba(166,227,161,.15)', color: isOff ? 'var(--red)' : 'var(--green)', textDecoration: isOff ? 'line-through' : 'none' }}>{DAY_SHORT[dow]}</button>)
                          })}
                        </div>
                        {(m.off_days ?? []).length > 0 && <div style={{ fontSize: 8, color: 'var(--red)', marginTop: 3 }}>ปิด: {(m.off_days ?? []).map(d => DAY_SHORT[d]).join(' ')}</div>}
                      </td>
                      <td><input className={styles.input} defaultValue={m.notes} onBlur={e => handleChange(m.id, 'notes', e.target.value)} style={{ width: '100%', minWidth: 180 }} /></td>
                      <td>
                        <div className={styles.chips}>
                          {supported.length === 0 ? <span className={styles.dim}>—</span> : supported.map(p => {
                            const col = p.kva <= 400 ? 'var(--blue)' : p.kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                            return <span key={p.kva} className={styles.chip} style={{ color: col }}>{p.label.split('—')[0].trim()}</span>
                          })}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}><button className={styles.delBtn} onClick={() => handleDelete(m.id)}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
            {machines.map(m => {
              const supported = Object.values(products)
                .filter(p => p.kva && p.kva >= m.min_kva && p.kva <= m.max_kva)
                .sort((a, b) => a.kva - b.kva)
              const inp = (opts: {
                field: keyof Omit<CuttingMachine, 'id'>
                defaultValue: number | string | undefined
                min?: number; max?: number; step?: number
                placeholder?: string; color?: string; width?: number
                fallback?: string
              }) => (
                <input
                  className={styles.inputNum}
                  type="number"
                  min={opts.min} max={opts.max} step={opts.step ?? 1}
                  defaultValue={opts.defaultValue ?? ''}
                  placeholder={opts.placeholder}
                  onBlur={e => handleChange(m.id, opts.field, e.target.value || (opts.fallback ?? '0'))}
                  style={{ width: opts.width ?? 52, color: opts.color, fontWeight: 700 }}
                />
              )
              const toggle = (val: boolean, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm', label: string) => (
                <button
                  onClick={() => handleToggle(m.id, field)}
                  style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
                    border: `1px solid ${val ? 'var(--green)' : 'var(--bord2)'}`,
                    background: val ? 'rgba(166,227,161,.18)' : 'var(--bg3)',
                    color: val ? 'var(--green)' : 'var(--txt3)',
                  }}>
                  {label}
                </button>
              )
              return (
                <div key={m.id} style={{
                  background: 'var(--bg3)', border: `1px solid ${saving === m.id ? 'var(--blue)' : 'var(--bord)'}`,
                  borderRadius: 8, overflow: 'hidden', opacity: saving === m.id ? 0.7 : 1,
                  transition: 'border-color .15s, opacity .15s',
                }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'var(--bg4)', borderBottom: '1px solid var(--bord)' }}>
                    <input
                      className={styles.input}
                      defaultValue={m.name}
                      onBlur={e => handleChange(m.id, 'name', e.target.value)}
                      style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 12 }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, color: 'var(--txt3)' }}>×</span>
                      <input
                        className={styles.inputNum}
                        type="number" min={1} max={20}
                        defaultValue={m.count}
                        onBlur={e => handleChange(m.id, 'count', e.target.value)}
                        style={{ width: 36, color: 'var(--txt)', fontWeight: 700, fontSize: 12 }}
                      />
                    </div>
                    <button
                      onClick={() => handleToggle(m.id, 'shift_enabled')}
                      title={(m.shift_enabled ?? true) ? 'กะเปิด — คลิกปิด' : 'กะปิด — คลิกเปิด'}
                      style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', opacity: (m.shift_enabled ?? true) ? 1 : 0.35, padding: '1px 2px', flexShrink: 0 }}>
                      {(m.shift_enabled ?? true) ? '🌙' : '🌑'}
                    </button>
                    <button className={styles.delBtn} onClick={() => handleDelete(m.id)} style={{ flexShrink: 0 }}>✕</button>
                  </div>

                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* kVA + base time */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <F label="kVA ต่ำสุด">
                        {inp({ field: 'min_kva', defaultValue: m.min_kva <= 0 ? '' : m.min_kva, min: 0, step: 50, placeholder: '0', color: 'var(--blue)', fallback: '0' })}
                      </F>
                      <F label="kVA สูงสุด">
                        {inp({ field: 'max_kva', defaultValue: m.max_kva >= 9999 ? '' : m.max_kva, min: 0, step: 50, placeholder: '∞', color: 'var(--red)', fallback: '9999' })}
                      </F>
                    </div>

                    <Divider />

                    {/* Schedule hours */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      <F label="Reg h/วัน">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {inp({ field: 'reg_hrs', defaultValue: m.reg_hrs ?? 8, min: 1, max: 24, step: 0.5, color: 'var(--green)', fallback: '8' })}
                          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>h</span>
                        </div>
                      </F>
                      <F label="OT h/วัน">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {inp({ field: 'ot_hrs', defaultValue: m.ot_hrs ?? 4, min: 0, max: 12, step: 0.5, color: 'var(--amber)', fallback: '0' })}
                          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>h</span>
                        </div>
                      </F>
                      <F label="กะ h/คืน">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <input
                            className={styles.inputNum}
                            type="number" min={1} max={24} step={0.5}
                            defaultValue={m.shift_hrs ?? ''}
                            placeholder={String(shiftHrsDefault)}
                            onBlur={e => { if (e.target.value) handleChange(m.id, 'shift_hrs', e.target.value) }}
                            style={{ width: 52, color: 'var(--blue)', fontWeight: 700, opacity: (m.shift_enabled ?? true) ? 1 : 0.35 }}
                          />
                          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>h</span>
                        </div>
                      </F>
                    </div>

                    {/* Time modifiers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      <F label="h/ตัว">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {inp({ field: 'hrs_per_unit', defaultValue: m.hrs_per_unit, min: 0.1, step: 0.5, color: 'var(--green)', fallback: '1' })}
                        </div>
                      </F>
                      <F label="×Rate">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {inp({ field: 'time_mul', defaultValue: m.time_mul ?? 1, min: 0.1, max: 5, step: 0.05, color: 'var(--amber)', fallback: '1' })}
                          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>×</span>
                        </div>
                      </F>
                      <F label="TMC (h)">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {inp({ field: 'tmc_hrs', defaultValue: m.tmc_hrs ?? 0, min: 0, max: 8, step: 0.1, color: 'var(--purple)', fallback: '0' })}
                          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>h</span>
                        </div>
                      </F>
                      <F label="⚡ TR (h)">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {inp({ field: 'tr_power_hrs', defaultValue: m.tr_power_hrs ?? 0, min: 0, max: 99, step: 0.1, color: 'var(--red)', fallback: '0' })}
                          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>h</span>
                        </div>
                      </F>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      <F label="🧱 Class H (h)">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {inp({ field: 'class_h_hrs', defaultValue: m.class_h_hrs ?? 0, min: 0, max: 99, step: 0.1, color: 'var(--green)', fallback: '0' })}
                          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>h</span>
                        </div>
                      </F>
                      <F label="หน้ากว้าง min (mm)">
                        {inp({ field: 'min_face_mm', defaultValue: m.min_face_mm <= 1 ? '' : m.min_face_mm, min: 1, placeholder: '—', color: 'var(--txt2)', fallback: '1' })}
                      </F>
                      <F label="หน้ากว้าง max (mm)">
                        {inp({ field: 'max_face_mm', defaultValue: m.max_face_mm >= 9999 ? '' : m.max_face_mm, min: 1, placeholder: '∞', color: 'var(--txt2)', fallback: '9999' })}
                      </F>
                    </div>

                    <Divider />

                    {/* Capabilities */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {toggle(m.laser,    'laser',    '⚡ Laser')}
                      {toggle(m.m4,       'm4',       'M4')}
                      {toggle(m.drill_8mm,  'drill_8mm',  '⌀8mm')}
                      {toggle(m.drill_22mm, 'drill_22mm', '⌀22mm')}
                    </div>

                    <Divider />

                    {/* Working days */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 8, color: 'var(--txt3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>วันทำงาน</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[1,2,3,4,5,6].map(dow => {
                          const isOff = (m.off_days ?? []).includes(dow)
                          return (
                            <button key={dow} onClick={() => toggleOffDay(m.id, dow)}
                              title={isOff ? `เปิด ${DAY_TH[dow]}` : `ปิด ${DAY_TH[dow]}`}
                              style={{
                                flex: 1, height: 26, borderRadius: 5, border: '1px solid var(--bord2)',
                                fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                background: isOff ? 'rgba(224,90,78,.15)' : 'rgba(166,227,161,.15)',
                                color: isOff ? 'var(--red)' : 'var(--green)',
                                textDecoration: isOff ? 'line-through' : 'none',
                              }}>
                              {DAY_SHORT[dow]}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <Divider />

                    {/* Notes */}
                    <F label="หมายเหตุ">
                      <input
                        className={styles.input}
                        defaultValue={m.notes}
                        onBlur={e => handleChange(m.id, 'notes', e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </F>

                    {/* Supported transformers */}
                    {supported.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 8, color: 'var(--txt3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>รองรับ ({supported.length} รุ่น)</span>
                        <div className={styles.chips}>
                          {supported.map(p => {
                            const col = p.kva <= 400 ? 'var(--blue)' : p.kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                            return (
                              <span key={p.kva} className={styles.chip} style={{ color: col }}>
                                {p.label.split('—')[0].trim()}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
