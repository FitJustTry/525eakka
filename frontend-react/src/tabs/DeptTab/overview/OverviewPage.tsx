/**
 * Command Center / Overview — the "morning glance" landing for the core line.
 *
 * Aggregates everything the other views compute into one screen:
 *   • KPI cards (active / due this week / overdue / rush)
 *   • Pipeline funnel — count + kVA at each workflow stage
 *   • This-week bottleneck — worst capacity pool (shared with Forecast)
 *   • Delivery-risk orders — the thing nothing else computes: orders whose
 *     deadline is close relative to how many pipeline stages they still must
 *     pass through.
 */

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../../context/AppContext'
import { api } from '../../../api'
import type { Order, RoutingCrRow } from '../../../types'
import { getWeekRange, fmtISO } from '../cutting/scheduling/utils'
import {
  WORKFLOW_SEQUENCE, WORKFLOW_LABELS,
} from '../shared/types'
import type { WorkflowStatus } from '../shared/types'
import {
  buildAllDeptRates, weekDemandByDept, getCapacityPools, stageIdx,
} from '../shared/deptRegistry'

/** Assumed minimum calendar lead time per remaining stage (queue + work). */
const LEAD_DAYS_PER_STAGE = 4

const STAGE_COLORS: Record<WorkflowStatus, string> = {
  CUTTING: 'var(--amber)', SHAKE: '#cba6f7', STACK: 'var(--blue)',
  CLAMP: '#fab387', NOLOAD: 'var(--green)', DONE: 'var(--txt3)',
}

const todayStr = () => new Date().toISOString().slice(0, 10)
function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86400000)
}

type Risk = 'overdue' | 'urgent' | 'ok'

interface RiskRow {
  order: Order
  stage: WorkflowStatus
  stagesRemaining: number
  daysLeft: number
  risk: Risk
}

