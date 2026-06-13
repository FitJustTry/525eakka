/**
 * Factory Capacity Risk — decision-support dashboard (Phase 6).
 *
 * All computation comes from the pure engines (forecast/risk/recommendation/
 * simulation); this component only renders. Covers:
 *   6A risk heatmap · 6B recommendations · 6C bottleneck · 6D horizon · 6E twin.
 */

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../../context/AppContext'
import { api } from '../../../api'
import type { RoutingCrRow } from '../../../types'
import { makeHorizonWeeks, buildDeptRates, computeHorizon } from '../shared/engines/forecastEngine'
import { riskLevel, RISK_META, summarize, bottleneckForWeek, carryRiskOrders } from '../shared/engines/riskEngine'
import { recommendations } from '../shared/engines/recommendationEngine'
import { runScenarios } from '../shared/engines/simulationEngine'

const HORIZONS = [4, 8]
const pct = (u: number) => `${Math.round(u * 100)}%`

export default function CapacityRiskPage() {
  const { state } = useApp()
  const { orders, wcConfig } = state
  const [routingRows, setRoutingRows] = useState<RoutingCrRow[]>([])
  const [horizon, setHorizon] = useState(8)
  const [startOffset, setStartOffset] = useState(0)

  useEffect(() => {
    api.routingCr.list().then(r => setRoutingRows(r as RoutingCrRow[])).catch(() => {})
  }, [])

  const weeks = useMemo(() => makeHorizonWeeks(startOffset, horizon), [startOffset, horizon])
  const deptRates = useMemo(() => buildDeptRates(routingRows), [routingRows])
  const base = useMemo(() => computeHorizon(orders, deptRates, wcConfig, weeks), [orders, deptRates, wcConfig, weeks])

  const summary = useMemo(() => summarize(base), [base])
  const recs = useMemo(() => recommendations(base), [base])
  const scenarios = useMemo(() => runScenarios(base, orders, deptRates, weeks), [base, orders, deptRates, weeks])
  const carryNow = useMemo(() => carryRiskOrders(orders, deptRates, base, weeks, 'reg').size, [orders, deptRates, base, weeks])
  const weekBottlenecks = useMemo(() => weeks.map((_, wi) => bottleneckForWeek(base, wi)), [base, weeks])

  const scenCurrent = scenarios.find(s => s.scenario.id === 'current')
  const scenOt = scenarios.find(s => s.scenario.id === 'ot')
  const scenOtShift = scenarios.find(s => s.scenario.id === 'ot_shift')

  const thS: React.CSSProperties = { padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--txt3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>⚠ Factory Capacity Risk</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>“ถ้าไม่ทำอะไร เดือนหน้าจะเกิดอะไร?”</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setStartOffset(v => v - 1)} style={btn}>‹</button>
          {startOffset !== 0 && <button onClick={() => setStartOffset(0)} style={{ ...btn, color: 'var(--blue)' }}>วันนี้</button>}
          <button onClick={() => setStartOffset(v => v + 1)} style={btn}>›</button>
          <div style={{ display: 'flex', gap: 3, marginLeft: 6 }}>
            {HORIZONS.map(h => (
              <button key={h} onClick={() => setHorizon(h)}
                style={{ ...btn, border: `1px solid ${horizon === h ? 'var(--blue)' : 'var(--bord)'}`, color: horizon === h ? 'var(--blue)' : 'var(--txt3)', background: horizon === h ? 'rgba(137,180,250,.12)' : 'var(--bg3)' }}>
                {h} สัปดาห์
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Kpi label="สัปดาห์เกินกำลัง" value={summary.redWeeks} color={summary.redWeeks ? 'var(--red)' : 'var(--green)'} sub="util > 110%" />
        <Kpi label="วิกฤต" value={summary.criticalWeeks} color={summary.criticalWeeks ? '#e64553' : 'var(--green)'} sub="util > 130%" />
        <Kpi label="ชม. ที่เกินกำลังรวม" value={`${Math.round(summary.totalOverloadHrs)}h`} color="var(--amber)" sub={`${horizon} สัปดาห์`} />
        <Kpi label="งานเสี่ยงเลื่อน" value={carryNow} color={carryNow ? 'var(--red)' : 'var(--green)'} sub="ถ้าไม่ทำอะไร" />
        {summary.bottleneck && (
          <div style={{ flex: 1.4, minWidth: 190, background: 'var(--bg2)', border: `1px solid ${RISK_META[summary.bottleneck.level].color}44`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>คอขวดสูงสุด</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: RISK_META[summary.bottleneck.level].color, lineHeight: 1 }}>{pct(summary.bottleneck.util)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)' }}>{summary.bottleneck.icon} {summary.bottleneck.label}</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 3 }}>สัปดาห์ {weeks[summary.bottleneck.weekIndex]?.label} · เกิน {Math.round(summary.bottleneck.overloadHrs)}h</div>
          </div>
        )}
      </div>

      {/* 6A — Risk heatmap (pools × weeks) */}
      <Panel title="ความเสี่ยงกำลังการผลิต — รายสาย × สัปดาห์ (util % ของชั่วโมงปกติ)">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                <th style={{ ...thS, textAlign: 'left' }}>สาย / Workcenter</th>
                <th style={thS}>กำลังผลิต/สัปดาห์</th>
                {weeks.map((w, wi) => (
                  <th key={w.offset} style={thS}>
                    {w.offset === 0 ? <span style={{ color: 'var(--blue)' }}>● </span> : ''}{w.label}
                    {weekBottlenecks[wi] && weekBottlenecks[wi]!.util > 1.10 && (
                      <div style={{ fontSize: 8, color: 'var(--red)' }}>⬇ {weekBottlenecks[wi]!.icon}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {base.map(pool => (
                <tr key={pool.key}>
                  <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--bord)', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--txt2)' }}>{pool.icon} {pool.label}</span>
                    <div style={{ fontSize: 8, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{pool.wcs.join(' + ')}</div>
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--bord)', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>
                    {Math.round(pool.cap.reg)}h{pool.cap.ot > 0 && <span style={{ color: 'var(--amber)' }}> +{Math.round(pool.cap.ot)}</span>}
                  </td>
                  {pool.weeks.map((w, wi) => {
                    const lvl = riskLevel(w.util)
                    const meta = RISK_META[lvl]
                    return (
                      <td key={wi} style={{ padding: '6px 8px', textAlign: 'center', background: w.regCap > 0 ? meta.bg : 'var(--bg3)', borderBottom: '0.5px solid var(--bord)', borderLeft: '0.5px solid var(--bord)' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: w.regCap > 0 ? meta.color : 'var(--txt3)', fontSize: 11 }}>
                          {w.regCap > 0 && w.demand > 0 ? pct(w.util) : '—'}
                        </div>
                        {w.demand > 0 && w.regCap > 0 && (
                          <div style={{ fontSize: 8, color: 'var(--txt3)' }}>
                            {Math.round(w.demand)}h {lvl !== 'green' && <span>{meta.dot}</span>}
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
        <Legend />
      </Panel>

      {/* 6B — Recommendations */}
      <Panel title={`คำแนะนำอัตโนมัติ — ${recs.length} สายต้องดำเนินการ`}>
        {recs.length === 0 ? (
          <div style={{ padding: '4px 2px', fontSize: 11, color: 'var(--green)' }}>🟢 ทุกสายอยู่ในกำลังการผลิต — ไม่ต้องดำเนินการ</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recs.map(r => (
              <div key={r.poolKey} style={{ background: 'var(--bg)', border: `1px solid ${RISK_META[r.level].color}33`, borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: RISK_META[r.level].color, marginBottom: 5 }}>
                  {RISK_META[r.level].dot} {r.icon} {r.label} — เกินกำลัง +{Math.round(r.overloadHrs)}h (สัปดาห์ {weeks[r.peakWeekIndex]?.label}, {pct(r.peakUtil)})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {r.actions.map((a, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--bord)', color: 'var(--txt2)' }}>
                      ✓ {a.text}
                      {a.projectedUtil != null && (
                        <span style={{ color: a.projectedUtil <= 1.0 ? 'var(--green)' : 'var(--amber)', fontWeight: 700, marginLeft: 5 }}>→ {pct(a.projectedUtil)}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {/* Global improvement headline */}
            {scenCurrent && scenOt && scenOtShift && (
              <div style={{ fontSize: 11, color: 'var(--txt2)', background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px' }}>
                งานเสี่ยงเลื่อนทั้งโรงงาน:{' '}
                <strong style={{ color: 'var(--red)' }}>{scenCurrent.carryRiskCount}</strong> (ปัจจุบัน){' → '}
                <strong style={{ color: 'var(--amber)' }}>{scenOt.carryRiskCount}</strong> (เปิด OT){' → '}
                <strong style={{ color: 'var(--green)' }}>{scenOtShift.carryRiskCount}</strong> (OT + กะ)
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* 6E — Digital twin scenario comparison */}
      <Panel title="Digital Twin — เปรียบเทียบ Scenario">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                <th style={{ ...thS, textAlign: 'left' }}>Scenario</th>
                <th style={thS}>Peak util</th>
                <th style={thS}>สัปดาห์เกิน</th>
                <th style={thS}>วิกฤต</th>
                <th style={thS}>ชม.เกินรวม</th>
                <th style={thS}>งานเสี่ยงเลื่อน</th>
                <th style={thS}>+กำลังผลิต</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s, i) => {
                const isBase = s.scenario.id === 'current'
                const baseCarry = scenCurrent?.carryRiskCount ?? 0
                const improved = !isBase && s.carryRiskCount < baseCarry
                return (
                  <tr key={s.scenario.id} style={{ background: i % 2 ? 'var(--bg)' : 'transparent' }}>
                    <td style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--bord)', fontWeight: isBase ? 700 : 400, color: isBase ? 'var(--txt2)' : 'var(--txt)' }}>{s.scenario.label}</td>
                    <td style={cell(riskLevel(s.peakUtil))}>{pct(s.peakUtil)}</td>
                    <td style={{ ...num, color: s.redWeeks ? 'var(--red)' : 'var(--green)' }}>{s.redWeeks}</td>
                    <td style={{ ...num, color: s.criticalWeeks ? '#e64553' : 'var(--green)' }}>{s.criticalWeeks}</td>
                    <td style={num}>{Math.round(s.totalOverloadHrs)}h</td>
                    <td style={{ ...num, color: improved ? 'var(--green)' : isBase ? 'var(--red)' : 'var(--txt2)', fontWeight: 700 }}>
                      {s.carryRiskCount}{improved && <span style={{ fontSize: 8 }}> ▼{baseCarry - s.carryRiskCount}</span>}
                    </td>
                    <td style={{ ...num, color: 'var(--txt3)' }}>{s.addedCapHrs > 0 ? `+${Math.round(s.addedCapHrs)}h` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 6 }}>
          กะกลางคืน ≈ ทีมขนาดเท่ากันทำงานกลางคืน N วัน (ประมาณการ) · +กำลังผลิต% = คน/เครื่องชั่วคราว ·
          “งานเสี่ยงเลื่อน” = ออเดอร์ที่เกินกำลังในสัปดาห์ที่หนาแน่น (เรียงตามลำดับความสำคัญ)
        </div>
      </Panel>
    </div>
  )
}

// ── small presentational helpers ──────────────────────────────────────────────
const btn: React.CSSProperties = { fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--bord)', background: 'var(--bg3)', cursor: 'pointer', color: 'var(--txt2)' }
const num: React.CSSProperties = { padding: '6px 8px', borderBottom: '0.5px solid var(--bord)', textAlign: 'center', fontFamily: 'var(--mono)' }
function cell(level: ReturnType<typeof riskLevel>): React.CSSProperties {
  return { ...num, color: RISK_META[level].color, fontWeight: 700, background: RISK_META[level].bg }
}

function Kpi({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${color}33`, borderRadius: 10, padding: '10px 16px', minWidth: 120, flex: 1 }}>
      <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bord)', fontSize: 11, fontWeight: 700, color: 'var(--txt2)' }}>{title}</div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  )
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 9, color: 'var(--txt3)', flexWrap: 'wrap' }}>
      {(['green', 'yellow', 'red', 'critical'] as const).map(l => (
        <span key={l}>{RISK_META[l].dot} {RISK_META[l].label} ({l === 'green' ? '<90%' : l === 'yellow' ? '90–110%' : l === 'red' ? '110–130%' : '>130%'})</span>
      ))}
    </div>
  )
}
