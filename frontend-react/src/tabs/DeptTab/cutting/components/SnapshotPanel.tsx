import React from 'react'
import type { SnapMeta } from '../hooks/usePlanSnapshots'

interface Props {
  snapshots: SnapMeta[]
  setShowSnapshots: (v: boolean) => void
  viewSnapshot: (id: number) => void
  deleteSnapshot: (id: number) => void
}

export default function SnapshotPanel({ snapshots, setShowSnapshots, viewSnapshot, deleteSnapshot }: Props) {
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
          {snapshots.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--bord)', fontSize: 11 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700 }}>{s.week_start} – {s.week_end}</span>
              <span style={{ color: 'var(--txt2)' }}>{s.label}</span>
              <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 'auto' }}>{new Date(s.saved_at).toLocaleString('th-TH')}</span>
              <button onClick={() => viewSnapshot(s.id)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid rgba(137,180,250,.3)', background: 'rgba(137,180,250,.1)', color: 'var(--blue)', cursor: 'pointer' }}>ดู</button>
              <button onClick={() => deleteSnapshot(s.id)} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 4px' }}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
