/**
 * Factory Forecast — cross-department capacity heatmap.
 *
 * Answers the manager's #1 question: "Which department will be the bottleneck,
 * and in which week?"
 *
 * Demand model
 *   For each upcoming week and each department, demand hours =
 *     Σ over orders planned that week (and not yet past this stage) of
 *       qty × hoursPerUnit(kVA)   ← from shared routing data
 *   An order only counts toward a department it still has to pass through, so
 *   advancing orders via "Close Week" shifts the forecast downstream.
 *
 * Capacity model
 *   Departments are grouped into workcenter capacity pools (EE3105 is shared by
 *   Shake + Stack).  Weekly capacity for a pool =
 *     Σ workers × (hrs×5 + sat_hrs) × eff/100        ← regular
 *   with an OT band of workers × (ot×5 + sat_ot) × eff/100 on top.
 *
 *   green  = fits in regular hours
 *   amber  = needs OT
 *   red    = over capacity even with OT
 */

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../../context/AppContext'
import { api } from '../../../api'
import type { RoutingCrRow } from '../../../types'
import { getWeekRange, fmtISO, fmtD } from '../cutting/scheduling/utils'
import {
  DEPT_REGISTRY, buildAllDeptRates, weekDemandByDept, getCapacityPools,
} from '../shared/deptRegistry'

const HORIZON_OPTIONS = [4, 6, 8, 12]

interface WeekCol { offset: number; mon: Date; sat: Date; monStr: string; satStr: string; label: string }

