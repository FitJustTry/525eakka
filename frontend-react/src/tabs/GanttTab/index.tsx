import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { scheduleOrders } from '../../utils/schedule'
import { fmtISO, isWorkDay } from '../../utils/dates'

const DEPTS = [
  { id: 'core',  label: 'แกน',    wcs: ['EE3102','EE3104','EE3105','EE3106','EE3107'], col: '#89b4fa' },
  { id: 'coil',  label: 'คอยล์',  wcs: ['EE3201','EE3202','EE3203'],                  col: '#a6e3a1' },
  { id: 'ins',   label: 'ฉนวน',   wcs: ['EE3505','EE3601'],                           col: '#cba6f7' },
  { id: 'asm',   label: 'ประกอบ', wcs: ['EE3301','EE3302','EE3303'],                  col: '#f9e2af' },
  { id: 'fit',   label: 'อุปกรณ์',wcs: ['EE3401'],                                    col: '#fab387' },
  { id: 'test',  label: 'ทดสอบ',  wcs: ['EE4201','EE4202'],                           col: '#f38ba8' },
  { id: 'tank',  label: 'ตัวถัง', wcs: ['MP5101','MP5304','MP5601','MP5602','MP5603'],col: '#89dceb' },
  { id: 'paint', label: 'พ่นสี',  wcs: ['MP5401','MP5402','MP5403'],                  col: '#94e2d5' },
  { id: 'pt',    label: 'PT',      wcs: ['PT3701','EE3503'],                           col: '#b4befe' },
]

function deptCol(wc: string): string {
  return DEPTS.find(d => d.wcs.includes(wc))?.col ?? '#89b4fa'
}

const CELL_W = 28
const ROW_H = 32

