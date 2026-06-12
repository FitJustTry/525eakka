import React from 'react'
import type { Order } from '../../../types'
import { fmtISO } from '../scheduling/utils'

interface Props {
  weekDoneOrders: Order[]
  weekCarryOrders: Order[]
  weekUnscheduled: Order[]
  weekCompletedManual: Order[]
  lateOrders: Set<string>
  products: Record<string, { kva: number }>
  days: Date[]
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>
  setIncludePrevCarry: React.Dispatch<React.SetStateAction<boolean>>
  ordersById: Map<string, Order>
  updateDoneQty: (id: string, n: number) => void
  origId: (id: string) => string
}

export default function WeekCompletionSummary({
  weekDoneOrders, weekCarryOrders, weekUnscheduled, weekCompletedManual, lateOrders, products, days,
  setWeekOffset, setIncludePrevCarry, ordersById, updateDoneQty, origId,
}: Props) {
  const today = fmtISO(new Date())
  const weekEndStr = days.length > 0 ? fmtISO(days[days.length - 1]) : ''

  // qty figures use the ORIGINAL order (full qty + done_qty), resolved by id
  const orig = (o: Order) => ordersById.get(origId(o.id)) ?? o
  const sumOrig = (list: Order[]) => list.reduce((s, o) => s + orig(o).qty, 0)
  const sumRemaining = (list: Order[]) => list.reduce((s, o) => { const x = orig(o); return s + Math.max(0, x.qty - (x.done_qty ?? 0)) }, 0)

  const chip = (label: string, count: number, qty: number, col: string, qtyLabel = 'ตัว') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg3)', borderRadius: 8, border: `1px solid ${col}22` }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: col }}>{count} orders</span>
      <span style={{ fontSize: 10, color: 'var(--txt3)' }}>·</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: col }}>{qty} {qtyLabel}</span>
    </div>
  )

  // de-duplicate per original id (engine may split into units / carry clones)
  const dedup = (list: Order[]) => {
    const seen = new Set<string>(); const out: Order[] = []
    for (const o of list) { const id = origId(o.id); if (!seen.has(id)) { seen.add(id); out.push(orig(o)) } }
    return out
  }

  const orderRow = (o: Order, editable: boolean) => {
    const x = orig(o)
    const kva = x.kva ?? products[x.product]?.kva ?? 0
    const due = x.due_so
    const dueCol = !due ? 'var(--txt3)' : due < today ? 'var(--red)' : due <= weekEndStr ? 'var(--amber)' : 'var(--green)'
    const isLate = lateOrders.has(origId(o.id))
    const done = x.done_qty ?? 0
    const remaining = Math.max(0, x.qty - done)
    const full = done >= x.qty
    return (
      <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, fontSize: 11, whiteSpace: 'nowrap',
        background: full ? 'rgba(166,227,161,.08)' : done > 0 ? 'rgba(249,226,175,.08)' : isLate ? 'rgba(224,90,78,.08)' : 'var(--bg4)',
        border: full ? '1px solid rgba(166,227,161,.35)' : done > 0 ? '1px solid rgba(249,226,175,.35)' : isLate ? '1px solid rgba(224,90,78,.3)' : '1px solid transparent' }}>
        {isLate && !full && <span style={{ fontSize: 10 }}>🔴</span>}
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--txt1)' }}>{x.sap_so || x.id.slice(-8)}</span>
        <span style={{ color: 'var(--txt3)' }}>{kva.toLocaleString()}kVA</span>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>×{x.qty}</span>
        {x.customer && <span style={{ color: 'var(--txt3)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.customer}</span>}
        {due && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: dueCol, fontWeight: due < today ? 700 : 400 }}>due {due}</span>}
        {editable && (
          <span title="จำนวนที่ตัดเสร็จจริง — remaining = qty − done" style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--txt3)' }}>เสร็จ</span>
            <input
              type="number" min={0} max={x.qty} value={done}
              onChange={e => updateDoneQty(x.id, parseInt(e.target.value) || 0)}
              style={{ width: 38, fontSize: 10, padding: '1px 3px', borderRadius: 4, border: `1px solid ${done > 0 ? 'var(--amber)' : 'var(--bord2)'}`, background: 'var(--bg2)', color: done > 0 ? 'var(--amber)' : 'var(--txt2)', fontWeight: 700, textAlign: 'center' }} />
            <span style={{ fontSize: 9, color: 'var(--txt3)' }}>/{x.qty}</span>
            {remaining > 0 && done > 0 && <span style={{ fontSize: 9, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>⏭{remaining}</span>}
          </span>
        )}
      </div>
    )
  }

  const doneList   = dedup(weekDoneOrders)
  const carryList  = dedup(weekCarryOrders)
  const unschList  = dedup(weekUnscheduled)
  const manualDone = dedup(weekCompletedManual)

  const shippableQty = sumOrig(manualDone)                 // confirmed cut & shippable
  const carryRemain  = sumRemaining(carryList) + sumRemaining(unschList)

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Ship vs carry headline */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'rgba(166,227,161,.12)', padding: '3px 10px', borderRadius: 8 }}>
          🚚 พร้อมส่ง {shippableQty} ตัว
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', background: 'rgba(249,226,175,.12)', padding: '3px 10px', borderRadius: 8 }}>
          ⏭ ยกไปสัปดาห์หน้า {carryRemain} ตัว
        </span>
        <span style={{ fontSize: 9, color: 'var(--txt3)' }}>กรอก "เสร็จ" = จำนวนที่ตัดจริง · remaining = qty − เสร็จ จะถูกยกไปสัปดาห์หน้า</span>
      </div>

      {manualDone.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('✅ ครบแล้ว (ยืนยัน)', manualDone.length, shippableQty, 'var(--green)')}
          {manualDone.map(o => orderRow(o, true))}
        </div>
      )}
      {doneList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('🔄 ตัดครบตามแผน', doneList.length, sumRemaining(doneList), 'var(--blue)')}
          {doneList.map(o => orderRow(o, true))}
        </div>
      )}
      {carryList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('⏭ ค้างสัปดาห์หน้า', carryList.length, sumRemaining(carryList), 'var(--amber)')}
          <button
            title="ไปสัปดาห์หน้าพร้อมนำงานค้างเข้าแผน"
            onClick={() => { setWeekOffset(w => w + 1); setIncludePrevCarry(true) }}
            style={{ fontSize: 11, padding: '3px 12px', borderRadius: 8, border: '1px solid rgba(249,226,175,.5)', background: 'rgba(249,226,175,.15)', color: 'var(--amber)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            → ดูสัปดาห์หน้า + รวมงานค้าง
          </button>
          {carryList.map(o => orderRow(o, true))}
        </div>
      )}
      {unschList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('❌ ไม่ได้ตั้งแผน', unschList.length, sumRemaining(unschList), 'var(--red)')}
          {unschList.map(o => orderRow(o, true))}
        </div>
      )}
    </div>
  )
}
