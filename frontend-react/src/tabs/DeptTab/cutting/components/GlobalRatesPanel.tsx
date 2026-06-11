import React from 'react'
import type { CuttingRate, RoutingCrRow } from '../../../../types'
import styles from '../CuttingPage.module.css'
import { CR_STANDARD_SIZES } from '../scheduling/constants'
import { getRoutingOps } from '../scheduling/routingRates'

export interface GlobalRatesPanelProps {
  open: boolean
  setOpen: (v: boolean) => void
  globalRates: CuttingRate[]
  globalTmcRates: CuttingRate[]
  effectiveGlobalRates: CuttingRate[]
  effectiveGlobalTmcRates: CuttingRate[]
  useRoutingCr: boolean
  setUseRoutingCr: (v: boolean) => void
  routingCrData: RoutingCrRow[]
  routingNormalRates: CuttingRate[]
  routingCrRates: CuttingRate[]
  routingWcFilter: string[]
  setRoutingWcFilter: (v: string[]) => void
  availableRoutingWcs: string[]
  routingRatesOpen: boolean
  setRoutingRatesOpen: (v: boolean) => void
  expandedRoutingRow: string | null
  setExpandedRoutingRow: (v: string | null) => void
  saveGlobalRates: (rates: CuttingRate[]) => void
  saveGlobalTmcRates: (rates: CuttingRate[]) => void
  globalRateSubTab: 'cut' | 'tmc'
  setGlobalRateSubTab: (v: 'cut' | 'tmc') => void
}