function KpiCard({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${color}33`, borderRadius: 10, padding: '10px 16px', minWidth: 120, flex: 1 }}>
      <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function OverviewPage() {
  const { state } = useApp()
  const { orders, wcConfig } = state
  const [routingRows, setRoutingRows] = useState<RoutingCrRow[]>([])

  useEffect(() => {
    api.routingCr.list().then(r => setRoutingRows(r as RoutingCrRow[])).catch(() => {})
  }, [])

  const today = todayStr()
  const { mon, sat } = useMemo(() => getWeekRange(0), [])
  const monStr = fmtISO(mon), satStr = fmtISO(sat)

  // ── Pipeline funnel ──
  const funnel = useMemo(() => {
    const counts = new Map<WorkflowStatus, { count: number; kva: number; qty: number }>()
    WORKFLOW_SEQUENCE.forEach(s => counts.set(s, { count: 0, kva: 0, qty: 0 }))
    for (const o of orders) {
      const s = (o.workflow_status as WorkflowStatus) || 'CUTTING'
      const e = counts.get(s)!
      e.count++; e.qty += o.qty ?? 1; e.kva += (o.kva ?? 0) * (o.qty ?? 1)
    }
    return counts
  }, [orders])

  // ── KPIs ──
  const kpis = useMemo(() => {
    let active = 0, dueThisWeek = 0, overdue = 0, rush = 0
    for (const o of orders) {
      const done = o.workflow_status === 'DONE'
      if (!done) active++
      if (o.priority === 'rush' && !done) rush++
      if (o.deadline && o.deadline >= monStr && o.deadline <= satStr && !done) dueThisWeek++
      if (o.deadline && o.deadline < today && !done) overdue++
    }
    return { active, dueThisWeek, overdue, rush }
  }, [orders, monStr, satStr, today])

  // ── This-week bottleneck ──
  const bottleneck = useMemo(() => {
    const deptRates = buildAllDeptRates(routingRows)
    const demand = weekDemandByDept(orders, deptRates, monStr, satStr)
    const pools = getCapacityPools(wcConfig)
    let worst: { label: string; util: number; demand: number; reg: number; ot: number } | null = null
    for (const pool of pools) {
      const d = pool.depts.reduce((s, x) => s + (demand.get(x.id) ?? 0), 0)
      const totalCap = pool.cap.reg + pool.cap.ot
      if (totalCap <= 0) continue
      const util = d / totalCap
      if (!worst || util > worst.util) {
        worst = { label: pool.depts.map(x => x.label).join(' + '), util, demand: d, reg: pool.cap.reg, ot: pool.cap.ot }
      }
    }
    return worst
  }, [routingRows, orders, wcConfig, monStr, satStr])

  // ── Delivery-risk orders ──
  const riskRows = useMemo((): RiskRow[] => {
    const doneIdx = stageIdx('DONE')
    const rows: RiskRow[] = []
    for (const o of orders) {
      const stage = (o.workflow_status as WorkflowStatus) || 'CUTTING'
      if (stage === 'DONE') continue
      const stagesRemaining = doneIdx - stageIdx(stage)
      const daysLeft = o.deadline ? daysBetween(today, o.deadline) : 999
      let risk: Risk = 'ok'
      if (o.deadline && daysLeft < 0) risk = 'overdue'
      else if (o.deadline && daysLeft <= stagesRemaining * LEAD_DAYS_PER_STAGE) risk = 'urgent'
      rows.push({ order: o, stage, stagesRemaining, daysLeft, risk })
    }
    const rank = { overdue: 0, urgent: 1, ok: 2 }
    return rows.sort((a, b) => {
      if (rank[a.risk] !== rank[b.risk]) return rank[a.risk] - rank[b.risk]
      return a.daysLeft - b.daysLeft
    })
  }, [orders, today])

  const atRisk = riskRows.filter(r => r.risk !== 'ok')
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? riskRows : atRisk

  const funnelMax = Math.max(1, ...WORKFLOW_SEQUENCE.map(s => funnel.get(s)?.count ?? 0))

  const riskColor = (r: Risk) => r === 'overdue' ? 'var(--red)' : r === 'urgent' ? 'var(--amber)' : 'var(--green)'
  const riskLabel = (r: Risk) => r === 'overdue' ? '🔴 เกินกำหนด' : r === 'urgent' ? '🟠 เสี่ยง' : '🟢 ปกติ'

  const td: React.CSSProperties = { padding: '5px 9px', borderBottom: '0.5px solid var(--bord)', fontSize: 10 }
  const th: React.CSSProperties = { padding: '6px 9px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txt3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🏭 ภาพรวมสายการผลิตเหล็กแกน</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>สัปดาห์นี้ {monStr} – {satStr}</span>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <KpiCard label="งาน Active" value={kpis.active} color="var(--blue)" sub="ยังไม่เสร็จ" />
        <KpiCard label="ครบกำหนดสัปดาห์นี้" value={kpis.dueThisWeek} color="var(--amber)" sub={`${monStr.slice(5)} – ${satStr.slice(5)}`} />
        <KpiCard label="เกินกำหนด" value={kpis.overdue} color={kpis.overdue > 0 ? 'var(--red)' : 'var(--green)'} sub="deadline ผ่านแล้ว" />
        <KpiCard label="Rush" value={kpis.rush} color={kpis.rush > 0 ? 'var(--red)' : 'var(--txt3)'} sub="ลำดับเร่งด่วน" />
        {bottleneck && (
          <div style={{ background: 'var(--bg2)', border: `1px solid ${bottleneck.util > 1 ? 'var(--red)' : bottleneck.util > 0.85 ? 'var(--amber)' : 'var(--green)'}44`, borderRadius: 10, padding: '10px 16px', minWidth: 180, flex: 1.5 }}>
            <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>คอขวดสัปดาห์นี้</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: bottleneck.util > 1 ? 'var(--red)' : bottleneck.util > 0.85 ? 'var(--amber)' : 'var(--green)', lineHeight: 1 }}>
                {Math.round(bottleneck.util * 100)}%
              </span>
              <span style={{ fontSize: 11, color: 'var(--txt2)', fontWeight: 600 }}>{bottleneck.label}</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 3 }}>
              {Math.round(bottleneck.demand)}h / {Math.round(bottleneck.reg)}h ปกติ{bottleneck.ot > 0 ? ` (+${Math.round(bottleneck.ot)} OT)` : ''}
            </div>
          </div>
        )}
      </div>

      {/* Pipeline funnel */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', marginBottom: 10 }}>📊 Pipeline — งานในแต่ละขั้น</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
          {WORKFLOW_SEQUENCE.map((s, i) => {
            const e = funnel.get(s)!
            const col = STAGE_COLORS[s]
            return (
              <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 8, border: `1px solid ${col}33`, padding: '8px 10px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${(e.count / funnelMax) * 100}%`, background: `${col}14`, transition: 'width .2s' }} />
                  <div style={{ position: 'relative' }}>
                    <div style={{ fontSize: 9, color: col, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{WORKFLOW_LABELS[s]}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: e.count ? col : 'var(--txt3)' }}>{e.count}</div>
                    <div style={{ fontSize: 8, color: 'var(--txt3)' }}>{e.kva.toLocaleString()} kVA</div>
                  </div>
                </div>
                {i < WORKFLOW_SEQUENCE.length - 1 && <span style={{ color: 'var(--txt3)', fontSize: 11 }}>›</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Delivery-risk orders */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bord)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)' }}>⚠ ความเสี่ยงส่งมอบ</span>
          <span style={{ fontSize: 10, color: atRisk.length ? 'var(--amber)' : 'var(--green)', fontWeight: 700 }}>
            {atRisk.length ? `${atRisk.length} งานต้องจับตา` : 'ไม่มีงานเสี่ยง'}
          </span>
          <button onClick={() => setShowAll(v => !v)} style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--bord)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>
            {showAll ? 'เฉพาะที่เสี่ยง' : 'แสดงทั้งหมด'}
          </button>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg3)' }}>
              <tr>
                {['SAP SO', 'ลูกค้า', 'kVA × จำนวน', 'ขั้นปัจจุบัน', 'ขั้นที่เหลือ', 'Deadline', 'เหลือ (วัน)', 'ความเสี่ยง'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--txt3)', padding: 24 }}>🎉 ไม่มีงานที่เสี่ยงเกินกำหนด</td></tr>
              )}
              {shown.map(r => (
                <tr key={r.order.id} style={{ background: r.risk === 'overdue' ? 'rgba(243,139,168,.04)' : r.risk === 'urgent' ? 'rgba(249,226,175,.04)' : undefined }}>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>
                    {r.order.priority === 'rush' && <span style={{ marginRight: 4 }}>🔴</span>}
                    {r.order.sap_so || r.order.id.slice(-8)}
                  </td>
                  <td style={{ ...td, color: 'var(--txt2)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.order.customer || '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{r.order.kva}×{r.order.qty}</td>
                  <td style={td}>
                    <span style={{ fontSize: 9, padding: '1px 7px', borderRadius: 6, background: `${STAGE_COLORS[r.stage]}18`, color: STAGE_COLORS[r.stage], fontWeight: 700 }}>
                      {WORKFLOW_LABELS[r.stage]}
                    </span>
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', textAlign: 'center', color: 'var(--txt2)' }}>{r.stagesRemaining}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--txt3)' }}>{r.order.deadline || '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 700, color: riskColor(r.risk) }}>
                    {r.order.deadline ? (r.daysLeft < 0 ? `${r.daysLeft}` : r.daysLeft) : '—'}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 9, padding: '1px 7px', borderRadius: 6, background: `${riskColor(r.risk)}15`, color: riskColor(r.risk), fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {riskLabel(r.risk)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 9, color: 'var(--txt3)' }}>
        ความเสี่ยงประเมินจาก: deadline เทียบกับจำนวนขั้นที่เหลือ × ~{LEAD_DAYS_PER_STAGE} วัน/ขั้น · 🟠 = เวลาเหลือน้อยกว่าที่ควร · 🔴 = เกินกำหนดแล้ว
      </div>
    </div>
  )
}