export default function FactoryForecastPage() {
  const { state } = useApp()
  const { orders, wcConfig } = state

  const [routingRows, setRoutingRows] = useState<RoutingCrRow[]>([])
  const [horizon, setHorizon] = useState(6)
  const [startOffset, setStartOffset] = useState(0)

  useEffect(() => {
    api.routingCr.list()
      .then(rows => setRoutingRows(rows as RoutingCrRow[]))
      .catch(() => {})
  }, [])

  const weeks = useMemo((): WeekCol[] => {
    return Array.from({ length: horizon }, (_, i) => {
      const off = startOffset + i
      const { mon, sat } = getWeekRange(off)
      return { offset: off, mon, sat, monStr: fmtISO(mon), satStr: fmtISO(sat), label: `${fmtD(mon)}–${fmtD(sat)}` }
    })
  }, [horizon, startOffset])

  const deptRates = useMemo(() => buildAllDeptRates(routingRows), [routingRows])

  // demand[deptId][weekIndex] = hours
  const demand = useMemo(() => {
    const map = new Map<string, number[]>()
    DEPT_REGISTRY.forEach(d => map.set(d.id, weeks.map(() => 0)))
    weeks.forEach((w, wi) => {
      const wk = weekDemandByDept(orders, deptRates, w.monStr, w.satStr)
      wk.forEach((hrs, deptId) => { map.get(deptId)![wi] = hrs })
    })
    return map
  }, [deptRates, weeks, orders])

  // Capacity pools (shared helper) + per-week demand rollup
  const pools = useMemo(() => {
    return getCapacityPools(wcConfig).map(pool => ({
      ...pool,
      demandWeeks: weeks.map((_, wi) =>
        pool.depts.reduce((s, d) => s + (demand.get(d.id)?.[wi] ?? 0), 0)
      ),
    }))
  }, [demand, weeks, wcConfig])

  // Worst bottleneck across the horizon
  const worst = useMemo(() => {
    let best: { poolKey: string; label: string; wi: number; util: number } | null = null
    for (const pool of pools) {
      const totalCap = pool.cap.reg + pool.cap.ot
      if (totalCap <= 0) continue
      pool.demandWeeks.forEach((d, wi) => {
        const util = d / totalCap
        if (!best || util > best.util) {
          best = { poolKey: pool.key, label: pool.depts.map(x => x.label).join(' + '), wi, util }
        }
      })
    }
    return best as { poolKey: string; label: string; wi: number; util: number } | null
  }, [pools])

  const cellColor = (demandH: number, regCap: number, otCap: number) => {
    if (regCap <= 0) return { bg: 'var(--bg3)', col: 'var(--txt3)', tag: '' }
    if (demandH <= regCap) return { bg: 'rgba(166,227,161,.10)', col: 'var(--green)', tag: '' }
    if (demandH <= regCap + otCap) return { bg: 'rgba(249,226,175,.12)', col: 'var(--amber)', tag: 'OT' }
    return { bg: 'rgba(243,139,168,.14)', col: 'var(--red)', tag: '⚠' }
  }

  const thS: React.CSSProperties = {
    padding: '7px 10px', textAlign: 'center', fontSize: 10, fontWeight: 600,
    color: 'var(--txt3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap',
  }
  const labCol: React.CSSProperties = { padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '0.5px solid var(--bord)' }

  const hasRouting = routingRows.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>📈 Factory Forecast</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>โหลดกำลังการผลิตล่วงหน้า · เหล็กแกน</span>
        {!hasRouting && (
          <span style={{ fontSize: 10, color: 'var(--amber)', background: 'rgba(249,226,175,.12)', padding: '1px 6px', borderRadius: 4 }}>
            ⚠ ไม่มี routing — ใช้ค่า fallback hrs/unit
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setStartOffset(v => v - 1)} style={btnSm}>‹</button>
          {startOffset !== 0 && <button onClick={() => setStartOffset(0)} style={{ ...btnSm, color: 'var(--blue)' }}>วันนี้</button>}
          <button onClick={() => setStartOffset(v => v + 1)} style={btnSm}>›</button>
          <div style={{ display: 'flex', gap: 3, marginLeft: 6 }}>
            {HORIZON_OPTIONS.map(h => (
              <button key={h} onClick={() => setHorizon(h)}
                style={{
                  ...btnSm,
                  border: `1px solid ${horizon === h ? 'var(--blue)' : 'var(--bord)'}`,
                  color: horizon === h ? 'var(--blue)' : 'var(--txt3)',
                  background: horizon === h ? 'rgba(137,180,250,.12)' : 'var(--bg3)',
                }}>
                {h}w
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottleneck callout */}
      {worst && worst.util > 0 && (
        <div style={{
          fontSize: 11, padding: '8px 14px', borderRadius: 8,
          background: worst.util > 1 ? 'rgba(243,139,168,.10)' : worst.util > 0.85 ? 'rgba(249,226,175,.10)' : 'rgba(166,227,161,.10)',
          border: `1px solid ${worst.util > 1 ? 'var(--red)' : worst.util > 0.85 ? 'var(--amber)' : 'var(--green)'}44`,
          color: worst.util > 1 ? 'var(--red)' : worst.util > 0.85 ? 'var(--amber)' : 'var(--green)',
        }}>
          {worst.util > 1 ? '🔴' : worst.util > 0.85 ? '🟠' : '🟢'}{' '}
          <strong>คอขวด:</strong> {worst.label} — สัปดาห์ {weeks[worst.wi]?.label} ที่{' '}
          <strong>{Math.round(worst.util * 100)}%</strong> ของกำลังการผลิตปกติ
          {worst.util > 1 && ' (ต้องใช้ OT หรือเลื่อนงาน)'}
        </div>
      )}

      {/* ── Capacity pool load (the actionable view) ─────────────────────── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bord)', fontSize: 11, fontWeight: 700, color: 'var(--txt2)' }}>
          โหลด vs กำลังการผลิต (% ของชั่วโมงปกติ)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                <th style={{ ...thS, textAlign: 'left' }}>สถานี / Workcenter</th>
                <th style={thS}>กำลังผลิต/สัปดาห์</th>
                {weeks.map(w => (
                  <th key={w.offset} style={thS}>
                    {w.offset === 0 ? <span style={{ color: 'var(--blue)' }}>● </span> : ''}{w.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pools.map(pool => (
                <tr key={pool.key}>
                  <td style={{ ...labCol, fontWeight: 600 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {pool.depts.map(d => <span key={d.id} title={d.label}>{d.icon}</span>)}
                      <span style={{ color: 'var(--txt2)' }}>{pool.depts.map(d => d.label).join(' + ')}</span>
                    </div>
                    <div style={{ fontSize: 8, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{pool.wcs.join(' + ')}</div>
                  </td>
                  <td style={{ ...labCol, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>
                    {Math.round(pool.cap.reg)}h
                    {pool.cap.ot > 0 && <span style={{ color: 'var(--amber)' }}> +{Math.round(pool.cap.ot)}OT</span>}
                  </td>
                  {pool.demandWeeks.map((d, wi) => {
                    const { bg, col, tag } = cellColor(d, pool.cap.reg, pool.cap.ot)
                    const pct = pool.cap.reg > 0 ? Math.round(d / pool.cap.reg * 100) : 0
                    return (
                      <td key={wi} style={{ padding: '6px 8px', textAlign: 'center', background: bg, borderBottom: '0.5px solid var(--bord)', borderLeft: '0.5px solid var(--bord)' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: col, fontSize: 11 }}>
                          {d > 0 ? `${pct}%` : '—'}
                        </div>
                        {d > 0 && (
                          <div style={{ fontSize: 8, color: 'var(--txt3)' }}>
                            {Math.round(d)}h {tag && <span style={{ color: col }}>{tag}</span>}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Department demand (hours) ────────────────────────────────────── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bord)', fontSize: 11, fontWeight: 700, color: 'var(--txt2)' }}>
          ความต้องการรายแผนก (ชั่วโมงงาน) · นับเฉพาะงานที่ยังไม่ผ่านขั้นนั้น
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                <th style={{ ...thS, textAlign: 'left' }}>แผนก</th>
                {weeks.map(w => <th key={w.offset} style={thS}>{w.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {DEPT_REGISTRY.map(d => {
                const row = demand.get(d.id) ?? []
                const max = Math.max(1, ...row)
                return (
                  <tr key={d.id}>
                    <td style={{ ...labCol, fontWeight: 600 }}>
                      <span style={{ marginRight: 5 }}>{d.icon}</span>
                      <span style={{ color: d.color }}>{d.label}</span>
                    </td>
                    {row.map((h, wi) => (
                      <td key={wi} style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '0.5px solid var(--bord)', borderLeft: '0.5px solid var(--bord)' }}>
                        <div style={{ fontFamily: 'var(--mono)', color: h > 0 ? 'var(--txt2)' : 'var(--txt3)' }}>
                          {h > 0 ? Math.round(h) : '—'}
                        </div>
                        {h > 0 && (
                          <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 2, marginTop: 2 }}>
                            <div style={{ width: `${Math.min(100, h / max * 100)}%`, height: '100%', background: d.color, borderRadius: 2 }} />
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 9, color: 'var(--txt3)', lineHeight: 1.6 }}>
        🟢 อยู่ในชั่วโมงปกติ · 🟠 ต้องใช้ OT · 🔴 เกินกำลังแม้รวม OT &nbsp;|&nbsp;
        EE3105 ใช้ร่วมกันระหว่างเขย่า + เรียงเหล็ก จึงรวมโหลดทั้งสองแผนก
      </div>
    </div>
  )
}

const btnSm: React.CSSProperties = {
  fontSize: 10, padding: '4px 10px', borderRadius: 6,
  border: '1px solid var(--bord)', background: 'var(--bg3)',
  cursor: 'pointer', color: 'var(--txt2)',
}