export default function GanttTab() {
  const { state } = useApp()
  const { orders, products, wcConfig, holidays, factoryHolidays } = state
  const [mode, setMode] = useState<'order' | 'dept'>('order')
  const [hovered, setHovered] = useState<string | null>(null)

  const result = useMemo(() => {
    if (orders.length === 0) return null
    try { return scheduleOrders(orders, products, wcConfig, holidays, factoryHolidays) }
    catch { return null }
  }, [orders, products, wcConfig, holidays, factoryHolidays])

  if (!result || orders.length === 0) {
    return (
      <div style={{ padding: '1.25rem 1.5rem', flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>📊 Gantt Chart</div>
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--txt3)', fontSize: 13 }}>
          📭 ยังไม่มี Orders — เพิ่ม Orders ที่แท็บ Simulate หรือ Import ก่อน
        </div>
      </div>
    )
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const startD = new Date(today); startD.setDate(startD.getDate() - 3)
  const endD   = new Date(today); endD.setDate(endD.getDate() + Math.max(result.spanDays + 7, 30))

  const dateCols: Date[] = []
  const cur = new Date(startD)
  while (cur <= endD) { dateCols.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  const totalCols = dateCols.length
  const todayIdx = dateCols.findIndex(d => fmtISO(d) === fmtISO(today))

  function colOf(d: Date): number {
    return dateCols.findIndex(c => fmtISO(c) === fmtISO(d))
  }

  const DateHeader = () => (
    <div style={{ display: 'flex', height: 40, borderBottom: '1px solid var(--bord)', background: 'var(--bg3)', position: 'sticky', top: 0, zIndex: 3 }}>
      {dateCols.map((d, i) => {
        const isHol = !isWorkDay(d, holidays, factoryHolidays)
        const isMon = d.getDay() === 1
        const isSat = d.getDay() === 6
        return (
          <div key={i} style={{ width: CELL_W, flexShrink: 0, borderRight: isMon ? '1px solid var(--bord2)' : '0.5px solid var(--bord)', background: isHol ? 'rgba(224,90,78,.06)' : isSat ? 'rgba(224,156,42,.04)' : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {(isMon || i === 0) && <div style={{ fontSize: 8, color: 'var(--txt3)' }}>{d.getDate()}/{d.getMonth()+1}</div>}
            {i === todayIdx && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--amber)' }} />}
          </div>
        )
      })}
    </div>
  )

  const TodayLine = () => todayIdx >= 0 ? (
    <div style={{ position: 'absolute', top: 40, bottom: 0, left: todayIdx * CELL_W + CELL_W / 2, width: 2, background: 'var(--amber)', opacity: 0.4, zIndex: 2, pointerEvents: 'none' }} />
  ) : null

  function BgCells({ rowH }: { rowH: number }) {
    return (
      <>
        {dateCols.map((d, i) => {
          const isHol = !isWorkDay(d, holidays, factoryHolidays)
          const isSat = d.getDay() === 6
          const isMon = d.getDay() === 1
          return <div key={i} style={{ position: 'absolute', left: i * CELL_W, top: 0, width: CELL_W, height: rowH, background: isHol ? 'rgba(224,90,78,.04)' : isSat ? 'rgba(224,156,42,.03)' : 'transparent', borderRight: isMon ? '1px solid var(--bord2)' : '0.5px solid var(--bord)' }} />
        })}
      </>
    )
  }

  if (mode === 'order') {
    const rows = result.orders
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '1.25rem 1.5rem' }}>
        <ModeBar mode={mode} setMode={setMode} count={rows.length} />
        <div style={{ flex: 1, overflow: 'auto', marginTop: 12 }}>
          <div style={{ display: 'flex', minWidth: totalCols * CELL_W + 220 }}>
            {/* Labels */}
            <div style={{ width: 220, flexShrink: 0 }}>
              <div style={{ height: 40, borderBottom: '1px solid var(--bord)', background: 'var(--bg3)' }} />
              {rows.map(o => (
                <div key={o.id} style={{ height: ROW_H, display: 'flex', alignItems: 'center', borderBottom: '0.5px solid var(--bord)', padding: '0 8px', fontSize: 10, background: hovered === o.id ? 'rgba(91,142,240,.07)' : 'transparent' }}
                  onMouseEnter={() => setHovered(o.id)} onMouseLeave={() => setHovered(null)}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: o.color, marginRight: 5, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: 700, marginRight: 5 }}>{o.id}</span>
                  <span style={{ color: 'var(--txt3)', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.kva}k×{o.qty} {o.isLate ? '⚠' : ''}</span>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <DateHeader />
              <TodayLine />
              {rows.map(o => {
                const isHov = hovered === o.id
                return (
                  <div key={o.id} style={{ height: ROW_H, position: 'relative', borderBottom: '0.5px solid var(--bord)', background: isHov ? 'rgba(91,142,240,.05)' : 'transparent' }}
                    onMouseEnter={() => setHovered(o.id)} onMouseLeave={() => setHovered(null)}>
                    <BgCells rowH={ROW_H} />
                    {/* Deadline marker */}
                    {(() => {
                      const dlIdx = colOf(o.deadline)
                      if (dlIdx < 0 || dlIdx >= totalCols) return null
                      return <div style={{ position: 'absolute', left: dlIdx * CELL_W + CELL_W / 2, top: 4, bottom: 4, width: 2, background: 'var(--red)', opacity: 0.5, zIndex: 3, borderRadius: 2 }} />
                    })()}
                    {o.ops.map((op, i) => {
                      const s = colOf(op.startDate)
                      const e = colOf(op.endDate)
                      if (s < 0) return null
                      const col = deptCol(op.wc)
                      const width = Math.max((e - s + 1) * CELL_W - 2, CELL_W / 2)
                      return (
                        <div key={i} title={`${op.wc}: ${op.name} (${op.effHrs}h)`}
                          style={{ position: 'absolute', left: s * CELL_W + 1, top: 5, height: ROW_H - 10, width, borderRadius: 3, background: col + 'bb', border: `1px solid ${col}`, zIndex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: 8, padding: '0 3px', lineHeight: `${ROW_H-10}px`, color: '#111', fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{op.wc}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Dept mode
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '1.25rem 1.5rem' }}>
      <ModeBar mode={mode} setMode={setMode} count={DEPTS.length} />
      <div style={{ flex: 1, overflow: 'auto', marginTop: 12 }}>
        <div style={{ display: 'flex', minWidth: totalCols * CELL_W + 160 }}>
          <div style={{ width: 160, flexShrink: 0 }}>
            <div style={{ height: 40, borderBottom: '1px solid var(--bord)', background: 'var(--bg3)' }} />
            {DEPTS.map(d => (
              <div key={d.id} style={{ height: ROW_H, display: 'flex', alignItems: 'center', borderBottom: '0.5px solid var(--bord)', padding: '0 8px', fontSize: 11 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: d.col, marginRight: 6, display: 'inline-block', flexShrink: 0 }} />
                {d.label}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <DateHeader />
            <TodayLine />
            {DEPTS.map(dept => {
              const deptOpsPerDay: Record<number, number> = {}
              result.orders.forEach(o => {
                o.ops.forEach(op => {
                  if (!dept.wcs.includes(op.wc)) return
                  const s = colOf(op.startDate)
                  const e = colOf(op.endDate)
                  for (let i = Math.max(s, 0); i <= Math.min(e, totalCols - 1); i++) {
                    deptOpsPerDay[i] = (deptOpsPerDay[i] ?? 0) + 1
                  }
                })
              })
              const maxV = Math.max(1, ...Object.values(deptOpsPerDay))

              return (
                <div key={dept.id} style={{ height: ROW_H, position: 'relative', borderBottom: '0.5px solid var(--bord)' }}>
                  <BgCells rowH={ROW_H} />
                  {Object.entries(deptOpsPerDay).map(([idx, cnt]) => {
                    const i = parseInt(idx)
                    const pct = cnt / maxV
                    return (
                      <div key={i} title={`${cnt} ops`}
                        style={{ position: 'absolute', left: i * CELL_W + 1, bottom: 0, width: CELL_W - 2, height: Math.max(pct * (ROW_H - 6), 4), background: dept.col + 'cc', borderRadius: '2px 2px 0 0', zIndex: 1 }} />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeBar({ mode, setMode, count }: { mode: string; setMode: (m: 'order' | 'dept') => void; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>📊 Gantt Chart</div>
      <span style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>{count} รายการ</span>
      {(['order', 'dept'] as const).map(m => (
        <button key={m} onClick={() => setMode(m)}
          style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--bord2)', background: mode === m ? 'var(--blue)' : 'var(--bg3)', color: mode === m ? '#000' : 'var(--txt2)', cursor: 'pointer', fontWeight: mode === m ? 700 : 400 }}>
          {m === 'order' ? 'Order View' : 'Dept View'}
        </button>
      ))}
    </div>
  )
}
