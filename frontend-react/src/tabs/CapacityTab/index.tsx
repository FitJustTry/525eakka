import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { isWorkDay, fmtISO } from '../../utils/dates'
import { effectiveHrs, getWeeklyCapacity, loadColor } from '../../utils/capacity'

const DAY_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']

const DAILY_DEPTS = [
  { key: 'core',  label: 'แกน',    wcs: ['EE3102','EE3104','EE3105','EE3106','EE3107'], col: '#89b4fa' },
  { key: 'coil',  label: 'คอยล์',  wcs: ['EE3201','EE3202','EE3203'],                  col: '#a6e3a1' },
  { key: 'asm',   label: 'ประกอบ', wcs: ['EE3301','EE3302','EE3303'],                  col: '#f9e2af' },
  { key: 'ins',   label: 'ฉนวน',   wcs: ['EE3505','EE3504','EE3501','EE3503','EE3601'],col: '#cba6f7' },
  { key: 'test',  label: 'QC',     wcs: ['EE4201','EE4202','EE4204'],                  col: '#f38ba8' },
  { key: 'tank',  label: 'ตัวถัง', wcs: ['MP5101','MP5102','MP5103','MP5304','MP5601','MP5602','MP5603'], col: '#89dceb' },
]

function getWeekDates(offset: number): Date[] {
  const today = new Date()
  const dow = today.getDay()
  const toMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(today)
  mon.setDate(today.getDate() + toMon + offset * 7)
  mon.setHours(0, 0, 0, 0)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

export default function CapacityTab() {
  const { state } = useApp()
  const { orders, products, wcConfig, holidays, factoryHolidays } = state
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const days = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const monStr = fmtISO(days[0])
  const satStr = fmtISO(days[5])
  const todayStr = fmtISO(new Date())

  const weekOrders = useMemo(
    () => orders.filter(o => o.plan_date && o.plan_date >= monStr && o.plan_date <= satStr),
    [orders, monStr, satStr]
  )

  const usedWCs = useMemo(() => {
    const wcs = new Set<string>()
    weekOrders.forEach(o => { products[o.product]?.ops.forEach(op => wcs.add(op.wc)) })
    return [...wcs].sort()
  }, [weekOrders, products])

  const dayLoadMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    days.forEach(d => { map[fmtISO(d)] = {} })
    weekOrders.forEach(o => {
      const dStr = o.plan_date!
      const product = products[o.product]
      if (!product || !map[dStr]) return
      product.ops.forEach(op => {
        const effH = effectiveHrs(op.wc, op.hrs, wcConfig) * o.qty
        map[dStr][op.wc] = (map[dStr][op.wc] ?? 0) + effH
      })
    })
    return map
  }, [weekOrders, products, wcConfig, days])

  // Per-day summary: order count, total qty, dept load
  const daySummary = useMemo(() => {
    return days.map(d => {
      const dStr = fmtISO(d)
      const dayOrders = weekOrders.filter(o => o.plan_date === dStr)
      const totalQty = dayOrders.reduce((s, o) => s + o.qty, 0)
      const wcLoad = dayLoadMap[dStr] ?? {}
      const deptLoad = DAILY_DEPTS.map(dept => {
        const load = dept.wcs.reduce((s, wc) => s + (wcLoad[wc] ?? 0), 0)
        const cap = isWorkDay(d, holidays, factoryHolidays)
          ? dept.wcs.reduce((s, wc) => {
              const cfg = wcConfig[wc]; if (!cfg) return s
              return s + cfg.workers * (d.getDay() === 6 ? cfg.sat_hrs : cfg.hrs)
            }, 0)
          : 0
        return { load, cap }
      })
      const isWork = isWorkDay(d, holidays, factoryHolidays)
      const hol = holidays[dStr] || factoryHolidays[dStr]
      return { dStr, dayOrders: dayOrders.length, totalQty, deptLoad, isWork, hol }
    })
  }, [days, weekOrders, dayLoadMap, wcConfig, holidays, factoryHolidays])

  const fmtLabel = (d: Date) => DAY_TH[d.getDay()] + ' ' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0')

  const th: React.CSSProperties = { padding: '7px 8px', textAlign: 'left', color: 'var(--txt3)', fontSize: 10, fontWeight: 600, background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--bord)', verticalAlign: 'middle', fontSize: 11 }

  const detailOrders = selectedDate ? weekOrders.filter(o => o.plan_date === selectedDate) : []

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>⚡ Capacity Plan — รายสัปดาห์</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>{monStr} – {satStr}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'transparent', color: 'var(--txt2)', cursor: 'pointer' }}>‹ ก่อนหน้า</button>
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'transparent', color: 'var(--amber)', cursor: 'pointer' }}>สัปดาห์นี้</button>}
            <button onClick={() => setWeekOffset(w => w + 1)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'transparent', color: 'var(--txt2)', cursor: 'pointer' }}>ถัดไป ›</button>
          </div>
        </div>

        {/* Daily summary cards — always shown for all 6 days */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 14 }}>
          {days.map((d, i) => {
            const sum = daySummary[i]
            const dStr = sum.dStr
            const isToday = dStr === todayStr
            const isSel = dStr === selectedDate
            const borderCol = isSel ? 'var(--blue)' : isToday ? 'var(--amber)' : sum.hol ? 'rgba(224,90,78,.4)' : 'var(--bord)'
            const bgCol = sum.hol ? 'rgba(224,90,78,.04)' : d.getDay() === 6 ? 'rgba(224,156,42,.04)' : 'var(--bg2)'
            return (
              <div key={dStr} onClick={() => setSelectedDate(isSel ? null : dStr)}
                style={{ background: bgCol, border: `1px solid ${borderCol}`, borderRadius: 10, padding: '10px 10px 8px', cursor: 'pointer', transition: 'border-color .15s' }}>
                {/* Day header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? 'var(--amber)' : sum.hol ? 'var(--red)' : d.getDay() === 6 ? 'var(--amber)' : 'var(--txt)' }}>
                    {fmtLabel(d)}
                  </div>
                  {isToday && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />}
                </div>
                {/* Orders · units */}
                <div style={{ fontSize: 10, color: sum.dayOrders > 0 ? 'var(--txt2)' : 'var(--txt3)', marginBottom: sum.hol ? 0 : 6, fontFamily: 'var(--mono)' }}>
                  {sum.hol
                    ? <span style={{ color: 'var(--red)', fontSize: 9 }}>{sum.hol}</span>
                    : <>{sum.dayOrders} orders · {sum.totalQty} ตัว</>
                  }
                </div>
                {/* Dept load bars */}
                {!sum.hol && (
                  <div style={{ display: 'flex', gap: 2 }}>
                    {DAILY_DEPTS.map(dept => {
                      const { load, cap } = sum.deptLoad[DAILY_DEPTS.indexOf(dept)]
                      const pct = cap > 0 ? Math.min(load / cap, 1) : 0
                      const hasLoad = load > 0.1
                      return (
                        <div key={dept.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                          <div style={{ width: '100%', height: 28, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                            <div style={{ width: '100%', height: `${pct * 100}%`, background: hasLoad ? dept.col + 'cc' : 'transparent', minHeight: hasLoad ? 2 : 0, borderRadius: 1 }} />
                          </div>
                          <div style={{ fontSize: 7, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                            {hasLoad ? Math.round(pct * 100) + '%' : '—'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Dept legend */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          {DAILY_DEPTS.map(d => (
            <span key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--txt3)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: d.col, display: 'inline-block' }} />
              {d.label}
            </span>
          ))}
        </div>

        {weekOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--txt3)', fontSize: 13 }}>📭 ไม่มี Orders ในสัปดาห์นี้</div>
        ) : (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, minWidth: 110 }}>Work Center</th>
                    {days.map(d => {
                      const dStr = fmtISO(d)
                      const isHol = !isWorkDay(d, holidays, factoryHolidays)
                      const isSat = d.getDay() === 6
                      return (
                        <th key={dStr} style={{ ...th, textAlign: 'center', minWidth: 90, cursor: 'pointer', color: dStr === todayStr ? 'var(--blue)' : isSat ? 'var(--amber)' : isHol ? 'var(--red)' : 'var(--txt3)' }}
                          onClick={() => setSelectedDate(dStr === selectedDate ? null : dStr)}>
                          {fmtLabel(d)}{dStr === selectedDate ? ' ◀' : ''}
                        </th>
                      )
                    })}
                    <th style={{ ...th, textAlign: 'center' }}>รวม/WC</th>
                  </tr>
                </thead>
                <tbody>
                  {usedWCs.map(wc => {
                    const cap = getWeeklyCapacity(wc, wcConfig)
                    const weekTotal = Object.values(dayLoadMap).reduce((a, d) => a + (d[wc] ?? 0), 0)
                    const weekPct = Math.round(weekTotal / cap.normal * 100)
                    return (
                      <tr key={wc}>
                        <td style={td}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', fontWeight: 700 }}>{wc}</div>
                          <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{wcConfig[wc]?.name}</div>
                        </td>
                        {days.map(d => {
                          const dStr = fmtISO(d)
                          const isWork = isWorkDay(d, holidays, factoryHolidays)
                          const dayCap = isWork ? (d.getDay() === 6 ? wcConfig[wc]?.workers * wcConfig[wc]?.sat_hrs : wcConfig[wc]?.workers * wcConfig[wc]?.hrs) : 0
                          const load   = dayLoadMap[dStr]?.[wc] ?? 0
                          const pct    = dayCap > 0 ? Math.round(load / dayCap * 100) : 0
                          const col    = loadColor(pct)
                          const isSelected = dStr === selectedDate
                          if (!isWork) return <td key={dStr} style={{ ...td, textAlign: 'center', background: 'rgba(224,90,78,.04)' }}><span style={{ fontSize: 9, color: 'var(--txt3)' }}>หยุด</span></td>
                          return (
                            <td key={dStr} style={{ ...td, textAlign: 'center', background: isSelected ? 'rgba(91,142,240,.07)' : load > 0 ? `${col}10` : 'transparent', cursor: 'pointer' }}
                              onClick={() => setSelectedDate(dStr === selectedDate ? null : dStr)}>
                              {load > 0 ? (
                                <>
                                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: col }}>{pct}%</div>
                                  <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{load.toFixed(1)}/{dayCap}h</div>
                                </>
                              ) : <span style={{ color: 'var(--bord2)', fontSize: 9 }}>—</span>}
                            </td>
                          )
                        })}
                        <td style={{ ...td, textAlign: 'center', borderLeft: '2px solid var(--bord2)' }}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: loadColor(weekPct) }}>{weekPct}%</div>
                          <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{weekTotal.toFixed(1)}h</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedDate && (
        <div style={{ width: 320, borderLeft: '1px solid var(--bord)', overflowY: 'auto', padding: '1.25rem', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📅 {selectedDate}</div>
          <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 12 }}>
            {detailOrders.length} orders · {detailOrders.reduce((s, o) => s + o.qty, 0)} ตัว
          </div>
          {detailOrders.length === 0
            ? <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--txt3)', fontSize: 12 }}>ไม่มี Orders วันนี้</div>
            : detailOrders.map(o => {
                const p = products[o.product]
                return (
                  <div key={o.id} style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', fontWeight: 700 }}>{o.id}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt)', marginTop: 2 }}>{o.customer} {o.kva}kVA ×{o.qty}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>{p?.label.split('—')[0].trim()}</div>
                    {p?.ops.map(op => {
                      const effH = effectiveHrs(op.wc, op.hrs, wcConfig) * o.qty
                      return (
                        <div key={op.wc + op.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--txt3)', marginTop: 2 }}>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{op.wc}</span>
                          <span>{effH.toFixed(1)}h</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })
          }
        </div>
      )}
    </div>
  )
}
