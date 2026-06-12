import React, { useState } from 'react'
import type { Order, CuttingMachine, MachineDowntime } from '../../../../types'
import type { SnapMeta, PlanStatus } from '../hooks/usePlanSnapshots'
import SnapshotProgress from './SnapshotProgress'
import PerformanceDashboard from './PerformanceDashboard'

interface Props {
  snapshots: SnapMeta[]
  setShowSnapshots: (v: boolean) => void
  viewSnapshot: (id: number) => void
  deleteSnapshot: (id: number) => void
  updateStatus: (id: number, status: PlanStatus) => Promise<SnapMeta>
  onCloseWeek: (snap: SnapMeta) => void
  orders: Order[]
  updateDoneQty: (id: string, n: number) => void
  downtimes?: MachineDowntime[]
  machines?: CuttingMachine[]
}

const STATUS_LABEL: Record<PlanStatus, string> = {
  draft:         '📝 Draft',
  approved:      '✅ Approved',
  in_production: '▶ In Production',
  completed:     '🏁 Completed',
  cancelled:     '❌ Cancelled',
  archived:      '📁 Archived',
}

const STATUS_COLOR: Record<PlanStatus, string> = {
  draft:         'var(--txt3)',
  approved:      'var(--blue)',
  in_production: 'var(--amber)',
  completed:     'var(--green)',
  cancelled:     'var(--red)',
  archived:      'var(--txt3)',
}

const STATUS_BG: Record<PlanStatus, string> = {
  draft:         'rgba(166,173,200,.12)',
  approved:      'rgba(137,180,250,.12)',
  in_production: 'rgba(249,226,175,.12)',
  completed:     'rgba(166,227,161,.12)',
  cancelled:     'rgba(224,90,78,.12)',
  archived:      'rgba(166,173,200,.08)',
}

const TRANSITIONS: Partial<Record<PlanStatus, { status: PlanStatus; label: string; color: string }[]>> = {
  draft:         [{ status: 'approved',      label: '✅ อนุมัติแผน',     color: 'var(--blue)' }],
  approved:      [{ status: 'in_production', label: '▶ เริ่มผลิต',       color: 'var(--amber)' },
                  { status: 'draft',         label: '↩ คืน Draft',       color: 'var(--txt3)' }],
  in_production: [{ status: 'completed',     label: '🏁 ปิดสัปดาห์',     color: 'var(--green)' },
                  { status: 'approved',      label: '↩ คืน Approved',    color: 'var(--txt3)' }],
  completed:     [{ status: 'archived',      label: '📁 Archive',         color: 'var(--txt3)' }],
}

const CANCEL_ALLOWED: PlanStatus[] = ['draft', 'approved', 'in_production']

