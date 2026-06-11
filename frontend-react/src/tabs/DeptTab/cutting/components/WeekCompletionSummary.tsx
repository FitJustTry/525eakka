import React from 'react'
import type { Order } from '../../../types'
import { fmtISO, origId } from '../scheduling/utils'

interface Props {
  weekDoneOrders: Order[]
  weekCarryOrders: Order[]
  weekUnscheduled: Order[]
  lateOrders: Set<string>
  products: Record<string, { kva: number }>
  days: Date[]
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>
  setIncludePrevCarry: React.Dispatch<React.SetStateAction<boolean>>
}

export default function WeekCompletionSummary({
  weekDoneOrders, weekCarryOrders, weekUnscheduled, lateOrders, products, days, setWeekOffset, setIncludePrevCarry
}: Props) {
  const today = fmtISO(new Date())
  const weekEndStr = days.length > 0 ? fmtISO(days[days.length - 1]) : ''
  const doneQty = weekDoneOrders.reduce((s, o) => s + o.qty, 0)
  const carryQty = weekCarryOrders.reduce((s, o) => s + o.qty, 0)
  const unschedQty = weekUnscheduled.reduce((s, o) => s + o.qty, 0)

  const chip = (label: string, count: number, qty: number, col: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg3)', borderRadius: 8, border: `1px solid ${col}22` }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: col }}>{count} orders</span>
      <span style={{ fontSize: 10, color: 'var(--txt3)' }}>·</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: col }}>{qty} ตัว</span>
    </div>
  )

  const orderRow = (o: Order) => {
    const kva = o.kva ?? products[o.product]?.kva ?? 0
    const due = o.due_so
    const dueCol = !due ? 'var(--txt3)' : due < today ? 'var(--red)' : due <= weekEndStr ? 'var(--amber)' : 'var(--green)'
    const isLate = lateOrders.has(origId(o.id))
    return (
      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, fontSize: 11, whiteSpace: 'nowrap',
        background: isLate ? 'rgba(224,90,78,.08)' : 'var(--bg4)',
        border: isLate ? '1px solid rgba(224,90,78,.3)' : '1px solid transparent' }}>
        {isLate && <span style={{ fontSize: 10 }}>🔴</span>}
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--txt1)' }}>{o.sap_so ?? o.id.slice(-8)}</span>
        <span style={{ color: 'var(--txt3)' }}>{kva.toLocaleString()}kVA</span>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>×{o.qty}</span>
        {o.customer && <span style={{ color: 'var(--txt3)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customer}</span>}
        {due && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: dueCol, fontWeight: due < today ? 700 : 400 }}>due {due}</span>}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {weekDoneOrders.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('✅ เสร็จสัปดาห์นี้', weekDoneOrders.length, doneQty, 'var(--green)')}
          {weekDoneOrders.map(orderRow)}
        </div>
      )}
      {weekCarryOrders.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('⏭ ค้างสัปดาห์หน้า', weekCarryOrders.length, carryQty, 'var(--amber)')}
          <button
            title="ไปสัปดาห์หน้าพร้อมนำงานค้างเข้าแผน"
            onClick={() => { setWeekOffset(w => w + 1); setIncludePrevCarry(true) }}
            style={{ fontSize: 11, padding: '3px 12px', borderRadius: 8, border: '1px solid rgba(249,226,175,.5)', background: 'rgba(249,226,175,.15)', color: 'var(--amber)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            → ดูสัปดาห์หน้า + รวมงานค้าง
          </button>
          {weekCarryOrders.map(orderRow)}
        </div>
      )}
      {weekUnscheduled.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('❌ ไม่ได้ตั้งแผน', weekUnscheduled.length, unschedQty, 'var(--red)')}
          {weekUnscheduled.map(orderRow)}
        </div>
      )}
    </div>
  )
}
