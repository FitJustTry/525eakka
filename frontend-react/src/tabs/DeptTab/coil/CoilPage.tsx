/**
 * Coil Department hub.
 *
 * Top: a 3-line capacity KPI strip (HV / Foil / Wire) for the current week,
 * computed with the SAME shared helpers the Factory Forecast uses — so the
 * numbers are guaranteed consistent.
 *
 * Below: a line switcher that runs the full DeptSchedulerPage for the selected
 * line (Daily/Weekly views, capacity, line utilisation, OT/Shift modes,
 * carry-over, late detection, plan snapshots, save/close week) — all reused,
 * no duplication. A "เครื่องจักร" sub-view keeps the legacy machine table.
 */

import { useMemo, useState } from 'react'
import { useApp } from '../../../context/AppContext'
import DeptSchedulerPage from '../components/DeptSchedulerPage'
import WindingMachines from '../winding/WindingPage'
import { COIL_LINES } from './configs'
import { getWeekRange, fmtISO } from '../cutting/scheduling/utils'
import { buildAllDeptRates, weekDemandByDept, getCapacityPools } from '../shared/deptRegistry'

const COIL_IDS = COIL_LINES.map(l => l.deptId)

export default function CoilPage() {
  const { state } = useApp()
  const { orders, wcConfig } = state
  const [view, setView] = useState<string>('hv')

  // Current-week utilisation per coil line (shared forecast helpers → consistent)
  const lineKpis = useMemo(() => {
    const { mon, sat } = getWeekRange(0)
    const deptRates = buildAllDeptRates([]).filter(dr => COIL_IDS.includes(dr.dept.id))
    const demand = weekDemandByDept(orders, deptRates, fmtISO(mon), fmtISO(sat))
    const capByDept = new Map<string, { reg: number; ot: number }>()
    for (const pool of getCapacityPools(wcConfig)) {
      for (const d of pool.depts) if (COIL_IDS.includes(d.id)) capByDept.set(d.id, pool.cap)
    }
    return COIL_LINES.map(l => {
      const d = demand.get(l.deptId) ?? 0
      const cap = capByDept.get(l.deptId) ?? { reg: 0, ot: 0 }
      const util = cap.reg > 0 ? d / cap.reg : 0
      return { ...l, demand: d, reg: cap.reg, ot: cap.ot, util }
    })
  }, [orders, wcConfig])

  const worst = lineKpis.reduce((a, b) => (b.util > (a?.util ?? -1) ? b : a), lineKpis[0])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🌀 แผนกพันคอยล์ — Coil Winding</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>3 สายการผลิต · ชั่วโมงจาก SAP routing</span>
        {worst && worst.util > 0.85 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
            background: worst.util > 1 ? 'rgba(243,139,168,.12)' : 'rgba(249,226,175,.12)',
            color: worst.util > 1 ? 'var(--red)' : 'var(--amber)' }}>
            {worst.util > 1 ? '🔴' : '🟠'} คอขวด: {worst.label} {Math.round(worst.util * 100)}%
          </span>
        )}
      </div>

      {/* Per-line capacity KPI strip (current week) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {lineKpis.map(k => {
          const col = k.util > 1 ? 'var(--red)' : k.util > 0.85 ? 'var(--amber)' : 'var(--green)'
          const pct = Math.round(k.util * 100)
          return (
            <button key={k.key} onClick={() => setView(k.key)}
              style={{
                flex: 1, minWidth: 150, textAlign: 'left', cursor: 'pointer',
                background: view === k.key ? `${k.color}14` : 'var(--bg2)',
                border: `1px solid ${view === k.key ? k.color : 'var(--bord)'}`,
                borderRadius: 10, padding: '10px 14px',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span>{k.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: k.color }}>{k.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: col, lineHeight: 1 }}>
                  {k.reg > 0 ? `${pct}%` : '—'}
                </span>
                <span style={{ fontSize: 9, color: 'var(--txt3)' }}>โหลดสัปดาห์นี้</span>
              </div>
              <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, margin: '5px 0 3px' }}>
                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: col, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 8, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                {Math.round(k.demand)}h / {Math.round(k.reg)}h{k.ot > 0 ? ` (+${Math.round(k.ot)} OT)` : ''}
              </div>
            </button>
          )
        })}
      </div>

      {/* Sub-view switcher */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--bord)', paddingBottom: 8 }}>
        {COIL_LINES.map(l => (
          <button key={l.key} onClick={() => setView(l.key)}
            style={{
              fontSize: 11, padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${view === l.key ? l.color : 'var(--bord)'}`,
              background: view === l.key ? `${l.color}1e` : 'var(--bg3)',
              color: view === l.key ? l.color : 'var(--txt3)',
              fontWeight: view === l.key ? 700 : 400,
            }}>
            {l.icon} {l.label}
          </button>
        ))}
        <button onClick={() => setView('machines')}
          style={{
            fontSize: 11, padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
            border: `1px solid ${view === 'machines' ? 'var(--blue)' : 'var(--bord)'}`,
            background: view === 'machines' ? 'rgba(137,180,250,.12)' : 'var(--bg3)',
            color: view === 'machines' ? 'var(--blue)' : 'var(--txt3)',
          }}>
          🔧 เครื่องจักร
        </button>
      </div>

      {/* Scheduler for the selected line, or the machine table */}
      {view === 'machines'
        ? <WindingMachines />
        : <DeptSchedulerPage config={(COIL_LINES.find(l => l.key === view) ?? COIL_LINES[0]).config} />
      }

      <div style={{ fontSize: 9, color: 'var(--txt3)' }}>
        หมายเหตุ: LV-Foil และ LV-Wire ใช้ออเดอร์ชุดเดียวกัน (ยังไม่มีข้อมูลแยกชนิด LV ต่อออเดอร์) —
        Factory Forecast ถ่วงน้ำหนักตามสัดส่วนจริง (~84% foil / 16% wire) เพื่อไม่นับซ้ำ
      </div>
    </div>
  )
}