export default function GlobalRatesPanel({
  open,
  setOpen,
  globalRates,
  globalTmcRates,
  effectiveGlobalRates,
  effectiveGlobalTmcRates,
  useRoutingCr,
  setUseRoutingCr,
  routingCrData,
  routingNormalRates,
  routingCrRates,
  routingWcFilter,
  setRoutingWcFilter,
  availableRoutingWcs,
  routingRatesOpen,
  setRoutingRatesOpen,
  expandedRoutingRow,
  setExpandedRoutingRow,
  saveGlobalRates,
  saveGlobalTmcRates,
  globalRateSubTab,
  setGlobalRateSubTab,
}: GlobalRatesPanelProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader} style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span className={styles.sectionTitle}>
          {open ? '▾' : '▸'} ⏱ เวลาตัดโลหะ — มาตรฐาน
          {!open && (
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--txt3)', marginLeft: 10 }}>
              ตารางเวลาตัด kVA → ชั่วโมง สำหรับทุกเครื่อง · {globalRates.length} ขนาด · TMC {globalTmcRates.length} ขนาด
            </span>
          )}
        </span>
        <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setUseRoutingCr(false)}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: !useRoutingCr ? 700 : 400,
              border: `1px solid ${!useRoutingCr ? 'var(--blue)' : 'var(--bord2)'}`,
              background: !useRoutingCr ? 'rgba(137,180,250,.15)' : 'transparent',
              color: !useRoutingCr ? 'var(--blue)' : 'var(--txt3)' }}>
            📊 Manual
          </button>
          <button
            onClick={() => setUseRoutingCr(true)}
            title={routingCrData.length === 0 ? 'ยังไม่มีข้อมูล Routing CR' : `${routingNormalRates.length} ขนาด · TMC ${routingCrRates.length} ขนาด`}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: useRoutingCr ? 700 : 400,
              border: `1px solid ${useRoutingCr ? 'var(--green)' : 'var(--bord2)'}`,
              background: useRoutingCr ? 'rgba(166,227,161,.15)' : 'transparent',
              color: routingCrData.length === 0 ? 'var(--txt3)' : useRoutingCr ? 'var(--green)' : 'var(--txt3)' }}>
            🏭 Routing CR{routingCrData.length > 0 ? ` (${routingNormalRates.length}+${routingCrRates.length})` : ' —'}
          </button>
          {routingCrData.length > 0 && (
            <button
              onClick={() => setRoutingRatesOpen(!routingRatesOpen)}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${routingRatesOpen ? 'var(--amber)' : 'var(--bord2)'}`,
                background: routingRatesOpen ? 'rgba(249,226,175,.15)' : 'transparent',
                color: routingRatesOpen ? 'var(--amber)' : 'var(--txt3)' }}>
              👁 View
            </button>
          )}
        </span>
      </div>
      {!open ? null : <>
      {/* WC filter */}
      {useRoutingCr && availableRoutingWcs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid var(--bord)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>Work Centers ที่นับ:</span>
          {availableRoutingWcs.map(wc => {
            const active = routingWcFilter.includes(wc)
            return (
              <button key={wc}
                onClick={() => setRoutingWcFilter(active ? routingWcFilter.filter(w => w !== wc) : [...routingWcFilter, wc])}
                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, cursor: 'pointer', fontWeight: active ? 700 : 400,
                  border: `1px solid ${active ? 'var(--green)' : 'var(--bord2)'}`,
                  background: active ? 'rgba(166,227,161,.15)' : 'transparent',
                  color: active ? 'var(--green)' : 'var(--txt3)' }}>
                {wc}
              </button>
            )
          })}
          <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 4 }}>
            {routingWcFilter.length === 0 ? '(ทั้งหมด)' : `${routingWcFilter.length}/${availableRoutingWcs.length} WC`}
          </span>
        </div>
      )}
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 14px', borderBottom: '1px solid var(--bord)' }}>
        <button onClick={() => setGlobalRateSubTab('cut')}
          style={{ fontSize: 11, padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: globalRateSubTab === 'cut' ? 700 : 400,
            border: `1px solid ${globalRateSubTab === 'cut' ? 'var(--blue)' : 'var(--bord2)'}`,
            background: globalRateSubTab === 'cut' ? 'rgba(137,180,250,.15)' : 'transparent',
            color: globalRateSubTab === 'cut' ? 'var(--blue)' : 'var(--txt3)' }}>
          ✂ เวลาตัด{effectiveGlobalRates.length > 0 ? ` (${effectiveGlobalRates.length})` : ''}
          {useRoutingCr && routingNormalRates.length > 0 && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--green)' }}>🏭</span>}
        </button>
        <button onClick={() => setGlobalRateSubTab('tmc')}
          style={{ fontSize: 11, padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: globalRateSubTab === 'tmc' ? 700 : 400,
            border: `1px solid ${globalRateSubTab === 'tmc' ? 'var(--purple)' : 'var(--bord2)'}`,
            background: globalRateSubTab === 'tmc' ? 'rgba(203,166,247,.15)' : 'transparent',
            color: globalRateSubTab === 'tmc' ? 'var(--purple)' : 'var(--txt3)' }}>
          ⚗ TMC Cast Resin{effectiveGlobalTmcRates.length > 0 ? ` (${effectiveGlobalTmcRates.length})` : ''}
          {useRoutingCr && routingCrRates.length > 0 && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--green)' }}>🏭</span>}
        </button>
      </div>

      {globalRateSubTab === 'cut' ? (
        <>
          {useRoutingCr && routingNormalRates.length > 0 && (
            <div style={{ padding: '5px 14px', background: 'rgba(166,227,161,.08)', borderBottom: '1px solid rgba(166,227,161,.2)', fontSize: 10, color: 'var(--green)' }}>
              🏭 แสดงเวลาจาก Routing CR — อ่านอย่างเดียว (สลับเป็น 📊 Manual เพื่อแก้ไข)
            </div>
          )}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'right', width: 110 }}>ขนาด (kVA)</th>
                  <th style={{ textAlign: 'right', width: 110 }}>เวลาตัด (h)</th>
                  {!useRoutingCr && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {effectiveGlobalRates.length === 0 && (
                  <tr><td colSpan={3} className={styles.empty}>ยังไม่มีข้อมูล — ใช้ค่า h/ตัว ของแต่ละเครื่องแทน</td></tr>
                )}
                {useRoutingCr
                  ? [...effectiveGlobalRates].sort((a, b) => a.kva - b.kva).map((r, ri) => (
                    <tr key={ri}>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)', padding: '4px 8px' }}>{r.kva.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: 700, padding: '4px 8px' }}>{r.hrs.toFixed(2)}h</td>
                    </tr>
                  ))
                  : [...globalRates].sort((a, b) => a.kva - b.kva).map((r, ri) => (
                    <tr key={ri}>
                      <td style={{ textAlign: 'right' }}>
                        <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                          onChange={e => saveGlobalRates(globalRates.map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x))}
                          className={styles.inputNum} style={{ width: 80, color: 'var(--blue)', fontWeight: 700 }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                          onChange={e => saveGlobalRates(globalRates.map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x))}
                          className={styles.inputNum} style={{ width: 80, color: 'var(--amber)' }} />
                      </td>
                      <td>
                        <button className={styles.delBtn} onClick={() => saveGlobalRates(globalRates.filter((_, i) => i !== ri))}>✕</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
          {!useRoutingCr && (
            <div style={{ padding: '8px 14px' }}>
              <button className={styles.btnGhost} onClick={() => saveGlobalRates([...globalRates, { kva: 0, hrs: 2.5 }])}>+ เพิ่มขนาด</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 10, color: useRoutingCr && routingCrRates.length > 0 ? 'var(--green)' : 'var(--txt3)', padding: '6px 14px 0' }}>
            {useRoutingCr && routingCrRates.length > 0
              ? '🏭 แสดงเวลาจาก Routing CR (Cast Resin) — อ่านอย่างเดียว'
              : 'ใช้เมื่อ B=4 (Cast Resin) · ลำดับ: รายเครื่อง → มาตรฐาน → TMC (h) ของเครื่อง'}
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'right', width: 110 }}>ขนาด (kVA)</th>
                  <th style={{ textAlign: 'right', width: 110, color: 'var(--purple)' }}>TMC (h)</th>
                  {!useRoutingCr && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {effectiveGlobalTmcRates.length === 0 && (
                  <tr><td colSpan={3} className={styles.empty}>ยังไม่มีข้อมูล — ใช้ค่า TMC (h) ของแต่ละเครื่องแทน</td></tr>
                )}
                {useRoutingCr
                  ? [...effectiveGlobalTmcRates].sort((a, b) => a.kva - b.kva).map((r, ri) => (
                    <tr key={ri}>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)', padding: '4px 8px' }}>{r.kva.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)', fontWeight: 700, padding: '4px 8px' }}>{r.hrs.toFixed(2)}h</td>
                    </tr>
                  ))
                  : [...globalTmcRates].sort((a, b) => a.kva - b.kva).map((r, ri) => (
                    <tr key={ri}>
                      <td style={{ textAlign: 'right' }}>
                        <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                          onChange={e => saveGlobalTmcRates(globalTmcRates.map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x))}
                          className={styles.inputNum} style={{ width: 80, color: 'var(--blue)', fontWeight: 700 }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                          onChange={e => saveGlobalTmcRates(globalTmcRates.map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x))}
                          className={styles.inputNum} style={{ width: 80, color: 'var(--purple)' }} />
                      </td>
                      <td>
                        <button className={styles.delBtn} onClick={() => saveGlobalTmcRates(globalTmcRates.filter((_, i) => i !== ri))}>✕</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
          {!useRoutingCr && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 14px' }}>
              <button className={styles.btnGhost} onClick={() => saveGlobalTmcRates([...globalTmcRates, { kva: 0, hrs: 2.4 }])} style={{ color: 'var(--purple)', borderColor: 'rgba(203,166,247,.4)' }}>
                + เพิ่มขนาด TMC
              </button>
              <button className={styles.btnGhost}
                title="เติม 23 ขนาดมาตรฐาน Cast Resin"
                onClick={() => {
                  const existingKvas = new Set(globalTmcRates.map(r => r.kva))
                  const newRates = [...globalTmcRates, ...CR_STANDARD_SIZES.filter(kva => !existingKvas.has(kva)).map(kva => ({ kva, hrs: 2.4 }))].sort((a, b) => a.kva - b.kva)
                  saveGlobalTmcRates(newRates)
                }}
                style={{ color: 'var(--green)', borderColor: 'rgba(166,227,161,.4)' }}>
                📋 เติม {CR_STANDARD_SIZES.length} ขนาดมาตรฐาน
              </button>
              {globalTmcRates.length > 0 && (
                <button className={styles.btnGhost} onClick={() => saveGlobalTmcRates([])} style={{ color: 'var(--red)', borderColor: 'rgba(224,90,78,.3)' }}>
                  ล้างทั้งหมด
                </button>
              )}
            </div>
          )}
        </>
      )}
      </>}

      {/* Routing CR Rates section (inline, shown when routingRatesOpen) */}
      {routingCrData.length > 0 && routingRatesOpen && (() => {
        const rateTable = (rates: typeof routingNormalRates, isCr: boolean) => {
          const col   = isCr ? 'var(--purple)' : 'var(--blue)'
          const label = isCr ? '⚗ Cast Resin Rates' : '✂ Normal Rates'
          const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
            <th style={{ padding: '4px 8px', background: 'var(--bg3)', fontWeight: 600, fontSize: 10, color: 'var(--txt3)', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--bord)' }}>{children}</th>
          )
          return (
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: col, padding: '8px 12px 4px' }}>{label} ({rates.length})</div>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                <thead><tr><Th>kVA</Th><Th right>Std Hrs</Th><Th right>Ops</Th></tr></thead>
                <tbody>
                  {[...rates].sort((a, b) => a.kva - b.kva).map(r => {
                    const rowKey = `${isCr ? 'cr' : 'n'}_${r.kva}`
                    const expanded = expandedRoutingRow === rowKey
                    const ops = getRoutingOps(routingCrData, r.kva, isCr, routingWcFilter)
                    return (
                      <React.Fragment key={r.kva}>
                        <tr
                          onClick={() => setExpandedRoutingRow(expanded ? null : rowKey)}
                          style={{ cursor: 'pointer', background: expanded ? 'rgba(137,180,250,.06)' : undefined }}>
                          <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt1)' }}>
                            {expanded ? '▾ ' : '▸ '}{r.kva.toLocaleString()}
                          </td>
                          <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{r.hrs.toFixed(2)}h</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--txt3)', fontSize: 10 }}>{ops.length}</td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={3} style={{ padding: '0 8px 8px 28px', background: 'var(--bg3)' }}>
                              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10, fontFamily: 'var(--mono)' }}>
                                <tbody>
                                  {ops.map((op, oi) => (
                                    <tr key={oi}>
                                      <td style={{ padding: '1px 6px 1px 0', color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>{op.operation}</td>
                                      <td style={{ padding: '1px 6px', color: 'var(--txt2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.description}</td>
                                      <td style={{ padding: '1px 0', textAlign: 'right', color: 'var(--amber)', fontWeight: 700, whiteSpace: 'nowrap' }}>{Number(op.std_hrs).toFixed(2)}h</td>
                                    </tr>
                                  ))}
                                  <tr style={{ borderTop: '1px solid var(--bord)' }}>
                                    <td colSpan={2} style={{ padding: '2px 6px 2px 0', fontWeight: 700, color: 'var(--txt2)' }}>Total</td>
                                    <td style={{ padding: '2px 0', textAlign: 'right', color: col, fontWeight: 700 }}>{r.hrs.toFixed(2)}h</td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
        return (
          <div style={{ display: 'flex', gap: 0, padding: 0 }}>
            {routingNormalRates.length > 0 && rateTable(routingNormalRates, false)}
            {routingCrRates.length > 0 && (
              <div style={{ borderLeft: '1px solid var(--bord)', flex: '0 0 auto', minWidth: 200 }}>
                {rateTable(routingCrRates, true)}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
