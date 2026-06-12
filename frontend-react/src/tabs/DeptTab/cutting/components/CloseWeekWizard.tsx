import React, { useState, useEffect, useMemo } from 'react'
import type { Order } from '../../../../types'
import type { SnapMeta, ResultSummary } from '../hooks/usePlanSnapshots'

const CARRY_REASONS = ['Capacity Shortage', 'Machine Breakdown', 'Material Missing', 'Waiting Approval', 'Other']

interface WorkItem { order_id?: string; sap_so: string; customer: string; kva: number; qty: number; hrsWorked: number; isComplete: boolean }
interface MachineCell { machineId: number; machineName: string; wall: number; capH: number; work: WorkItem[] }
interface DayRow { dStr: string; machineCells: MachineCell[] }
interface FullSnap { plan_data: { summary: { totalQtyWeek: number }; dayRows: DayRow[] }; planned_finish_dates: Record<string, string> }

interface OrderRow {
  key: string; sap_so: string; customer: string; kva: number
  plannedQty: number; doneQty: number; remaining: number
  plannedFinish: string; status: 'completed' | 'partial' | 'not_started'
  orderId: string | null; doneAt: string | null
}

interface Props {
  snap: SnapMeta
  orders: Order[]
  origId: (id: string) => string
  onClose: () => void
  onConfirm: (summary: ResultSummary) => Promise<void>
  onCarryForward?: (ids: string[], nextMonDate: string) => void
}

const sCol = (s: OrderRow['status']) => s === 'completed' ? 'var(--green)' : s === 'partial' ? 'var(--amber)' : 'var(--red)'

function getAccuracy(plannedFinish: string, doneAt: string | null) {
  if (!plannedFinish || !doneAt) return null
  const days = Math.round((new Date(doneAt.slice(0, 10)).getTime() - new Date(plannedFinish).getTime()) / 86400000)
  if (days < -1) return { label: `▲ เร็ว ${-days}d`, color: 'var(--blue)', days }
  if (days <= 2) return { label: '✓ ตรงเวลา', color: 'var(--green)', days }
  return { label: `▼ ช้า +${days}d`, color: 'var(--red)', days }
}

