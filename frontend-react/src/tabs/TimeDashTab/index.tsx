import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { effectiveHrs } from '../../utils/capacity'

const DEPTS: { id: string; label: string; wcs: string[] }[] = [
  { id: 'core',  label: 'แกน (Core)',         wcs: ['EE3102','EE3104','EE3105','EE3106','EE3107'] },
  { id: 'coil',  label: 'คอยล์ (Coil)',        wcs: ['EE3201','EE3202','EE3203'] },
  { id: 'ins',   label: 'ฉนวน (Insulation)',   wcs: ['EE3505','EE3601'] },
  { id: 'asm',   label: 'ประกอบ (Assembly)',   wcs: ['EE3301','EE3302','EE3303'] },
  { id: 'fit',   label: 'อุปกรณ์ (Fitting)',   wcs: ['EE3401'] },
  { id: 'test',  label: 'ทดสอบ (Testing)',     wcs: ['EE4201','EE4202'] },
  { id: 'tank',  label: 'ตัวถัง (Tank)',       wcs: ['MP5101','MP5304','MP5601','MP5602','MP5603'] },
  { id: 'paint', label: 'พ่นสี (Paint)',       wcs: ['MP5401','MP5402','MP5403'] },
  { id: 'pt',    label: 'Power Transformer',   wcs: ['PT3701','EE3503','EE3404'] },
]

export default function TimeDashTab() {
  const { state } = useApp()
  const { orders, products, wcConfig } = state

  const [kvaMin, setKvaMin] = useState(0)
  const [kvaMax, setKvaMax] = useState(99999)
  const [selectedDept, setSelectedDept] = useState<string | null>(null)

  const filteredOrders = useMemo(
    () => orders.filter(o => o.kva >= kvaMin && o.kva <= kvaMax),
    [orders, kvaMin, kvaMax]
  )

  const deptData = useMemo(() => {
    return DEPTS.map(dept => {
      let totalStd = 0, totalEff = 0
      const opRows: { wc: string; name: string; qty: number; stdH: number; effH: number }[] = []

      filteredOrders.forEach(o => {
        const p = products[o.product]
        if (!p) return
        p.ops.forEach(op => {
          if (!dept.wcs.includes(op.wc)) return
          const std = op.hrs * o.qty
          const eff = effectiveHrs(op.wc, op.hrs, wcConfig) * o.qty
          totalStd += std
          totalEff += eff
          const existing = opRows.find(r => r.wc === op.wc && r.name === op.name)
          if (existing) { existing.qty += o.qty; existing.stdH += std; existing.effH += eff }
          else opRows.push({ wc: op.wc, name: op.name, qty: o.qty, stdH: std, effH: eff })
        })
      })

      return { ...dept, totalStd, totalEff, opRows }
    }).filter(d => d.totalEff > 0)
  }, [filteredOrders, products, wcConfig])

  const grandTotal = useMemo(() => deptData.reduce((s, d) => s + d.totalEff, 0), [deptData])

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>⏱ เวลาแยกตามแผนก</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>ชั่วโมงทำงาน (Effective) รวมทุก Orders ที่รับเข้าระบบ</div>
        </div>
      </div>

      {/* kVA filter */}
      <div style={{ marginBottom: 14, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>กรอง kVA:</span>
        {[
          { label: 'ทั้งหมด', min: 0, max: 99999 },
          { label: '≤ 160', min: 0, max: 160 },
          { label: '300–1000', min: 300, max: 1000 },
          { label: '2000+', min: 2000, max: 99999 },
          { label: 'Power (7k+)', min: 7000, max: 99999 },
        ].map(f => {
          const active = kvaMin === f.min && kvaMax === f.max
          return (
            <button key={f.label} onClick={() => { setKvaMin(f.min); setKvaMax(f.max) }}
              style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: active ? 'var(--blue)' : 'var(--bg3)', color: active ? '#000' : 'var(--txt2)', cursor: 'pointer', fontWeight: active ? 700 : 400 }}>
              {f.label}
            </button>
          )
        })}
        <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 'auto' }}>
          {filteredOrders.length} orders · รวม <strong style={{ color: 'var(--blue)' }}>{grandTotal.toFixed(0)} h</strong>
        </span>
      </div>

      {deptData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--txt3)', fontSize: 13 }}>📭 ไม่มี Orders ที่ตรงกับเงื่อนไข</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
          {deptData.map(dept => {
            const pct = grandTotal > 0 ? dept.totalEff / grandTotal * 100 : 0
            const isSel = selectedDept === dept.id
            return (
              <div key={dept.id} onClick={() => setSelectedDept(isSel ? null : dept.id)}
                style={{ background: 'var(--bg2)', border: `1px solid ${isSel ? 'var(--blue)' : 'var(--bord)'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{dept.label}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>{dept.totalEff.toFixed(1)}h</div>
                </div>
                <div style={{ height: 6, background: 'var(--bg4)', borderRadius: 3, marginBottom: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--blue)', borderRadius: 3, width: `${Math.min(pct * 3, 100)}%` }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--txt3)' }}>
                  STD: {dept.totalStd.toFixed(1)}h · Effective: {dept.totalEff.toFixed(1)}h · {pct.toFixed(1)}% ของทั้งหมด
                </div>
                {isSel && dept.opRows.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--bord)', paddingTop: 8 }}>
                    {dept.opRows.sort((a, b) => b.effH - a.effH).map(row => (
                      <div key={row.wc + row.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '0.5px solid var(--bord)', fontSize: 10 }}>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', width: 60, flexShrink: 0 }}>{row.wc}</span>
                        <span style={{ flex: 1, color: 'var(--txt2)' }}>{row.name}</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt)', fontWeight: 700 }}>{row.effH.toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
