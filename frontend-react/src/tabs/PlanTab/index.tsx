import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { scheduleOrders } from '../../utils/schedule'
import { isWorkDay, fmtISO } from '../../utils/dates'


const DEPTS = [
  { key:'core',  label:'แกนเหล็ก',      col:'#c07800', wcs:['EE3102','EE3104','EE3105','EE3106','EE3107'] },
  { key:'coil',  label:'พันคอยล์',      col:'#1a7a4a', wcs:['EE3201','EE3202','EE3203'] },
  { key:'ins',   label:'ฉนวน',          col:'#2a8898', wcs:['EE3601','EE3505','EE3504','EE3501','EE3503'] },
  { key:'asm',   label:'ประกอบ',         col:'#1a5fc0', wcs:['EE3301','EE3302','EE3303'] },
  { key:'fit',   label:'ติดอุปกรณ์',    col:'#6c3da8', wcs:['EE3401','EE3402','EE3403'] },
  { key:'test',  label:'QC/Test',        col:'#c0392b', wcs:['EE4201','EE4202','EE4204'] },
  { key:'tank',  label:'ตัวถัง',         col:'#8b5e3c', wcs:['MP5101','MP5102','MP5103','MP5202','MP5304','MP5601','MP5602','MP5603'] },
  { key:'paint', label:'งานสี',          col:'#9a5c38', wcs:['MP5401','MP5402','MP5403','MP5404'] },
  { key:'power', label:'Power TR',       col:'#b03020', wcs:['PT3701'] },
]
const WC_DEPT: Record<string, string> = {}
DEPTS.forEach(d => d.wcs.forEach(w => WC_DEPT[w] = d.key))

