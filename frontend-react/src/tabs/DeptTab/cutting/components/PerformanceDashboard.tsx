import React, { useState, useMemo } from 'react'
import type { MachineDowntime, CuttingMachine } from '../../../../types'
import type { SnapMeta, ResultSummary } from '../hooks/usePlanSnapshots'

interface Props {
  snapshots: SnapMeta[]
  downtimes?: MachineDowntime[]
  machines?: CuttingMachine[]
  onClose: () => void
}

type Tab = 'trend' | 'reasons' | 'machines' | 'chains' | 'downtime'

interface ChainEntry {
  sap_so: string; key: string
  weeks: string[]; reasons: string[]
  maxConsecutive: number
}

function maxConsecutiveWeeks(weeks: string[]): number {
  if (weeks.length < 2) return weeks.length
  const sorted = [...weeks].sort()
  let best = 1, cur = 1
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000
    if (diff <= 10) { cur++; best = Math.max(best, cur) } else cur = 1
  }
  return best
}

export default function PerformanceDashboard({ snapshots, downtimes = [], machines = [], onClose }: Props) {
  const [tab, setTab] = useState<Tab>('trend')

  const completed = useMemo(() =>
    snapshots
      .filter((s): s is SnapMeta & { result_summary: ResultSummary } => s.status === 'completed' && !!s.result_summary)
      .sort((a, b) => a.week_end.localeCompare(b.week_end))
  , [snapshots])

  // ── A: Completion trend ──
  const maxRate = 100

  // ── B: Carry reasons ──
  const reasonCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of completed)
      for (const c of s.result_summary.carry_orders)
        m[c.reason] = (m[c.reason] ?? 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [completed])
  const maxReason = reasonCounts[0]?.[1] ?? 1

  // ── C: Machine stats ──
  const machineStats = useMemo(() => {
    const best: Record<string, number> = {}
    const bottleneck: Record<string, number> = {}
    for (const s of completed) {
      if (s.result_summary.best_machine) best[s.result_summary.best_machine] = (best[s.result_summary.best_machine] ?? 0) + 1
      if (s.result_summary.bottleneck_machine) bottleneck[s.result_summary.bottleneck_machine] = (bottleneck[s.result_summary.bottleneck_machine] ?? 0) + 1
    }
    return {
      best: Object.entries(best).sort((a, b) => b[1] - a[1]),
      bottleneck: Object.entries(bottleneck).sort((a, b) => b[1] - a[1]),
    }
  }, [completed])
  const maxMach = Math.max(machineStats.best[0]?.[1] ?? 1, machineStats.bottleneck[0]?.[1] ?? 1)

  // ── D: Carry chains ──
  const carryChains = useMemo((): ChainEntry[] => {
    const hist = new Map<string, ChainEntry>()
    for (const s of completed) {
      for (const c of s.result_summary.carry_orders) {
        const k = c.sap_so || c.key
        if (!hist.has(k)) hist.set(k, { sap_so: c.sap_so, key: k, weeks: [], reasons: [], maxConsecutive: 0 })
        const h = hist.get(k)!
        h.weeks.push(s.week_end)
        h.reasons.push(c.reason)
      }
    }
    return [...hist.values()]
      .map(h => ({ ...h, maxConsecutive: maxConsecutiveWeeks(h.weeks) }))
      .filter(h => h.weeks.length >= 2)
      .sort((a, b) => b.maxConsecutive - a.maxConsecutive || b.weeks.length - a.weeks.length)
  }, [completed])

  // ── Styles ──
  const ov: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const modal: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--bord)', borderRadius: 14, width: 720, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
  const TAB_DEFS: { id: Tab; label: string }[] = [
    { id: 'trend',    label: '📈 Completion' },
    { id: 'reasons',  label: '⚠️ Carry Reasons' },
    { id: 'machines', label: '🏆 Machines' },
    { id: 'chains',   label: `🔄 Chains ${carryChains.length > 0 ? `(${carryChains.length})` : ''}` },
    { id: 'downtime', label: `🔧 Downtime ${downtimes.length > 0 ? `(${downtimes.length})` : ''}` },
  ]
  const avgRate = completed.length > 0
    ? Math.round(completed.reduce((s, x) => s + x.result_summary.completion_rate, 0) / completed.length)
    : 0

  return (
    <div style={ov} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modal}>
        {/* Header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--bord)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>ประสิทธิภาพการผลิต</div>
            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{completed.length} สัปดาห์ที่ปิดแล้ว · เฉลี่ย {avgRate}%</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 18 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--bord)', background: 'var(--bg2)', padding: '0 16px' }}>
          {TAB_DEFS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ fontSize: 11, padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? 'var(--blue)' : 'var(--txt3)', borderBottom: tab === t.id ? '2px solid var(--blue)' : '2px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {completed.length === 0 && (
            <div style={{ textAlign: 'center' as const, padding: 48, color: 'var(--txt3)', fontSize: 12 }}>
              ยังไม่มีสัปดาห์ที่ปิดแล้ว — ปิดสัปดาห์แรกเพื่อดูสถิติ
            </div>
          )}

          {/* Tab: Trend */}
          {tab === 'trend' && completed.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 6 }}>อัตราความสำเร็จรายสัปดาห์</div>
              {completed.map(s => {
                const r = s.result_summary.completion_rate
                const col = r >= 90 ? 'var(--green)' : r >= 70 ? 'var(--amber)' : 'var(--red)'
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--txt3)', minWidth: 88, flexShrink: 0, fontFamily: 'var(--mono)' }}>{s.week_start.slice(5)} – {s.week_end.slice(5)}</span>
                    <div style={{ flex: 1, height: 18, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', position: 'relative' as const }}>
                      <div style={{ width: `${r / maxRate * 100}%`, height: '100%', background: col, borderRadius: 4 }} />
                      <span style={{ position: 'absolute' as const, left: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--bg)', fontWeight: 700, mixBlendMode: 'multiply' as const }}>
                        {s.result_summary.completed_count}/{s.result_summary.planned_count}
                      </span>
                    </div>
                    <span style={{ minWidth: 38, fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12, color: col }}>{r}%</span>
                    {s.result_summary.carry_count > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--amber)', minWidth: 50, flexShrink: 0 }}>⏭ {s.result_summary.carry_count} ค้าง</span>
                    )}
                  </div>
                )
              })}
              {/* Avg line */}
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8, display: 'flex', gap: 16, fontSize: 11 }}>
                <span style={{ color: 'var(--txt3)' }}>เฉลี่ย</span>
                <span style={{ fontWeight: 800, fontFamily: 'var(--mono)', color: avgRate >= 90 ? 'var(--green)' : avgRate >= 70 ? 'var(--amber)' : 'var(--red)' }}>{avgRate}%</span>
                <span style={{ color: 'var(--txt3)' }}>|</span>
                <span style={{ color: 'var(--txt3)' }}>ดีที่สุด</span>
                <span style={{ fontWeight: 700, color: 'var(--green)' }}>{Math.max(...completed.map(s => s.result_summary.completion_rate))}%</span>
                <span style={{ color: 'var(--txt3)' }}>|</span>
                <span style={{ color: 'var(--txt3)' }}>ต่ำสุด</span>
                <span style={{ fontWeight: 700, color: 'var(--red)' }}>{Math.min(...completed.map(s => s.result_summary.completion_rate))}%</span>
              </div>
            </div>
          )}

          {/* Tab: Carry Reasons */}
          {tab === 'reasons' && completed.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 6 }}>สาเหตุงานค้างสะสม ({reasonCounts.reduce((s, [, n]) => s + n, 0)} ครั้ง)</div>
              {reasonCounts.length === 0 && <div style={{ color: 'var(--green)', fontSize: 12 }}>🎉 ไม่มีงานค้างเลย!</div>}
              {reasonCounts.map(([reason, count]) => (
                <div key={reason} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, minWidth: 160, flexShrink: 0, color: 'var(--txt2)' }}>{reason}</span>
                  <div style={{ flex: 1, height: 16, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${count / maxReason * 100}%`, height: '100%', background: 'rgba(249,226,175,.6)', borderRadius: 4 }} />
                  </div>
                  <span style={{ minWidth: 28, fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: 'var(--amber)', textAlign: 'right' as const }}>{count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tab: Machines */}
          {tab === 'machines' && completed.length > 0 && (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {/* Best */}
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 10 }}>🏆 ประสิทธิภาพดีที่สุด</div>
                {machineStats.best.length === 0 && <div style={{ color: 'var(--txt3)', fontSize: 11 }}>ไม่มีข้อมูล</div>}
                {machineStats.best.map(([name, cnt]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 11, minWidth: 100, color: 'var(--txt2)', flexShrink: 0 }}>{name}</span>
                    <div style={{ flex: 1, height: 12, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${cnt / maxMach * 100}%`, height: '100%', background: 'rgba(166,227,161,.7)', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--green)', minWidth: 20, textAlign: 'right' as const }}>{cnt}</span>
                    <span style={{ fontSize: 9, color: 'var(--txt3)' }}>สัปดาห์</span>
                  </div>
                ))}
              </div>
              {/* Bottleneck */}
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>⚠️ คอขวด</div>
                {machineStats.bottleneck.length === 0 && <div style={{ color: 'var(--txt3)', fontSize: 11 }}>ไม่มีข้อมูล</div>}
                {machineStats.bottleneck.map(([name, cnt]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 11, minWidth: 100, color: 'var(--txt2)', flexShrink: 0 }}>{name}</span>
                    <div style={{ flex: 1, height: 12, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${cnt / maxMach * 100}%`, height: '100%', background: 'rgba(224,90,78,.5)', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--red)', minWidth: 20, textAlign: 'right' as const }}>{cnt}</span>
                    <span style={{ fontSize: 9, color: 'var(--txt3)' }}>สัปดาห์</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Carry Chains */}
          {tab === 'chains' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 6 }}>
                Orders ที่ค้างหลายสัปดาห์ติดต่อกัน
              </div>
              {carryChains.length === 0 && (
                <div style={{ color: 'var(--green)', fontSize: 12, padding: 24, textAlign: 'center' as const }}>
                  🎉 ไม่มีงานค้างซ้ำ — ทุก order เสร็จภายในสัปดาห์ที่วางแผน
                </div>
              )}
              {carryChains.map(c => {
                const alertLevel = c.maxConsecutive >= 4 ? 'var(--red)' : c.maxConsecutive >= 3 ? 'var(--amber)' : 'var(--txt3)'
                const reasonTally: Record<string, number> = {}
                c.reasons.forEach(r => { reasonTally[r] = (reasonTally[r] ?? 0) + 1 })
                const reasonSummary = Object.entries(reasonTally).sort((a, b) => b[1] - a[1]).map(([r, n]) => n > 1 ? `${r} ×${n}` : r).join(' · ')
                return (
                  <div key={c.key} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${alertLevel}44`, background: `${alertLevel}08`, fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {c.maxConsecutive >= 3 && <span style={{ fontSize: 12 }}>🚨</span>}
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{c.sap_so || c.key.slice(-8)}</span>
                      <span style={{ padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: `${alertLevel}18`, color: alertLevel, border: `1px solid ${alertLevel}33` }}>
                        {c.weeks.length} สัปดาห์ · {c.maxConsecutive} ติดต่อกัน
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--txt3)' }}>ล่าสุด {c.weeks[c.weeks.length - 1]?.slice(5)}</span>
                    </div>
                    {reasonSummary && (
                      <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>สาเหตุ: {reasonSummary}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tab: Downtime */}
          {tab === 'downtime' && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 10 }}>{downtimes.length} รายการ downtime</div>
              {downtimes.length === 0 && (
                <div style={{ color: 'var(--green)', fontSize: 12, padding: 24, textAlign: 'center' as const }}>🟢 ไม่มี downtime ที่บันทึกไว้</div>
              )}
              {downtimes.length > 0 && (
                <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bord)' }}>
                      {['เครื่อง', 'เริ่ม', 'สิ้นสุด', 'วัน', 'สาเหตุ', 'หมายเหตุ'].map(h => (
                        <th key={h} style={{ padding: '4px 10px', textAlign: 'left', color: 'var(--txt3)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...downtimes].sort((a, b) => b.start_date.localeCompare(a.start_date)).map((d, i) => {
                      const mName = machines.find(m => m.id === d.machine_id)?.name ?? `#${d.machine_id}`
                      const days = Math.round((new Date(d.end_date).getTime() - new Date(d.start_date).getTime()) / 86400000) + 1
                      return (
                        <tr key={d.id} style={{ borderBottom: '0.5px solid var(--bord)', background: i % 2 ? 'transparent' : 'rgba(127,127,127,.03)' }}>
                          <td style={{ padding: '4px 10px', fontWeight: 600 }}>{mName}</td>
                          <td style={{ padding: '4px 10px', fontFamily: 'var(--mono)' }}>{d.start_date}</td>
                          <td style={{ padding: '4px 10px', fontFamily: 'var(--mono)' }}>{d.end_date}</td>
                          <td style={{ padding: '4px 10px', color: 'var(--red)', fontWeight: 700 }}>{days}d</td>
                          <td style={{ padding: '4px 10px' }}>{d.reason}</td>
                          <td style={{ padding: '4px 10px', color: 'var(--txt3)' }}>{d.notes || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--bord)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', cursor: 'pointer', color: 'var(--txt2)' }}>ปิด</button>
        </div>
      </div>
    </div>
  )
}
