import React from 'react'
import type { CuttingMachine, CuttingRate } from '../../../../types'
import styles from '../CuttingPage.module.css'
import { CR_STANDARD_SIZES } from '../scheduling/constants'
import { mLabel } from '../scheduling/utils'

export interface PerMachineRatesPanelProps {
  open: boolean
  setOpen: (v: boolean) => void
  machines: CuttingMachine[]
  machineRateTab: number | null
  setMachineRateTab: (v: number | null) => void
  machineRateSubTab: 'cut' | 'tmc' | 'tr' | 'ch'
  setMachineRateSubTab: (v: 'cut' | 'tmc' | 'tr' | 'ch') => void
  shiftHrsDefault: number
  saveMachineRates: (machineId: number, rates: CuttingRate[]) => void
  saveMachineTmcRates: (machineId: number, rates: CuttingRate[]) => void
  saveMachineTrPowerRates: (machineId: number, rates: CuttingRate[]) => void
  saveMachineClassHRates: (machineId: number, rates: CuttingRate[]) => void
  // globalRates needed for "copy from standard" button
  globalRates: CuttingRate[]
}

export default function PerMachineRatesPanel({
  open,
  setOpen,
  machines,
  machineRateTab,
  setMachineRateTab,
  machineRateSubTab,
  setMachineRateSubTab,
  saveMachineRates,
  saveMachineTmcRates,
  saveMachineTrPowerRates,
  saveMachineClassHRates,
  globalRates,
}: PerMachineRatesPanelProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader} style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span className={styles.sectionTitle}>
          {open ? '▾' : '▸'} ⏱ เวลาตัดโลหะ — รายเครื่อง
          {!open && (
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--txt3)', marginLeft: 10 }}>
              override อัตราตัดเฉพาะเครื่อง · {machines.filter(m => (m.rates?.length ?? 0) > 0 || (m.tmc_rates?.length ?? 0) > 0).length}/{machines.length} เครื่องมี override
            </span>
          )}
        </span>
      </div>
      {open && <div style={{ padding: '10px 14px' }}>
        {/* Machine tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {machines.map(m => {
            const hasCut = (m.rates ?? []).length > 0
            const hasTmc = (m.tmc_rates ?? []).length > 0
            const hasTr = (m.tr_power_rates ?? []).length > 0
            const hasCh = (m.class_h_rates ?? []).length > 0
            const hasAny = hasCut || hasTmc || hasTr || hasCh
            const isActive = machineRateTab === m.id
            return (
              <button key={m.id}
                onClick={() => { setMachineRateTab(isActive ? null : m.id); if (!isActive) setMachineRateSubTab('cut') }}
                style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                  border: `1px solid ${isActive ? 'var(--blue)' : hasAny ? 'rgba(166,227,161,.5)' : 'var(--bord2)'}`,
                  background: isActive ? 'rgba(137,180,250,.15)' : hasAny ? 'rgba(166,227,161,.08)' : 'var(--bg3)',
                  color: isActive ? 'var(--blue)' : hasAny ? 'var(--green)' : 'var(--txt3)',
                }}>
                {mLabel(m)}
                {hasAny && <span style={{ fontSize: 9, marginLeft: 5, opacity: 0.8 }}>
                  {[hasCut && `✂${(m.rates ?? []).length}`, hasTmc && `T${(m.tmc_rates ?? []).length}`, hasTr && `⚡${(m.tr_power_rates ?? []).length}`, hasCh && `🧱${(m.class_h_rates ?? []).length}`].filter(Boolean).join(' ')}
                </span>}
              </button>
            )
          })}
        </div>

        {machineRateTab !== null && (() => {
          const m = machines.find(x => x.id === machineRateTab)
          if (!m) return null
          const mRates   = [...(m.rates ?? [])].sort((a, b) => a.kva - b.kva)
          const tmcRates = [...(m.tmc_rates ?? [])].sort((a, b) => a.kva - b.kva)
          const trRates  = [...(m.tr_power_rates ?? [])].sort((a, b) => a.kva - b.kva)
          const chRates  = [...(m.class_h_rates ?? [])].sort((a, b) => a.kva - b.kva)
          const isCut = machineRateSubTab === 'cut'
          const isTr  = machineRateSubTab === 'tr'
          const isCh  = machineRateSubTab === 'ch'
          return (
            <div>
              {/* Machine info */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, padding: '7px 12px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--bord)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{mLabel(m)}</span>
                <code style={{ fontSize: 11, color: 'var(--amber)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>
                  เวลา = base × {m.time_mul ?? 1} + {m.tmc_hrs ?? 0}h TMC + {m.tr_power_hrs ?? 0}h TR + {m.class_h_hrs ?? 0}h H
                </code>
                <span style={{ fontSize: 9, color: 'var(--txt3)' }}>แก้ไข ×Rate / TMC ได้ในตารางเครื่องด้านบน</span>
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--bord)' }}>
                <button onClick={() => setMachineRateSubTab('cut')}
                  style={{ fontSize: 11, padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: isCut ? 700 : 400,
                    border: `1px solid ${isCut ? 'var(--blue)' : 'var(--bord2)'}`,
                    background: isCut ? 'rgba(137,180,250,.15)' : 'transparent',
                    color: isCut ? 'var(--blue)' : 'var(--txt3)' }}>
                  ✂ Oil Type{mRates.length > 0 ? ` (${mRates.length})` : ''}
                </button>
                <button onClick={() => setMachineRateSubTab('tmc')}
                  style={{ fontSize: 11, padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: machineRateSubTab === 'tmc' ? 700 : 400,
                    border: `1px solid ${machineRateSubTab === 'tmc' ? 'var(--purple)' : 'var(--bord2)'}`,
                    background: machineRateSubTab === 'tmc' ? 'rgba(203,166,247,.15)' : 'transparent',
                    color: machineRateSubTab === 'tmc' ? 'var(--purple)' : 'var(--txt3)' }}>
                  ⚗ TMC Cast Resin{tmcRates.length > 0 ? ` (${tmcRates.length})` : ''}
                </button>
                <button onClick={() => setMachineRateSubTab('tr')}
                  style={{ fontSize: 11, padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: isTr ? 700 : 400,
                    border: `1px solid ${isTr ? 'var(--red)' : 'var(--bord2)'}`,
                    background: isTr ? 'rgba(243,139,168,.15)' : 'transparent',
                    color: isTr ? 'var(--red)' : 'var(--txt3)' }}>
                  ⚡ TR Power{trRates.length > 0 ? ` (${trRates.length})` : ''}
                </button>
                <button onClick={() => setMachineRateSubTab('ch')}
                  style={{ fontSize: 11, padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: isCh ? 700 : 400,
                    border: `1px solid ${isCh ? 'var(--green)' : 'var(--bord2)'}`,
                    background: isCh ? 'rgba(166,227,161,.15)' : 'transparent',
                    color: isCh ? 'var(--green)' : 'var(--txt3)' }}>
                  🧱 Class H{chRates.length > 0 ? ` (${chRates.length})` : ''}
                </button>
              </div>

              {isCh ? (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 8 }}>
                    Class H (B=6/T) · fallback: {(m.class_h_hrs ?? 0) > 0 ? `${m.class_h_hrs}h` : 'ไม่ได้ตั้ง'}
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'right', width: 110 }}>ขนาด (kVA)</th>
                          <th style={{ textAlign: 'right', width: 160, color: 'var(--green)' }}>Class H (h)</th>
                          <th style={{ width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {chRates.length === 0 && (
                          <tr><td colSpan={3} className={styles.empty}>ยังไม่มี — ใช้ Class H (h) = {m.class_h_hrs ?? 0}h สำหรับทุกขนาด</td></tr>
                        )}
                        {chRates.map((r, ri) => (
                          <tr key={ri}>
                            <td style={{ textAlign: 'right' }}>
                              <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                                onChange={e => saveMachineClassHRates(m.id, chRates.map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x))}
                                className={styles.inputNum} style={{ width: 80, color: 'var(--blue)', fontWeight: 700 }} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                                  onChange={e => saveMachineClassHRates(m.id, chRates.map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x))}
                                  className={styles.inputNum} style={{ width: 64, color: 'var(--green)' }} />
                                <button className={styles.btnGhost} onClick={() => saveMachineClassHRates(m.id, chRates.map((x, i) => i === ri ? { ...x, hrs: +(x.hrs + 10).toFixed(2) } : x))}
                                  style={{ fontSize: 10, padding: '1px 5px', color: 'var(--green)', borderColor: 'rgba(166,227,161,.4)' }}>+10</button>
                                <button className={styles.btnGhost} onClick={() => saveMachineClassHRates(m.id, chRates.map((x, i) => i === ri ? { ...x, hrs: +(x.hrs + 20).toFixed(2) } : x))}
                                  style={{ fontSize: 10, padding: '1px 5px', color: 'var(--green)', borderColor: 'rgba(166,227,161,.4)' }}>+20</button>
                              </div>
                            </td>
                            <td>
                              <button className={styles.delBtn} onClick={() => saveMachineClassHRates(m.id, chRates.filter((_, i) => i !== ri))}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 14px' }}>
                    <button className={styles.btnGhost} onClick={() => saveMachineClassHRates(m.id, [...chRates, { kva: 0, hrs: m.class_h_hrs ?? 0 }])}
                      style={{ color: 'var(--green)', borderColor: 'rgba(166,227,161,.4)' }}>
                      + เพิ่มขนาด Class H
                    </button>
                    {chRates.length > 0 && (
                      <button className={styles.btnGhost} onClick={() => saveMachineClassHRates(m.id, [])} style={{ color: 'var(--red)', borderColor: 'rgba(224,90,78,.3)' }}>
                        ล้าง Class H
                      </button>
                    )}
                  </div>
                </div>
              ) : isTr ? (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 8 }}>
                    TR Power · fallback: {(m.tr_power_hrs ?? 0) > 0 ? `${m.tr_power_hrs}h` : 'ไม่ได้ตั้ง'}
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'right', width: 110 }}>ขนาด (kVA)</th>
                          <th style={{ textAlign: 'right', width: 160, color: 'var(--red)' }}>TR Power (h)</th>
                          <th style={{ width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {trRates.length === 0 && (
                          <tr><td colSpan={3} className={styles.empty}>ยังไม่มี — ใช้ TR Power (h) = {m.tr_power_hrs ?? 0}h สำหรับทุกขนาด</td></tr>
                        )}
                        {trRates.map((r, ri) => (
                          <tr key={ri}>
                            <td style={{ textAlign: 'right' }}>
                              <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                                onChange={e => saveMachineTrPowerRates(m.id, trRates.map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x))}
                                className={styles.inputNum} style={{ width: 80, color: 'var(--blue)', fontWeight: 700 }} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                                  onChange={e => saveMachineTrPowerRates(m.id, trRates.map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x))}
                                  className={styles.inputNum} style={{ width: 64, color: 'var(--red)' }} />
                                <button className={styles.btnGhost} onClick={() => saveMachineTrPowerRates(m.id, trRates.map((x, i) => i === ri ? { ...x, hrs: +(x.hrs + 10).toFixed(2) } : x))}
                                  style={{ fontSize: 10, padding: '1px 5px', color: 'var(--red)', borderColor: 'rgba(243,139,168,.4)' }}>+10</button>
                                <button className={styles.btnGhost} onClick={() => saveMachineTrPowerRates(m.id, trRates.map((x, i) => i === ri ? { ...x, hrs: +(x.hrs + 20).toFixed(2) } : x))}
                                  style={{ fontSize: 10, padding: '1px 5px', color: 'var(--red)', borderColor: 'rgba(243,139,168,.4)' }}>+20</button>
                              </div>
                            </td>
                            <td>
                              <button className={styles.delBtn} onClick={() => saveMachineTrPowerRates(m.id, trRates.filter((_, i) => i !== ri))}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 14px' }}>
                    <button className={styles.btnGhost} onClick={() => saveMachineTrPowerRates(m.id, [...trRates, { kva: 0, hrs: m.tr_power_hrs ?? 0 }])}
                      style={{ color: 'var(--red)', borderColor: 'rgba(243,139,168,.4)' }}>
                      + เพิ่มขนาด TR Power
                    </button>
                    {trRates.length > 0 && (
                      <button className={styles.btnGhost} onClick={() => saveMachineTrPowerRates(m.id, [])} style={{ color: 'var(--red)', borderColor: 'rgba(224,90,78,.3)' }}>
                        ล้าง TR Power
                      </button>
                    )}
                  </div>
                </div>
              ) : isCut ? (
                <div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'right', width: 110 }}>ขนาด (kVA)</th>
                          <th style={{ textAlign: 'right', width: 110 }}>Oil Type (h)</th>
                          <th style={{ textAlign: 'right', width: 110, color: 'var(--purple)' }}>รวม TMC</th>
                          <th style={{ width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {mRates.length === 0 && (
                          <tr><td colSpan={4} className={styles.empty}>ยังไม่มีค่าเฉพาะ — ใช้ค่ามาตรฐาน</td></tr>
                        )}
                        {mRates.map((r, ri) => {
                          const finalHrs = r.hrs * (m.time_mul ?? 1) + (m.tmc_hrs ?? 0)
                          return (
                            <tr key={ri}>
                              <td style={{ textAlign: 'right' }}>
                                <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                                  onChange={e => saveMachineRates(m.id, mRates.map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x))}
                                  className={styles.inputNum} style={{ width: 80, color: 'var(--blue)', fontWeight: 700 }} />
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                                  onChange={e => saveMachineRates(m.id, mRates.map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x))}
                                  className={styles.inputNum} style={{ width: 80, color: 'var(--amber)' }} />
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)', fontWeight: 600, fontSize: 12 }}>
                                = {finalHrs.toFixed(2)}h
                              </td>
                              <td>
                                <button className={styles.delBtn} onClick={() => saveMachineRates(m.id, mRates.filter((_, i) => i !== ri))}>✕</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 14px' }}>
                    <button className={styles.btnGhost} onClick={() => saveMachineRates(m.id, [...mRates, { kva: 0, hrs: m.hrs_per_unit }])}>+ เพิ่มขนาด</button>
                    {globalRates.length > 0 && (
                      <button className={styles.btnGhost}
                        title="คัดลอกค่ามาตรฐาน — ขนาดที่มีอยู่แล้วจะไม่ถูกเขียนทับ"
                        onClick={() => {
                          const existingKvas = new Set(mRates.map(r => r.kva))
                          const newRates = [...mRates, ...globalRates.filter(r => !existingKvas.has(r.kva)).map(r => ({ kva: r.kva, hrs: r.hrs }))].sort((a, b) => a.kva - b.kva)
                          saveMachineRates(m.id, newRates)
                        }}
                        style={{ color: 'var(--green)', borderColor: 'rgba(166,227,161,.5)' }}>
                        📋 คัดลอกมาตรฐาน ({globalRates.length})
                      </button>
                    )}
                    {mRates.length > 0 && (
                      <button className={styles.btnGhost} onClick={() => saveMachineRates(m.id, [])} style={{ color: 'var(--red)', borderColor: 'rgba(224,90,78,.3)' }}>
                        ล้างค่าเฉพาะ
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 8 }}>
                    ใช้เมื่อ B=4 (Cast Resin) · fallback: {(m.tmc_hrs ?? 0) > 0 ? `${m.tmc_hrs}h` : 'ไม่ได้ตั้ง'}
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'right', width: 110 }}>ขนาด (kVA)</th>
                          <th style={{ textAlign: 'right', width: 110, color: 'var(--purple)' }}>TMC (h)</th>
                          <th style={{ width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {tmcRates.length === 0 && (
                          <tr><td colSpan={3} className={styles.empty}>ยังไม่มี — ใช้ TMC (h) = {m.tmc_hrs ?? 0}h สำหรับทุกขนาด</td></tr>
                        )}
                        {tmcRates.map((r, ri) => (
                          <tr key={ri}>
                            <td style={{ textAlign: 'right' }}>
                              <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                                onChange={e => saveMachineTmcRates(m.id, tmcRates.map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x))}
                                className={styles.inputNum} style={{ width: 80, color: 'var(--blue)', fontWeight: 700 }} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                                onChange={e => saveMachineTmcRates(m.id, tmcRates.map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x))}
                                className={styles.inputNum} style={{ width: 80, color: 'var(--purple)' }} />
                            </td>
                            <td>
                              <button className={styles.delBtn} onClick={() => saveMachineTmcRates(m.id, tmcRates.filter((_, i) => i !== ri))}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 14px' }}>
                    <button className={styles.btnGhost} onClick={() => saveMachineTmcRates(m.id, [...tmcRates, { kva: 0, hrs: m.tmc_hrs ?? 0 }])} style={{ color: 'var(--purple)', borderColor: 'rgba(203,166,247,.4)' }}>
                      + เพิ่มขนาด TMC
                    </button>
                    <button className={styles.btnGhost}
                      title="เติม 23 ขนาดมาตรฐาน Cast Resin — ขนาดที่มีอยู่แล้วจะไม่ถูกเขียนทับ"
                      onClick={() => {
                        const existingKvas = new Set(tmcRates.map(r => r.kva))
                        const newRates = [...tmcRates, ...CR_STANDARD_SIZES.filter(kva => !existingKvas.has(kva)).map(kva => ({ kva, hrs: m.tmc_hrs ?? 0 }))].sort((a, b) => a.kva - b.kva)
                        saveMachineTmcRates(m.id, newRates)
                      }}
                      style={{ color: 'var(--green)', borderColor: 'rgba(166,227,161,.4)' }}>
                      📋 คัดลอกมาตรฐาน ({CR_STANDARD_SIZES.length})
                    </button>
                    {tmcRates.length > 0 && (
                      <button className={styles.btnGhost} onClick={() => saveMachineTmcRates(m.id, [])} style={{ color: 'var(--red)', borderColor: 'rgba(224,90,78,.3)' }}>
                        ล้าง TMC
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>}
    </div>
  )
}