export default function CloseWeekWizard({ snap, orders, origId, onClose, onConfirm, onCarryForward }: Props) {
  const [step, setStep] = useState(1)
  const [fullSnap, setFullSnap] = useState<FullSnap | null>(null)
  const [loading, setLoading] = useState(true)
  const [carryReasons, setCarryReasons] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<ResultSummary | null>(null)
  const [carriedForward, setCarriedForward] = useState(false)
  const [carryingForward, setCarryingForward] = useState(false)

  useEffect(() => {
    fetch(`/api/cutting-plan-snapshots/${snap.id}`)
      .then(r => r.json()).then(setFullSnap).catch(() => {}).finally(() => setLoading(false))
  }, [snap.id])

  // Next Monday after week_end (Saturday + 2)
  const nextMonDate = useMemo(() => {
    const d = new Date(snap.week_end); d.setDate(d.getDate() + 2)
    return d.toISOString().slice(0, 10)
  }, [snap.week_end])

  const ordersById = useMemo(() => {
    const m = new Map<string, Order>(); orders.forEach(o => m.set(o.id, o)); return m
  }, [orders])

  const orderList = useMemo((): OrderRow[] => {
    if (!fullSnap) return []
    const seen = new Set<string>(); const list: OrderRow[] = []
    const pfd = fullSnap.planned_finish_dates ?? {}
    for (const row of (fullSnap.plan_data?.dayRows ?? [])) {
      for (const mc of (row.machineCells ?? [])) {
        for (const w of (mc.work ?? [])) {
          const key = w.order_id ? origId(w.order_id) : w.sap_so
          if (seen.has(key)) continue; seen.add(key)
          let doneQty = 0; let orderId: string | null = null; let doneAt: string | null = null
          if (w.order_id) {
            const o = ordersById.get(origId(w.order_id)) ?? ordersById.get(w.order_id)
            doneQty = o?.done_qty ?? 0; orderId = o?.id ?? null; doneAt = o?.done_at ?? null
          } else {
            const o = orders.find(x => x.sap_so === w.sap_so)
            doneQty = o?.done_qty ?? 0; orderId = o?.id ?? null; doneAt = o?.done_at ?? null
          }
          const remaining = Math.max(0, w.qty - doneQty)
          list.push({ key, sap_so: w.sap_so, customer: w.customer, kva: w.kva, plannedQty: w.qty,
            doneQty, remaining, plannedFinish: pfd[key] ?? '',
            status: doneQty >= w.qty ? 'completed' : doneQty > 0 ? 'partial' : 'not_started',
            orderId, doneAt })
        }
      }
    }
    return list
  }, [fullSnap, ordersById, orders, origId])

  const completed = useMemo(() => orderList.filter(o => o.status === 'completed'), [orderList])
  const unfinished = useMemo(() => orderList.filter(o => o.status !== 'completed'), [orderList])

  const machineStats = useMemo(() => {
    if (!fullSnap) return { best: '', bottleneck: '' }
    const stats: Record<number, { name: string; wall: number; capH: number }> = {}
    for (const row of (fullSnap.plan_data?.dayRows ?? [])) {
      for (const mc of (row.machineCells ?? [])) {
        if (!stats[mc.machineId]) stats[mc.machineId] = { name: mc.machineName, wall: 0, capH: 0 }
        stats[mc.machineId].wall += mc.wall ?? 0; stats[mc.machineId].capH += mc.capH ?? 0
      }
    }
    const entries = Object.values(stats).filter(s => s.capH > 0)
    if (!entries.length) return { best: '', bottleneck: '' }
    entries.sort((a, b) => (b.wall / b.capH) - (a.wall / a.capH))
    return { bottleneck: entries[0]?.name ?? '', best: entries[entries.length - 1]?.name ?? '' }
  }, [fullSnap])

  const completionRate = orderList.length > 0 ? Math.round(completed.length / orderList.length * 1000) / 10 : 0

  // Accuracy stats
  const accuracyData = useMemo(() =>
    orderList.map(o => {
      if (!o.doneAt || !o.plannedFinish) return null
      return Math.round((new Date(o.doneAt.slice(0, 10)).getTime() - new Date(o.plannedFinish).getTime()) / 86400000)
    }).filter((d): d is number => d !== null)
  , [orderList])

  async function handleConfirm() {
    setConfirming(true)
    const avg_delay_days = accuracyData.length > 0 ? Math.round(accuracyData.reduce((a, b) => a + b, 0) / accuracyData.length) : 0
    const summary: ResultSummary = {
      planned_count: orderList.length,
      completed_count: completed.length,
      partial_count: orderList.filter(o => o.status === 'partial').length,
      not_started_count: orderList.filter(o => o.status === 'not_started').length,
      completion_rate: completionRate,
      carry_count: unfinished.length,
      carry_orders: unfinished.map(o => ({ key: o.key, sap_so: o.sap_so, reason: carryReasons[o.key] ?? 'Capacity Shortage', remaining_qty: o.remaining })),
      best_machine: machineStats.best,
      bottleneck_machine: machineStats.bottleneck,
      avg_delay_days,
      on_time_count: accuracyData.filter(d => d <= 2).length,
      late_count: accuracyData.filter(d => d > 2).length,
      early_count: accuracyData.filter(d => d < -1).length,
    }
    try { await onConfirm(summary); setResult(summary); setDone(true) } catch (e) { alert(String(e)) }
    setConfirming(false)
  }

  async function handleCarryForward() {
    setCarryingForward(true)
    const ids = unfinished.map(o => o.orderId).filter((id): id is string => !!id)
    await Promise.all(ids.map(id =>
      fetch(`/api/orders/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_date: nextMonDate })
      }).catch(() => {})
    ))
    onCarryForward?.(ids, nextMonDate)
    setCarriedForward(true)
    setCarryingForward(false)
  }

  // ── Styles ──
  const ov: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const modal: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--bord)', borderRadius: 14, width: 820, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
  const tbl: React.CSSProperties = { borderCollapse: 'collapse', width: '100%', fontSize: 11 }
  const th: React.CSSProperties = { textAlign: 'left', padding: '5px 8px', background: 'var(--bg3)', borderBottom: '1px solid var(--bord)', fontWeight: 700, color: 'var(--txt2)', whiteSpace: 'nowrap' as const }
  const td: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid var(--bord)' }
  const btn = (col = 'var(--blue)', disabled = false) => ({ padding: '6px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', background: `${col}18`, color: col, border: `1px solid ${col}44`, opacity: disabled ? 0.5 : 1 } as React.CSSProperties)
  const STEPS = ['1 · Review', '2 · Carry Reasons', '3 · Confirm']

  if (loading) return (
    <div style={ov}><div style={{ ...modal, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <span style={{ color: 'var(--txt3)', fontSize: 13 }}>กำลังโหลดข้อมูลแผน…</span>
    </div></div>
  )

  return (
    <div style={ov} onClick={e => { if (e.target === e.currentTarget && !confirming) onClose() }}>
      <div style={modal}>
        {/* Header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--bord)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🏁</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>ปิดสัปดาห์ — {snap.week_start} – {snap.week_end}</div>
            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{snap.label}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Step bar */}
        {!done && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 20px', borderBottom: '1px solid var(--bord)', background: 'var(--bg2)' }}>
            {STEPS.map((s, i) => {
              const n = i + 1; const active = step === n; const past = step > n
              const col = active ? 'var(--blue)' : past ? 'var(--green)' : 'var(--txt3)'
              return (
                <React.Fragment key={s}>
                  <span style={{ fontSize: 11, color: col, fontWeight: active ? 700 : 400 }}>{past ? `✓ ${s}` : s}</span>
                  {i < STEPS.length - 1 && <span style={{ fontSize: 10, color: 'var(--txt3)', margin: '0 4px' }}>›</span>}
                </React.Fragment>
              )
            })}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

          {/* Step 1: Review + Planned vs Actual */}
          {!done && step === 1 && (<>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: 'rgba(166,227,161,.12)', color: 'var(--green)', fontWeight: 700 }}>✅ เสร็จ {completed.length}</span>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: 'rgba(249,226,175,.12)', color: 'var(--amber)', fontWeight: 700 }}>⏭ ค้าง {unfinished.length}</span>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: 'rgba(137,180,250,.12)', color: 'var(--blue)', fontWeight: 700 }}>📊 {completionRate}% completion</span>
              {accuracyData.length > 0 && (() => {
                const late = accuracyData.filter(d => d > 2).length
                const onTime = accuracyData.filter(d => d <= 2 && d >= -1).length
                const early = accuracyData.filter(d => d < -1).length
                return <>
                  {early > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: 'rgba(137,180,250,.1)', color: 'var(--blue)', fontWeight: 700 }}>▲ เร็วกว่า {early}</span>}
                  {onTime > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: 'rgba(166,227,161,.1)', color: 'var(--green)', fontWeight: 700 }}>✓ ตรงเวลา {onTime}</span>}
                  {late > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: 'rgba(224,90,78,.1)', color: 'var(--red)', fontWeight: 700 }}>▼ ช้า {late}</span>}
                </>
              })()}
            </div>
            <table style={tbl}><thead><tr>
              {['SAP SO','ลูกค้า','kVA','แผน','เสร็จ','ค้าง','Planned Finish','Actual Done','Accuracy','สถานะ'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead><tbody>
              {orderList.map(o => {
                const acc = getAccuracy(o.plannedFinish, o.doneAt)
                return (
                  <tr key={o.key} style={{ background: o.status === 'completed' ? 'rgba(166,227,161,.04)' : o.status === 'partial' ? 'rgba(249,226,175,.04)' : 'rgba(224,90,78,.04)' }}>
                    <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{o.sap_so || o.key.slice(-8)}</td>
                    <td style={{ ...td, color: 'var(--txt2)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{o.customer}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', textAlign: 'right' as const }}>{o.kva?.toLocaleString()}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', textAlign: 'center' as const }}>{o.plannedQty}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', textAlign: 'center' as const, color: 'var(--green)', fontWeight: 700 }}>{o.doneQty || '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', textAlign: 'center' as const, color: o.remaining > 0 ? 'var(--amber)' : 'var(--txt3)' }}>{o.remaining || '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt3)' }}>{o.plannedFinish || '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt3)' }}>{o.doneAt ? o.doneAt.slice(0, 10) : '—'}</td>
                    <td style={td}>
                      {acc
                        ? <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: `${acc.color}15`, color: acc.color, fontWeight: 700, whiteSpace: 'nowrap' as const }}>{acc.label}</span>
                        : <span style={{ fontSize: 10, color: 'var(--txt3)' }}>—</span>}
                    </td>
                    <td style={td}><span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: `${sCol(o.status)}18`, color: sCol(o.status), fontWeight: 700 }}>
                      {o.status === 'completed' ? '✅ เสร็จ' : o.status === 'partial' ? '⏭ บางส่วน' : '❌ ยังไม่เริ่ม'}
                    </span></td>
                  </tr>
                )
              })}
              {!orderList.length && <tr><td colSpan={10} style={{ ...td, textAlign: 'center' as const, color: 'var(--txt3)', padding: 28 }}>ไม่พบ orders ใน snapshot นี้</td></tr>}
            </tbody></table>
          </>)}

          {/* Step 2: Carry Reasons */}
          {!done && step === 2 && (
            unfinished.length === 0
              ? <div style={{ textAlign: 'center', padding: 48, color: 'var(--green)', fontSize: 14 }}>🎉 ทุก order เสร็จแล้ว — ไม่มีงานค้าง!</div>
              : (<>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 12 }}>ระบุสาเหตุที่งานยังไม่เสร็จสำหรับ {unfinished.length} orders</div>
                <table style={tbl}><thead><tr>
                  {['SAP SO','ลูกค้า','ค้าง (ตัว)','สาเหตุ'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr></thead><tbody>
                  {unfinished.map(o => (
                    <tr key={o.key}>
                      <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{o.sap_so || o.key.slice(-8)}</td>
                      <td style={{ ...td, color: 'var(--txt2)' }}>{o.customer}</td>
                      <td style={{ ...td, fontFamily: 'var(--mono)', textAlign: 'center' as const, color: 'var(--amber)', fontWeight: 700 }}>{o.remaining}</td>
                      <td style={td}>
                        <select value={carryReasons[o.key] ?? 'Capacity Shortage'}
                          onChange={e => setCarryReasons(r => ({ ...r, [o.key]: e.target.value }))}
                          style={{ background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 4, color: 'var(--txt)', fontSize: 11, padding: '2px 6px', width: '100%' }}>
                          {CARRY_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody></table>
              </>)
          )}

          {/* Step 3: Confirm */}
          {!done && step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--bord)', padding: '16px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📊 สรุปผลสัปดาห์ {snap.week_start} – {snap.week_end}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                  {[
                    { l: 'วางแผน', v: String(orderList.length), col: 'var(--blue)' },
                    { l: 'เสร็จแล้ว', v: String(completed.length), col: 'var(--green)' },
                    { l: 'ค้างสัปดาห์หน้า', v: String(unfinished.length), col: 'var(--amber)' },
                  ].map(i => (
                    <div key={i.l} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' as const }}>
                      <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 2 }}>{i.l}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: i.col }}>{i.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 2 }}>Completion Rate</div>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: completionRate >= 90 ? 'var(--green)' : completionRate >= 70 ? 'var(--amber)' : 'var(--red)' }}>{completionRate}%</div>
                  </div>
                  {machineStats.best && <div style={{ background: 'rgba(166,227,161,.08)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 2 }}>Best Machine</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{machineStats.best}</div>
                  </div>}
                  {machineStats.bottleneck && <div style={{ background: 'rgba(224,90,78,.08)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 2 }}>Bottleneck</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{machineStats.bottleneck}</div>
                  </div>}
                </div>
                {/* Accuracy summary */}
                {accuracyData.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
                    {[
                      { l: '▲ เร็วกว่าแผน', v: accuracyData.filter(d => d < -1).length, col: 'var(--blue)' },
                      { l: '✓ ตรงเวลา', v: accuracyData.filter(d => d <= 2 && d >= -1).length, col: 'var(--green)' },
                      { l: '▼ ช้ากว่าแผน', v: accuracyData.filter(d => d > 2).length, col: 'var(--red)' },
                    ].map(i => (
                      <div key={i.l} style={{ background: `${i.col}08`, borderRadius: 8, padding: '8px 14px', textAlign: 'center' as const, border: `1px solid ${i.col}22` }}>
                        <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 2 }}>{i.l}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: i.col }}>{i.v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {unfinished.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--txt3)', background: 'rgba(249,226,175,.08)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(249,226,175,.2)' }}>
                  ⚠ {unfinished.length} orders จะถูกบันทึกเป็นงานค้างพร้อมสาเหตุ
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
                การยืนยันจะเปลี่ยนสถานะเป็น <strong>🏁 Completed</strong> และไม่สามารถแก้ไขได้อีก
              </div>
            </div>
          )}

          {/* Done: Result Banner */}
          {done && result && (() => {
            const col = result.completion_rate >= 90 ? 'var(--green)' : result.completion_rate >= 70 ? 'var(--amber)' : 'var(--red)'
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
                <div style={{ fontSize: 36 }}>🏁</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>ปิดสัปดาห์เรียบร้อย</div>
                <div style={{ background: 'var(--bg2)', borderRadius: 12, border: `1px solid ${col}44`, padding: '20px 32px', textAlign: 'center' as const, minWidth: 300, width: '100%', maxWidth: 460 }}>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 8 }}>{snap.week_start} – {snap.week_end} · {snap.label}</div>
                  <div style={{ fontSize: 52, fontWeight: 900, fontFamily: 'var(--mono)', color: col, lineHeight: 1 }}>{result.completion_rate}%</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4, marginBottom: 16 }}>Completion Rate</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                    {[['var(--blue)', result.planned_count, 'Planned'],['var(--green)', result.completed_count, 'Completed'],['var(--amber)', result.carry_count, 'Carry Over']].map(([c, v, l]) => (
                      <div key={String(l)}><div style={{ fontWeight: 800, fontSize: 22, fontFamily: 'var(--mono)', color: String(c) }}>{v}</div><div style={{ fontSize: 10, color: 'var(--txt3)' }}>{l}</div></div>
                    ))}
                  </div>
                  {/* Accuracy mini-row */}
                  {(result.on_time_count + result.late_count + result.early_count) > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12, fontSize: 10 }}>
                      <div style={{ color: 'var(--blue)' }}><div style={{ fontWeight: 700 }}>{result.early_count}</div><div style={{ color: 'var(--txt3)' }}>▲ เร็ว</div></div>
                      <div style={{ color: 'var(--green)' }}><div style={{ fontWeight: 700 }}>{result.on_time_count}</div><div style={{ color: 'var(--txt3)' }}>✓ ตรงเวลา</div></div>
                      <div style={{ color: 'var(--red)' }}><div style={{ fontWeight: 700 }}>{result.late_count}</div><div style={{ color: 'var(--txt3)' }}>▼ ช้า</div></div>
                    </div>
                  )}
                  {(result.best_machine || result.bottleneck_machine) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 10 }}>
                      {result.best_machine && <div style={{ background: 'rgba(166,227,161,.12)', borderRadius: 6, padding: '6px 10px' }}><div style={{ color: 'var(--txt3)' }}>Best</div><div style={{ color: 'var(--green)', fontWeight: 700 }}>{result.best_machine}</div></div>}
                      {result.bottleneck_machine && <div style={{ background: 'rgba(224,90,78,.12)', borderRadius: 6, padding: '6px 10px' }}><div style={{ color: 'var(--txt3)' }}>Bottleneck</div><div style={{ color: 'var(--red)', fontWeight: 700 }}>{result.bottleneck_machine}</div></div>}
                    </div>
                  )}
                </div>

                {/* Auto Carry Forward section */}
                {unfinished.length > 0 && !carriedForward && (
                  <div style={{ width: '100%', maxWidth: 460, background: 'rgba(249,226,175,.08)', borderRadius: 10, border: '1px solid rgba(249,226,175,.25)', padding: '14px 18px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 6 }}>↩ ส่งงานค้างสัปดาห์หน้า</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 10 }}>
                      {unfinished.length} orders ({unfinished.reduce((s, o) => s + o.remaining, 0)} ตัว) → plan_date: <strong style={{ color: 'var(--txt2)' }}>{nextMonDate}</strong>
                    </div>
                    <button onClick={handleCarryForward} disabled={carryingForward}
                      style={{ fontSize: 11, padding: '5px 16px', borderRadius: 8, border: '1px solid rgba(249,226,175,.4)', background: 'rgba(249,226,175,.15)', color: 'var(--amber)', cursor: carryingForward ? 'wait' : 'pointer', fontWeight: 700, opacity: carryingForward ? 0.6 : 1 }}>
                      {carryingForward ? 'กำลังอัปเดต…' : `↩ ย้าย ${unfinished.length} orders → สัปดาห์หน้า`}
                    </button>
                  </div>
                )}
                {carriedForward && (
                  <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
                    ✅ ย้าย {unfinished.length} orders ไปสัปดาห์ {nextMonDate} เรียบร้อย
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bord)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {!done && step > 1 && <button style={btn('var(--txt3)', confirming)} onClick={() => setStep(s => s - 1)} disabled={confirming}>‹ ย้อนกลับ</button>}
          {!done && step < 3 && <button style={btn()} onClick={() => setStep(s => s + 1)}>ถัดไป ›</button>}
          {!done && step === 3 && <button style={btn('var(--green)', confirming)} onClick={handleConfirm} disabled={confirming}>{confirming ? 'กำลังบันทึก…' : '🏁 ยืนยัน ปิดสัปดาห์'}</button>}
          {done && <button style={btn()} onClick={onClose}>✕ ปิด</button>}
        </div>
      </div>
    </div>
  )
}
