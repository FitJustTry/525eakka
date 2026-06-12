import React, { useState, useEffect, useMemo } from 'react'
import type { Order } from '../../../../types'
import { origId as stripOrigId } from '../scheduling/utils'

interface WorkItem { order_id?: string; sap_so: string; customer: string; qty: number }
interface MachineCell { work: WorkItem[] }
interface DayRow { machineCells: MachineCell[] }
interface FullSnap { plan_data: { dayRows: DayRow[] } }

interface ProgressRow {
  key: string; sap_so: string; customer: string
  qty: number; doneQty: number; orderId: string | null
}

interface Props {
  snapId: number
  orders: Order[]
  updateDoneQty: (id: string, n: number) => void
}

export default function SnapshotProgress({ snapId, orders, updateDoneQty }: Props) {
  const [fullSnap, setFullSnap] = useState<FullSnap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/cutting-plan-snapshots/${snapId}`)
      .then(r => r.json()).then(setFullSnap).catch(() => {}).finally(() => setLoading(false))
  }, [snapId])

  const ordersById = useMemo(() => {
    const m = new Map<string, Order>(); orders.forEach(o => m.set(o.id, o)); return m
  }, [orders])

  const orderList = useMemo((): ProgressRow[] => {
    if (!fullSnap) return []
    const seen = new Set<string>()
    const list: ProgressRow[] = []
    for (const row of (fullSnap.plan_data?.dayRows ?? [])) {
      for (const mc of (row.machineCells ?? [])) {
        for (const w of (mc.work ?? [])) {
          const key = w.order_id ? stripOrigId(w.order_id) : w.sap_so
          if (seen.has(key)) continue; seen.add(key)
          let doneQty = 0; let orderId: string | null = null
          if (w.order_id) {
            const o = ordersById.get(stripOrigId(w.order_id)) ?? ordersById.get(w.order_id)
            doneQty = o?.done_qty ?? 0; orderId = o?.id ?? null
          } else {
            const o = orders.find(x => x.sap_so === w.sap_so)
            doneQty = o?.done_qty ?? 0; orderId = o?.id ?? null
          }
          list.push({ key, sap_so: w.sap_so, customer: w.customer, qty: w.qty, doneQty, orderId })
        }
      }
    }
    return list
  }, [fullSnap, ordersById, orders])

  const done = orderList.filter(o => o.doneQty >= o.qty).length
  const rate = orderList.length > 0 ? Math.round(done / orderList.length * 100) : 0
  const rateCol = rate >= 80 ? 'var(--green)' : rate >= 50 ? 'var(--amber)' : 'var(--red)'

  if (loading) return (
    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt3)', borderTop: '1px solid var(--bord)' }}>กำลังโหลด...</div>
  )

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--bord)', background: 'var(--bg)', fontSize: 11 }}>
      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontFamily: 'var(--mono)', fontSize: 14, color: rateCol }}>{rate}%</span>
        <span style={{ color: 'var(--txt3)' }}>เสร็จ {done}/{orderList.length} orders</span>
        <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${rate}%`, height: '100%', background: rateCol, borderRadius: 3, transition: 'width .4s' }} />
        </div>
      </div>

      {/* Per-order rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
        {orderList.map(o => {
          const pct = o.qty > 0 ? Math.min(100, Math.round(o.doneQty / o.qty * 100)) : 0
          const col = pct >= 100 ? 'var(--green)' : pct > 0 ? 'var(--amber)' : 'var(--bord2)'
          return (
            <div key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', minWidth: 78, fontSize: 10, flexShrink: 0 }}>{o.sap_so || o.key.slice(-6)}</span>
              <div style={{ flex: 1, height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', minWidth: 40 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 3, transition: 'width .3s' }} />
              </div>
              <span style={{ minWidth: 38, textAlign: 'right' as const, color: col, fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 10 }}>{o.doneQty}/{o.qty}</span>
              {o.orderId && o.doneQty < o.qty && (
                <button onClick={() => updateDoneQty(o.orderId!, Math.min(o.qty, o.doneQty + 1))}
                  style={{ fontSize: 10, padding: '0 5px', height: 16, borderRadius: 3, border: '1px solid var(--bord2)', background: 'var(--bg3)', cursor: 'pointer', color: 'var(--txt2)', flexShrink: 0 }}>+1</button>
              )}
              {o.orderId && o.doneQty > 0 && (
                <button onClick={() => updateDoneQty(o.orderId!, o.doneQty - 1)}
                  style={{ fontSize: 10, padding: '0 5px', height: 16, borderRadius: 3, border: '1px solid var(--bord2)', background: 'var(--bg3)', cursor: 'pointer', color: 'var(--txt3)', flexShrink: 0 }}>-1</button>
              )}
            </div>
          )
        })}
        {!orderList.length && <div style={{ color: 'var(--txt3)' }}>ไม่พบ orders ใน snapshot นี้</div>}
      </div>
    </div>
  )
}
