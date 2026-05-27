import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { api } from '../../api'
import { getCommittedLoadMap, getLoadInfo, loadBadge, effectiveHrs } from '../../utils/capacity'
import { addWorkDaysReal, diffDays, fmtDateTH } from '../../utils/dates'
import type { Order, Product, WCConfig } from '../../types'

interface SimResult {
  product: Product; pk: string; qty: number; deadlineDays: number
  wcNeeds: Record<string, number>; wcNeedsSTD: Record<string, number>
  effectiveTotalHrs: number
  bottlenecks: Array<{ wc: string; neededHrs: number; freeHrs: number; stdHrs: number; eff: number; extraNeeded: number; newLoadPct: number; otFeasible: boolean }>
  finishNormal: Date; finishOT: Date; deadline: Date
  onTimeNormal: boolean; onTimeOT: boolean; totalOThrs: number; maxDaysNeeded: number
}

const s: Record<string, React.CSSProperties> = {
  panel: { flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' },
  card: { background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 12, padding: '1.125rem 1.25rem', marginBottom: 12 },
  title: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { fontSize: 11, color: 'var(--txt2)', marginBottom: 5, display: 'block', fontWeight: 500 },
  select: { width: '100%', fontSize: 13, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 8, color: 'var(--txt)', fontFamily: 'inherit', outline: 'none' },
  input:  { width: '100%', fontSize: 13, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 8, color: 'var(--txt)', fontFamily: 'inherit', outline: 'none' },
  btnPrimary: { width: '100%', background: 'var(--amber)', border: 'none', color: '#000', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnGreen:   { background: 'var(--green)', border: 'none', color: '#000', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost:   { background: 'transparent', border: '1px solid var(--bord2)', color: 'var(--txt2)', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
}

function badge(cls: string, text: string) {
  const bg: Record<string, string> = { 'b-ok': 'rgba(76,175,125,.15)', 'b-warn': 'rgba(224,156,42,.15)', 'b-red': 'rgba(224,90,78,.15)', 'b-ot': 'rgba(108,61,168,.15)' }
  const col: Record<string, string> = { 'b-ok': 'var(--green)', 'b-warn': 'var(--amber)', 'b-red': 'var(--red)', 'b-ot': 'var(--purple)' }
  return <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: bg[cls], color: col[cls], border: `1px solid ${col[cls]}40` }}>{text}</span>
}

export default function SimulateTab() {
  const { state, dispatch } = useApp()
  const { orders, products, wcConfig, openLoad, holidays, factoryHolidays } = state

  const [productKey, setProductKey] = useState(Object.keys(products)[0] ?? '')
  const [qty, setQty] = useState(1)
  const [deadlineDays, setDeadlineDays] = useState(14)
  const [result, setResult] = useState<SimResult | null>(null)

  const loadMap = useMemo(
    () => getCommittedLoadMap(orders, products, wcConfig, openLoad),
    [orders, products, wcConfig, openLoad]
  )

  const totalStdHrs = useMemo(
    () => orders.reduce((a, o) => a + (products[o.product]?.std_hrs ?? 0) * o.qty, 0),
    [orders, products]
  )

  function simulate(pk: string, q: number, dDays: number): SimResult | null {
    const product = products[pk]
    if (!product) return null
    const wcNeeds: Record<string, number> = {}
    const wcNeedsSTD: Record<string, number> = {}
    for (const op of product.ops) {
      const effH = effectiveHrs(op.wc, op.hrs, wcConfig) * q
      wcNeeds[op.wc]    = (wcNeeds[op.wc]    ?? 0) + effH
      wcNeedsSTD[op.wc] = (wcNeedsSTD[op.wc] ?? 0) + op.hrs * q
    }
    const bottlenecks: Array<{ wc: string; neededHrs: number; freeHrs: number; stdHrs: number; eff: number; extraNeeded: number; newLoadPct: number; otFeasible: boolean }> = []
    let maxDaysNeeded = 0
    for (const [wc, neededHrs] of Object.entries(wcNeeds)) {
      if (neededHrs === 0) continue
      const info = getLoadInfo(wc, loadMap, wcConfig)
      const cap = info.cap
      const dailyNormal  = (cap.weekday_normal + cap.sat_normal) / 6
      const dailyWithOT  = (cap.weekday_normal + cap.weekday_ot + cap.sat_normal + cap.sat_ot) / 6
      const freeHrs = info.freehrs
      if (neededHrs <= freeHrs) {
        maxDaysNeeded = Math.max(maxDaysNeeded, Math.ceil(neededHrs / dailyNormal))
        continue
      }
      const extraNeeded  = neededHrs - freeHrs
      const weeksNeeded  = Math.ceil(dDays / 7)
      const weeklyOTAvail = cap.weekday_ot + cap.sat_ot
      bottlenecks.push({
        wc, neededHrs, freeHrs,
        stdHrs: Math.round((wcNeedsSTD[wc] ?? 0) * 10) / 10,
        eff: wcConfig[wc]?.eff ?? 90,
        extraNeeded: Math.round(extraNeeded * 10) / 10,
        newLoadPct: Math.round((info.load + neededHrs) / cap.normal * 100),
        otFeasible: extraNeeded <= weeklyOTAvail * weeksNeeded,
      })
      maxDaysNeeded = Math.max(maxDaysNeeded, Math.ceil(neededHrs / dailyWithOT))
    }
    const today = new Date()
    const finishNormal = addWorkDaysReal(today, maxDaysNeeded, holidays, factoryHolidays)
    const finishOT     = addWorkDaysReal(today, Math.max(1, Math.ceil(maxDaysNeeded * 0.65)), holidays, factoryHolidays)
    const deadline     = addWorkDaysReal(today, dDays, holidays, factoryHolidays)
    const onTimeNormal = finishNormal <= deadline
    const onTimeOT     = finishOT <= deadline
    const totalOThrs   = Math.round(bottlenecks.reduce((a, b) => a + b.extraNeeded, 0) * 10) / 10
    const effectiveTotalHrs = Object.values(wcNeeds).reduce((a, b) => a + b, 0)
    return { product, pk, qty: q, deadlineDays: dDays, wcNeeds, wcNeedsSTD, effectiveTotalHrs, bottlenecks, finishNormal, finishOT, deadline, onTimeNormal, onTimeOT, totalOThrs, maxDaysNeeded }
  }

  function handleSimulate() { setResult(simulate(productKey, qty, deadlineDays)) }

  async function handleAccept() {
    if (!result) return
    const dl = result.deadline.toISOString().slice(0, 10)
    const order: Order = {
      id: 'ORD-' + String(Date.now()).slice(-6),
      product: result.pk, qty: result.qty, deadline: dl,
      customer: 'ลูกค้าใหม่', kva: products[result.pk]?.kva ?? 0,
      category: 'หลัก', sap_so: '', plan_date: null, comment: '',
    }
    await api.orders.upsert(order)
    dispatch({ type: 'SET_ORDERS', orders: [...orders, order] })
    setResult(null)
  }

  async function handleRemove(id: string) {
    await api.orders.delete(id)
    dispatch({ type: 'SET_ORDERS', orders: orders.filter(o => o.id !== id) })
  }

  const prod = products[productKey]

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{ ...s.panel, maxWidth: 420, borderRight: '1px solid var(--bord)', flexShrink: 0 }}>
        <div style={s.card}>
          <div style={s.title}>📦 ข้อมูล Order ใหม่</div>
          <div style={s.field}>
            <label style={s.label}>ประเภทสินค้า / รุ่น</label>
            <select style={s.select} value={productKey} onChange={e => setProductKey(e.target.value)}>
              {Object.entries(products).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={s.field}>
            <label style={s.label}>จำนวน (หน่วย)</label>
            <input style={s.input} type="number" min={1} max={20} value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
            {prod && <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>STD: {(prod.std_hrs * qty).toFixed(2)} ชั่วโมง ({prod.ops.length} operations)</div>}
          </div>
          <div style={s.field}>
            <label style={s.label}>Deadline — ลูกค้าต้องการรับงานใน</label>
            <select style={s.select} value={deadlineDays} onChange={e => setDeadlineDays(parseInt(e.target.value))}>
              {[7,14,21,30,45,60,90].map(d => <option key={d} value={d}>{d} วัน</option>)}
            </select>
          </div>
          <button style={s.btnPrimary} onClick={handleSimulate}>คำนวณ Capacity →</button>
        </div>

        <div style={s.card}>
          <div style={s.title}>📋 Master Plan ({orders.length} orders)</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {(['ทั้งหมด','หลัก','เสริม','Fast'] as const).map((cat, i) => {
              const count = cat === 'ทั้งหมด' ? orders.length : orders.filter(o => o.category === cat).length
              const colors = ['var(--txt2)','var(--blue)','var(--green)','var(--red)']
              return <span key={cat} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--bord2)', color: colors[i] }}>{cat} <strong>{count}</strong></span>
            })}
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {orders.map(o => {
              const dl = new Date(o.deadline)
              const daysLeft = Math.round((dl.getTime() - Date.now()) / 86400000)
              const urgent = daysLeft < 0
              const catColor = o.category === 'หลัก' ? 'var(--blue)' : o.category === 'Fast' ? 'var(--red)' : 'var(--green)'
              return (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--bord)', fontSize: 12 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', width: 56, flexShrink: 0 }}>{o.id}</div>
                  <div style={{ width: 22, flexShrink: 0, fontSize: 9, color: catColor, fontWeight: 700 }}>{(o.category ?? '').slice(0, 2)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customer} {o.kva ? o.kva + 'kVA' : ''}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{o.sap_so}</div>
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: urgent ? 'var(--red)' : daysLeft <= 7 ? 'var(--amber)' : 'var(--txt3)', flexShrink: 0, textAlign: 'right' }}>
                    {urgent ? 'เกิน' : 'อีก'} {Math.abs(daysLeft)}วัน
                  </div>
                  <button onClick={() => handleRemove(o.id)} style={{ ...s.btnGhost, padding: '2px 6px', fontSize: 10, flexShrink: 0 }}>✕</button>
                </div>
              )
            })}
          </div>
          <div style={{ height: 1, background: 'var(--bord)', margin: '12px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--txt2)' }}>
            <span>รวม STD Hours:</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{totalStdHrs.toFixed(0)} hrs</span>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={s.panel} id="sim-result">
        {!result ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--txt3)' }}>
            <div style={{ fontSize: 48 }}>🧮</div>
            <div style={{ fontSize: 14 }}>เลือกสินค้าและกด "คำนวณ Capacity"</div>
          </div>
        ) : <SimResultPanel r={result} onAccept={handleAccept} onRecalc={handleSimulate} loadMap={loadMap} wcConfig={wcConfig} />}
      </div>
    </div>
  )
}