const fmtS = (d: Date | null) => {
  if (!d) return '—'
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

export default function PlanTab() {
  const { state } = useApp()
  const { orders, products, wcConfig, holidays, factoryHolidays } = state

  const { orders: scheduled } = useMemo(
    () => scheduleOrders(orders, products, wcConfig, holidays, factoryHolidays),
    [orders, products, wcConfig, holidays, factoryHolidays]
  )

  const usedDeptKeys = new Set<string>()
  scheduled.forEach(o => o.ops.forEach(op => { if (WC_DEPT[op.wc]) usedDeptKeys.add(WC_DEPT[op.wc]) }))
  const activeDepts = DEPTS.filter(d => usedDeptKeys.has(d.key))

  const orderDeptData = scheduled.map(order => {
    const dm: Record<string, { hrs: number; start: Date; end: Date }> = {}
    order.ops.forEach(op => {
      const dk = WC_DEPT[op.wc]; if (!dk) return
      if (!dm[dk]) dm[dk] = { hrs: 0, start: op.startDate, end: op.endDate }
      dm[dk].hrs += op.effHrs
      if (op.startDate < dm[dk].start) dm[dk].start = op.startDate
      if (op.endDate   > dm[dk].end)   dm[dk].end   = op.endDate
    })
    return dm
  })

  // Daily load
  const dailyLoad: Record<string, Record<string, { scheduledHrs: number; capacityHrs: number; orderIds: Set<string> }>> = {}
  function getDeptDayCap(deptKey: string, date: Date) {
    const dept = DEPTS.find(d => d.key === deptKey)
    return dept ? dept.wcs.reduce((s, wc) => {
      if (!isWorkDay(date, holidays, factoryHolidays)) return s
      const cfg = wcConfig[wc]; if (!cfg) return s
      return s + cfg.workers * (date.getDay() === 6 ? cfg.sat_hrs : cfg.hrs)
    }, 0) : 0
  }

  scheduled.forEach(order => {
    order.ops.forEach(op => {
      const dk = WC_DEPT[op.wc]; if (!dk) return
      let hrsLeft = op.effHrs
      const cur = new Date(op.startDate); cur.setHours(0, 0, 0, 0)
      const end = new Date(op.endDate); end.setHours(23, 59, 59, 0)
      while (hrsLeft > 0.01 && cur <= end) {
        if (isWorkDay(cur, holidays, factoryHolidays)) {
          const dayKey = fmtISO(cur)
          const cfg = wcConfig[op.wc]
          const wcCap = cfg ? cfg.workers * (cur.getDay() === 6 ? cfg.sat_hrs : cfg.hrs) : 0
          const used = Math.min(hrsLeft, wcCap)
          if (used > 0) {
            if (!dailyLoad[dayKey]) dailyLoad[dayKey] = {}
            if (!dailyLoad[dayKey][dk]) dailyLoad[dayKey][dk] = { scheduledHrs: 0, capacityHrs: getDeptDayCap(dk, cur), orderIds: new Set() }
            dailyLoad[dayKey][dk].scheduledHrs += used
            dailyLoad[dayKey][dk].orderIds.add(order.id)
            hrsLeft -= used
          }
        }
        cur.setDate(cur.getDate() + 1)
      }
    })
  })

  const sortedDays = Object.keys(dailyLoad).sort()
  const onTime = scheduled.filter(o => !o.isLate).length
  const late   = scheduled.filter(o => o.isLate).length
  const maxEnd = scheduled.length ? new Date(Math.max(...scheduled.map(o => o.orderEnd.getTime()))) : null
  const totalEffHrs = scheduled.reduce((s, o) => s + o.ops.reduce((ss, op) => ss + op.effHrs, 0), 0)

  const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', color: 'var(--txt3)', fontWeight: 600, fontSize: 10, background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 8px', borderBottom: '0.5px solid var(--bord)', fontSize: 11, verticalAlign: 'middle' }

  if (orders.length === 0) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--txt3)' }}>
      <div style={{ fontSize: 48 }}>📋</div>
      <div style={{ fontSize: 14 }}>ยังไม่มี Order ในระบบ</div>
    </div>
  )

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📋 แผนผลิต — Production Schedule</div>
      <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 14 }}>คำนวณจาก Routing + Capacity + วันหยุด · เรียงตาม plan_date → deadline</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        {[['Orders ทั้งหมด', scheduled.length,'var(--txt)'],['ทันกำหนด', onTime,'var(--green)'],['เกิน Deadline', late, late > 0 ? 'var(--red)' : 'var(--green)'],['แผนเสร็จ', maxEnd ? fmtS(maxEnd) : '—','var(--txt)']].map(([lbl, val, col]) => (
          <div key={String(lbl)} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--bord)' }}>
            <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{lbl}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: col as string }}>{val}</div>
            {lbl === 'แผนเสร็จ' && <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>{totalEffHrs.toFixed(0)} eff.hrs รวม</div>}
          </div>
        ))}
      </div>

      {/* Order × Dept table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bord)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>ชั่วโมงผลิตต่อ Order × แผนก</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>Order</th>
                <th style={th}>ลูกค้า / สินค้า</th>
                <th style={{ ...th, textAlign: 'center' }}>Qty</th>
                <th style={{ ...th, textAlign: 'center' }}>Plan</th>
                <th style={{ ...th, textAlign: 'center' }}>Deadline</th>
                {activeDepts.map(d => <th key={d.key} style={{ ...th, textAlign: 'center', color: d.col, minWidth: 82, borderLeft: '1px solid var(--bord)' }}>{d.label}</th>)}
                <th style={{ ...th, textAlign: 'center', borderLeft: '1px solid var(--bord2)', color: 'var(--amber)' }}>รวม (h)</th>
                <th style={{ ...th, textAlign: 'center' }}>เสร็จ</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((order, i) => {
                const dm = orderDeptData[i]
                const totalHrs = order.ops.reduce((s, op) => s + op.effHrs, 0)
                const src = orders.find(a => a.id === order.id)
                return (
                  <tr key={order.id} style={{ background: order.isLate ? 'rgba(224,90,78,.04)' : 'transparent' }}>
                    <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--amber)' }}>{order.id}</td>
                    <td style={{ ...td, maxWidth: 140 }}>
                      <div style={{ fontSize: 11, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.customer}</div>
                      <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{order.kva}kVA</div>
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)' }}>{order.qty}</td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 10, color: 'var(--txt2)' }}>{fmtS(src?.plan_date ? new Date(src.plan_date + 'T00:00:00') : null)}</td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 10, color: order.isLate ? 'var(--red)' : 'var(--txt2)', fontWeight: order.isLate ? 700 : 400 }}>{fmtS(order.deadline)}</td>
                    {activeDepts.map(d => {
                      const dd = dm[d.key]
                      if (!dd || dd.hrs < 0.05) return <td key={d.key} style={{ ...td, textAlign: 'center', color: 'var(--bord2)', borderLeft: '1px solid var(--bord)' }}>—</td>
                      return (
                        <td key={d.key} style={{ ...td, textAlign: 'center', borderLeft: '1px solid var(--bord)' }}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: d.col }}>{dd.hrs.toFixed(1)}h</div>
                          <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{fmtS(dd.start)}–{fmtS(dd.end)}</div>
                        </td>
                      )
                    })}
                    <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', borderLeft: '1px solid var(--bord2)' }}>{totalHrs.toFixed(1)}</td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 10, fontWeight: 600, color: order.isLate ? 'var(--red)' : 'var(--green)' }}>{fmtS(order.orderEnd)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {order.isLate
                        ? <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(224,90,78,.12)', color: 'var(--red)', fontWeight: 700 }}>เกิน {order.lateDays}วัน</span>
                        : <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(26,122,74,.1)', color: 'var(--green)', fontWeight: 700 }}>ทัน</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily load table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bord)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>ภาระงานรายวัน</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 100 }}>วัน</th>
                {activeDepts.map(d => <th key={d.key} style={{ ...th, textAlign: 'center', color: d.col, minWidth: 80 }}>{d.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {sortedDays.map(day => {
                const dl = dailyLoad[day]
                const dt = new Date(day + 'T00:00:00')
                const isSat = dt.getDay() === 6
                const hol = holidays[day] || factoryHolidays[day]
                return (
                  <tr key={day} style={{ background: hol ? 'rgba(224,90,78,.04)' : isSat ? 'rgba(224,156,42,.04)' : 'transparent' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 10, fontWeight: 600 }}>{dt.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                      {hol && <div style={{ fontSize: 9, color: 'var(--red)' }}>{hol}</div>}
                    </td>
                    {activeDepts.map(d => {
                      const load = dl?.[d.key]
                      if (!load || load.scheduledHrs < 0.1) return <td key={d.key} style={{ ...td, textAlign: 'center', color: 'var(--bord2)', fontSize: 10 }}>—</td>
                      const pct = load.capacityHrs > 0 ? Math.round(load.scheduledHrs / load.capacityHrs * 100) : 0
                      const bg  = pct >= 100 ? 'rgba(224,90,78,.2)' : pct >= 80 ? 'rgba(224,156,42,.15)' : pct >= 40 ? 'rgba(91,142,240,.1)' : 'rgba(76,175,125,.08)'
                      const col = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--txt2)'
                      return (
                        <td key={d.key} style={{ ...td, textAlign: 'center', background: bg }} title={[...load.orderIds].join(', ')}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: col }}>{pct}%</div>
                          <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{load.scheduledHrs.toFixed(0)}/{load.capacityHrs.toFixed(0)}h</div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