export default function SnapshotPanel({ snapshots, setShowSnapshots, viewSnapshot, deleteSnapshot, updateStatus, onCloseWeek, orders, updateDoneQty, downtimes = [], machines = [] }: Props) {
  const [transitioning, setTransitioning] = useState<number | null>(null)
  const [expandedProgress, setExpandedProgress] = useState<Set<number>>(new Set())
  const [showDashboard, setShowDashboard] = useState(false)

  async function doTransition(id: number, status: PlanStatus, snap: SnapMeta) {
    if (status === 'completed') { onCloseWeek(snap); return }
    setTransitioning(id)
    try { await updateStatus(id, status) } catch (e) { alert(String(e)) }
    setTransitioning(null)
  }

  function toggleProgress(id: number) {
    setExpandedProgress(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const hasCompletedWithSummary = snapshots.some(s => s.status === 'completed' && s.result_summary)

  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bord)', background: 'var(--bg2)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>📋 แผนที่บันทึกไว้</span>
        {hasCompletedWithSummary && (
          <button onClick={() => setShowDashboard(true)}
            style={{ fontSize: 10, padding: '2px 10px', borderRadius: 6, border: '1px solid rgba(137,180,250,.3)', background: 'rgba(137,180,250,.1)', color: 'var(--blue)', cursor: 'pointer', fontWeight: 700 }}>
            📊 ประวัติ
          </button>
        )}
        <button onClick={() => setShowSnapshots(false)} style={{ fontSize: 11, marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)' }}>✕ ปิด</button>
      </div>

      {/* List */}
      {snapshots.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>ยังไม่มีแผนที่บันทึก</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {snapshots.map(s => {
            const st = (s.status || 'draft') as PlanStatus
            const isLocked = st === 'completed' || st === 'archived' || st === 'cancelled'
            const busy = transitioning === s.id
            const progressOpen = expandedProgress.has(s.id)
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg3)', borderRadius: 6, border: `1px solid ${isLocked ? STATUS_COLOR[st] + '33' : 'var(--bord)'}`, fontSize: 11, overflow: 'hidden' }}>
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 10px' }}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700 }}>{s.week_start} – {s.week_end}</span>
                  <span style={{ color: 'var(--txt2)' }}>{s.label}</span>
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 700, background: STATUS_BG[st], color: STATUS_COLOR[st], border: `1px solid ${STATUS_COLOR[st]}33` }}>
                    {STATUS_LABEL[st]}
                  </span>
                  {isLocked && <span style={{ fontSize: 10, color: STATUS_COLOR[st] }}>🔒</span>}
                  {/* Completion chip for completed snaps */}
                  {st === 'completed' && s.result_summary && (
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'rgba(166,227,161,.12)', color: 'var(--green)', fontWeight: 700, border: '1px solid rgba(166,227,161,.3)' }}>
                      {s.result_summary.completion_rate}%
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 'auto' }}>{new Date(s.saved_at).toLocaleString('th-TH')}</span>
                  {/* Progress toggle for in_production */}
                  {st === 'in_production' && (
                    <button onClick={() => toggleProgress(s.id)}
                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: `1px solid ${progressOpen ? 'rgba(249,226,175,.5)' : 'rgba(249,226,175,.2)'}`, background: progressOpen ? 'rgba(249,226,175,.2)' : 'rgba(249,226,175,.08)', color: 'var(--amber)', cursor: 'pointer' }}>
                      📈 ความคืบหน้า
                    </button>
                  )}
                  <button onClick={() => viewSnapshot(s.id)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid rgba(137,180,250,.3)', background: 'rgba(137,180,250,.1)', color: 'var(--blue)', cursor: 'pointer' }}>ดู</button>
                  <button onClick={() => deleteSnapshot(s.id)} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 4px' }}>🗑</button>
                </div>

                {/* Transition buttons */}
                {!isLocked && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 10, paddingRight: 10, paddingBottom: 6 }}>
                    {(TRANSITIONS[st] ?? []).map(t => (
                      <button key={t.status} disabled={busy} onClick={() => doTransition(s.id, t.status, s)}
                        style={{ fontSize: 10, padding: '2px 10px', borderRadius: 6, border: `1px solid ${t.color}44`, background: `${t.color}18`, color: t.color, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
                        {busy ? '...' : t.label}
                      </button>
                    ))}
                    {CANCEL_ALLOWED.includes(st) && (
                      <button disabled={busy} onClick={() => doTransition(s.id, 'cancelled', s)}
                        style={{ fontSize: 10, padding: '2px 10px', borderRadius: 6, border: '1px solid rgba(224,90,78,.3)', background: 'rgba(224,90,78,.08)', color: 'var(--red)', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                        ❌ ยกเลิก
                      </button>
                    )}
                  </div>
                )}

                {/* Timestamps */}
                {(s.confirmed_at || s.started_at || s.completed_at) && (
                  <div style={{ display: 'flex', gap: 12, fontSize: 9, color: 'var(--txt3)', padding: '0 10px 6px 10px' }}>
                    {s.confirmed_at && <span>✅ อนุมัติ {new Date(s.confirmed_at).toLocaleDateString('th-TH')}</span>}
                    {s.started_at  && <span>▶ เริ่มผลิต {new Date(s.started_at).toLocaleDateString('th-TH')}</span>}
                    {s.completed_at && <span>🏁 ปิด {new Date(s.completed_at).toLocaleDateString('th-TH')}</span>}
                  </div>
                )}

                {/* B: Inline progress for in_production */}
                {st === 'in_production' && progressOpen && (
                  <SnapshotProgress snapId={s.id} orders={orders} updateDoneQty={updateDoneQty} />
                )}

                {/* Completed result summary mini-chips */}
                {st === 'completed' && s.result_summary && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 10px 8px', fontSize: 9, color: 'var(--txt3)' }}>
                    <span>✅ {s.result_summary.completed_count} เสร็จ</span>
                    {s.result_summary.carry_count > 0 && <span>⏭ {s.result_summary.carry_count} ค้าง</span>}
                    {s.result_summary.best_machine && <span>🏆 {s.result_summary.best_machine}</span>}
                    {s.result_summary.bottleneck_machine && <span>⚠️ {s.result_summary.bottleneck_machine}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* A+C: Performance Dashboard modal */}
      {showDashboard && (
        <PerformanceDashboard snapshots={snapshots} downtimes={downtimes} machines={machines} onClose={() => setShowDashboard(false)} />
      )}
    </div>
  )
}