function SimResultPanel({ r, onAccept, onRecalc, loadMap, wcConfig }: {
  r: SimResult
  onAccept: () => void; onRecalc: () => void
  loadMap: Record<string, number>; wcConfig: Record<string, WCConfig>
}) {
  const sc1_late = diffDays(r.deadline, r.finishNormal)
  const sc2_late = diffDays(r.deadline, r.finishOT)

  return (
    <>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 12, padding: '1.125rem 1.25rem', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{r.product.label}</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>
              จำนวน {r.qty} หน่วย · STD <span style={{ fontFamily: 'var(--mono)' }}>{(r.product.std_hrs * r.qty).toFixed(1)}</span> ชม. →
              Effective <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{r.effectiveTotalHrs.toFixed(1)}</span> ชม.
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>deadline ใน</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)', color: r.deadlineDays <= 14 ? 'var(--red)' : 'var(--amber)' }}>{r.deadlineDays}</div>
            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>วัน</div>
          </div>
        </div>
        {Object.entries(r.wcNeeds).filter(([, h]) => h > 0).map(([wc, effHrs]) => {
          const info = getLoadInfo(wc, loadMap, wcConfig)
          const newPct = Math.round((info.load + effHrs) / info.cap.normal * 100)
          const eff = wcConfig[wc]?.eff ?? 90
          const stdHrs = r.wcNeedsSTD[wc] ?? effHrs
          const gap = effHrs - stdHrs
          return (
            <div key={wc} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--bord)', fontSize: 11 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: newPct >= 100 ? 'var(--red)' : eff < 85 ? 'var(--amber)' : 'var(--green)', flexShrink: 0 }} />
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', width: 52, flexShrink: 0 }}>{wc}</div>
              <div style={{ flex: 1, color: newPct >= 100 ? 'var(--red)' : 'var(--txt2)', fontWeight: newPct >= 100 ? 700 : 400 }}>{wcConfig[wc]?.name ?? wc}{newPct >= 100 ? ' ⚠' : ''}</div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginRight: 4 }}>STD <span style={{ fontFamily: 'var(--mono)' }}>{stdHrs.toFixed(1)}</span>h {gap > 0.05 && <span style={{ color: 'var(--red)' }}>+{gap.toFixed(1)}h</span>}</div>
              {badge(eff >= 90 ? 'b-ok' : eff >= 80 ? 'b-warn' : 'b-red', `Eff ${eff}%`)}
              {badge(loadBadge(newPct), `Load ${newPct}%`)}
            </div>
          )
        })}
      </div>

      {/* 3 Scenarios */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 12, padding: '1.125rem 1.25rem', marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 12 }}>3 สถานการณ์ที่เป็นไปได้</div>
        {[
          { label: 'สถานการณ์ 1', desc: 'ทำงานปกติ — ไม่ OT', date: r.finishNormal, late: sc1_late, ot: 0, ok: r.onTimeNormal, col: 'var(--blue)' },
          { label: 'สถานการณ์ 2', desc: 'ทำ OT ที่ Bottleneck', date: r.finishOT, late: sc2_late, ot: r.totalOThrs, ok: r.onTimeOT, col: '#9b7fe8' },
          { label: 'สถานการณ์ 3', desc: 'เจรจา Deadline ใหม่', date: r.finishNormal, late: sc1_late, ot: 0, ok: null, col: 'var(--amber)' },
        ].map((sc, i) => (
          <div key={i} style={{ background: (i === 0 && r.onTimeNormal) || (i === 1 && !r.onTimeNormal && r.onTimeOT) ? 'rgba(76,175,125,.07)' : 'var(--bg3)', border: `1px solid ${(i === 0 && r.onTimeNormal) || (i === 1 && !r.onTimeNormal && r.onTimeOT) ? 'rgba(76,175,125,.3)' : 'var(--bord)'}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: sc.col + '20', color: sc.col }}>{sc.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{sc.desc}</span>
              {sc.ok === true && badge('b-ok', '✓ ทัน')}
              {sc.ok === false && badge('b-red', '✗ ไม่ทัน')}
              {sc.ok === null && badge('b-warn', 'เจรจา')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: (sc.ok ?? true) ? 'var(--green)' : sc.late > 0 ? 'var(--red)' : 'var(--amber)' }}>{fmtDateTH(sc.date)}</div><div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 2 }}>วันที่คาดเสร็จ</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: sc.late > 0 ? 'var(--red)' : sc.late < 0 ? 'var(--green)' : 'var(--txt)' }}>{sc.late > 0 ? '+' + sc.late : sc.late} วัน</div><div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 2 }}>เทียบ deadline</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: sc.ot > 0 ? '#9b7fe8' : 'var(--txt)' }}>{sc.ot}</div><div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 2 }}>ชม. OT</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Decision */}
      {r.onTimeNormal ? (
        <div style={{ borderRadius: 12, padding: '1.25rem', marginBottom: 12, border: '1.5px solid rgba(76,175,125,.3)', background: 'rgba(76,175,125,.07)' }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>รับ Order ได้ทันที — ไม่ต้อง OT</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12 }}>Capacity เพียงพอ เสร็จก่อน deadline {Math.abs(diffDays(r.deadline, r.finishNormal))} วัน</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onAccept} style={{ background: 'var(--green)', border: 'none', color: '#000', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✓ รับ Order นี้</button>
            <button onClick={onRecalc} style={{ background: 'transparent', border: '1px solid var(--bord2)', color: 'var(--txt2)', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>คำนวณใหม่</button>
          </div>
        </div>
      ) : r.onTimeOT ? (
        <div style={{ borderRadius: 12, padding: '1.25rem', marginBottom: 12, border: '1.5px solid rgba(224,156,42,.3)', background: 'rgba(224,156,42,.07)' }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>⚡</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--amber)' }}>รับได้ — แต่ต้องทำ OT {r.totalOThrs} ชม.</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 8 }}>Bottleneck: {r.bottlenecks.map(b => b.wc).join(', ')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onAccept} style={{ background: 'var(--amber)', border: 'none', color: '#000', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>⚡ รับ + วางแผน OT</button>
            <button onClick={onRecalc} style={{ background: 'transparent', border: '1px solid var(--bord2)', color: 'var(--txt2)', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>คำนวณใหม่</button>
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 12, padding: '1.25rem', marginBottom: 12, border: '1.5px solid rgba(224,90,78,.3)', background: 'rgba(224,90,78,.07)' }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>❌</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>รับไม่ได้ภายใน Deadline นี้</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 8 }}>เร็วที่สุด: {fmtDateTH(r.finishNormal)} · Bottleneck: {r.bottlenecks.map(b => b.wc).join(', ')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: 'var(--amber)', border: 'none', color: '#000', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>เจรจา Deadline → {fmtDateTH(r.finishNormal)}</button>
          </div>
        </div>
      )}
    </>
  )
}
