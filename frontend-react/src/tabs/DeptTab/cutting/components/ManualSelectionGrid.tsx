import React from 'react'
import type { CuttingMachine } from '../../../types'
import { DAY_SHORT } from '../scheduling/constants'
import { fmtISO } from '../scheduling/utils'

interface Props {
  machines: CuttingMachine[]
  days: Date[]
  accentColor: string
  bgColor: string
  title: string
  description: string
  counterChip?: React.ReactNode
  summaryLabel: string
  lateOrdersSize: number
  baselineLateCount: number
  onClearAll: () => void
  renderRow: (m: CuttingMachine, mi: number) => React.ReactNode
}

export default function ManualSelectionGrid({
  machines, days, accentColor, bgColor, title, description,
  counterChip, summaryLabel, lateOrdersSize, baselineLateCount, onClearAll, renderRow,
}: Props) {
  return (
    <div style={{ padding: '8px 16px', background: bgColor, borderBottom: '1px solid var(--bord)', overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: accentColor }}>{title}</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{description}</span>
        {counterChip}
        {lateOrdersSize !== baselineLateCount && (
          <span style={{ fontSize: 10, fontWeight: 700, color: baselineLateCount > lateOrdersSize ? 'var(--green)' : 'var(--red)', background: baselineLateCount > lateOrdersSize ? 'rgba(166,227,161,.15)' : 'rgba(224,90,78,.08)', padding: '2px 8px', borderRadius: 8 }}>
            🔴 ส่งช้า {baselineLateCount} → {lateOrdersSize}
            {baselineLateCount > lateOrdersSize ? ` (−${baselineLateCount - lateOrdersSize} ดีขึ้น)` : ` (+${lateOrdersSize - baselineLateCount})`}
          </span>
        )}
        <button
          onClick={onClearAll}
          style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt3)', cursor: 'pointer', marginLeft: 'auto' }}>
          ล้างทั้งหมด
        </button>
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 10, width: 'auto' }}>
        <thead>
          <tr>
            <th style={{ padding: '3px 10px', textAlign: 'left', color: 'var(--txt3)', fontWeight: 600, minWidth: 120, borderBottom: '1px solid var(--bord)' }}>เครื่อง</th>
            {days.map(d => (
              <th key={fmtISO(d)} style={{ padding: '3px 10px', textAlign: 'center', borderBottom: '1px solid var(--bord)', minWidth: 54 }}>
                <div style={{ color: d.getDay() === 6 ? 'var(--amber)' : 'var(--txt2)', fontWeight: 600 }}>{DAY_SHORT[d.getDay()]}</div>
                <div style={{ color: 'var(--txt3)', fontSize: 9 }}>{String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')}</div>
              </th>
            ))}
            <th style={{ padding: '3px 10px', textAlign: 'right', color: accentColor, fontWeight: 600, borderBottom: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>{summaryLabel}</th>
          </tr>
        </thead>
        <tbody>
          {machines.map((m, mi) => renderRow(m, mi))}
        </tbody>
      </table>
    </div>
  )
}
