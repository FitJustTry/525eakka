import React, { useState } from 'react'
import type { SnapMeta, PlanStatus } from '../hooks/usePlanSnapshots'

interface Props {
  snapshots: SnapMeta[]
  setShowSnapshots: (v: boolean) => void
  viewSnapshot: (id: number) => void
  deleteSnapshot: (id: number) => void
  updateStatus: (id: number, status: PlanStatus) => Promise<SnapMeta>
  onCloseWeek: (snap: SnapMeta) => void
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

// Next-step actions per status
const TRANSITIONS: Partial<Record<PlanStatus, { status: PlanStatus; label: string; color: string }[]>> = {
  draft:         [{ status: 'approved',      label: '✅ อนุมัติแผน',     color: 'var(--blue)' }],
  approved:      [{ status: 'in_production', label: '▶ เริ่มผลิต',       color: 'var(--amber)' },
                  { status: 'draft',         label: '↩ คืน Draft',       color: 'var(--txt3)' }],
  in_production: [{ status: 'completed',     label: '🏁 ปิดสัปดาห์',     color: 'var(--green)' },
                  { status: 'approved',      label: '↩ คืน Approved',    color: 'var(--txt3)' }],
  completed:     [{ status: 'archived',      label: '📁 Archive',         color: 'var(--txt3)' }],
}

const CANCEL_ALLOWED: PlanStatus[] = ['draft', 'approved', 'in_production']

export default function SnapshotPanel({ snapshots, setShowSnapshots, viewSnapshot, deleteSnapshot, updateStatus, onCloseWeek }: Props) {
  const [transitioning, setTransitioning] = useState<number | null>(null)

  async function doTransition(id: number, status: PlanStatus, snap: SnapMeta) {
    if (status === 'completed') { onCloseWeek(snap); return }
    setTransitioning(id)
    try { await updateStatus(id, status) } catch (e) { alert(String(e)) }
    setTransitioning(null)
  }

  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bord)', background: 'var(--bg2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>📋 แผนที่บันทึกไว้</span>
        <button onClick={() => setShowSnapshots(false)} style={{ fontSize: 11, marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)' }}>✕ ปิด</button>
      </div>
      {snapshots.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>ยังไม่มีแผนที่บันทึก</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {snapshots.map(s => {
            const st = (s.status || 'draft') as PlanStatus
            const isLocked = st === 'completed' || st === 'archived' || st === 'cancelled'
            const busy = transitioning === s.id
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, border: `1px solid ${isLocked ? STATUS_COLOR[st] + '33' : 'var(--bord)'}`, fontSize: 11 }}>
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700 }}>{s.week_start} – {s.week_end}</span>
                  <span style={{ color: 'var(--txt2)' }}>{s.label}</span>
                  {/* Status badge */}
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 700, background: STATUS_BG[st], color: STATUS_COLOR[st], border: `1px solid ${STATUS_COLOR[st]}33` }}>
                    {STATUS_LABEL[st]}
                  </span>
                  {isLocked && <span style={{ fontSize: 10, color: STATUS_COLOR[st] }}>🔒</span>}
                  <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 'auto' }}>{new Date(s.saved_at).toLocaleString('th-TH')}</span>
                  <button onClick={() => viewSnapshot(s.id)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid rgba(137,180,250,.3)', background: 'rgba(137,180,250,.1)', color: 'var(--blue)', cursor: 'pointer' }}>ดู</button>
                  {!isLocked && (
                    <button onClick={() => deleteSnapshot(s.id)} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 4px' }}>🗑</button>
                  )}
                </div>
                {/* Transition buttons */}
                {!isLocked && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 2 }}>
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
                  <div style={{ display: 'flex', gap: 12, fontSize: 9, color: 'var(--txt3)', paddingLeft: 2 }}>
                    {s.confirmed_at && <span>✅ อนุมัติ {new Date(s.confirmed_at).toLocaleDateString('th-TH')}</span>}
                    {s.started_at  && <span>▶ เริ่มผลิต {new Date(s.started_at).toLocaleDateString('th-TH')}</span>}
                    {s.completed_at && <span>🏁 ปิด {new Date(s.completed_at).toLocaleDateString('th-TH')}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
