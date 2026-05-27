import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

const DEPT_LABELS: Record<string, string> = {
  EE31: 'แผนกแกน (Core)', EE32: 'แผนกคอยล์ (Coil)', EE33: 'แผนกประกอบ (Assembly)',
  EE34: 'แผนกอุปกรณ์ (Fitting)', EE35: 'แผนกฉนวน (Insulation)', EE36: 'แผนกไม้ฉนวน',
  EE40: 'แผนกทดสอบ (Testing)', MP51: 'แผนกตัวถัง (Tank)', MP54: 'แผนกพ่นสี (Paint)',
  other: 'แผนกอื่นๆ',
}

export default function EmployeesTab() {
  const { state } = useApp()
  const { employees } = state

  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [selectedDept, setSelectedDept] = useState('')

  const q = search.toLowerCase()

  const allDepts = useMemo(() => Object.keys(employees).sort(), [employees])

  const totalActive = useMemo(() => Object.values(employees).flat().filter(e => e.is_active).length, [employees])
  const totalAll = useMemo(() => Object.values(employees).flat().length, [employees])
  const totalDepts = useMemo(() => allDepts.length, [allDepts])

  const filteredDepts = useMemo(() => {
    if (selectedDept) return allDepts.filter(d => d === selectedDept)
    return allDepts
  }, [allDepts, selectedDept])

  if (totalAll === 0) {
    return (
      <div style={{ padding: '1.25rem 1.5rem', flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>👷 พนักงาน</div>
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--txt3)', fontSize: 13 }}>
          📭 ยังไม่มีข้อมูลพนักงาน — ไปที่แท็บ Import เพื่อนำเข้าข้อมูลจาก Excel
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>👷 พนักงาน</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>รายชื่อพนักงานแยกตามแผนก</div>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          ['พนักงานทั้งหมด', totalAll, 'var(--txt)'],
          ['Active', totalActive, 'var(--green)'],
          ['แผนก', totalDepts, 'var(--blue)'],
        ].map(([lbl, val, col]) => (
          <div key={String(lbl)} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--bord)' }}>
            <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{lbl}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: col as string }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="ค้นหาชื่อ / รหัส..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none', width: 220 }} />
        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
          style={{ fontSize: 11, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none' }}>
          <option value="">ทุกแผนก</option>
          {allDepts.map(d => <option key={d} value={d}>{DEPT_LABELS[d] ?? d}</option>)}
        </select>
        <label style={{ fontSize: 11, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          แสดงไม่ active
        </label>
      </div>

      {/* Dept sections */}
      {filteredDepts.map(dept => {
        let deptEmps = employees[dept] ?? []
        if (!showInactive) deptEmps = deptEmps.filter(e => e.is_active)
        if (q) deptEmps = deptEmps.filter(e => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.wc.toLowerCase().includes(q))
        if (deptEmps.length === 0) return null

        const heads = deptEmps.filter(e => e.is_head)
        const members = deptEmps.filter(e => !e.is_head)
        const wcGroups: Record<string, typeof deptEmps> = {}
        members.forEach(e => { (wcGroups[e.wc] ??= []).push(e) })

        return (
          <div key={dept} style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg3)', borderBottom: '1px solid var(--bord)' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{DEPT_LABELS[dept] ?? dept}</div>
                <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2, fontFamily: 'var(--mono)' }}>{dept}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{deptEmps.length} คน</div>
            </div>

            <div style={{ padding: '10px 14px' }}>
              {heads.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>หัวหน้า</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {heads.map(e => (
                      <div key={e.id} style={{ background: 'rgba(137,180,250,.1)', border: '1px solid rgba(137,180,250,.3)', borderRadius: 8, padding: '6px 10px' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)' }}>{e.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 1, fontFamily: 'var(--mono)' }}>{e.id} · {e.wc}</div>
                        <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 1 }}>{e.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.entries(wcGroups).map(([wc, emps]) => (
                <div key={wc} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--amber)', fontFamily: 'var(--mono)', fontWeight: 700, marginBottom: 5 }}>{wc}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {emps.map(e => (
                      <div key={e.id} style={{ background: 'var(--bg3)', border: '1px solid var(--bord)', borderRadius: 6, padding: '4px 8px', opacity: e.is_active ? 1 : 0.5 }}>
                        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--txt)' }}>{e.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--txt3)', fontFamily: 'var(--mono)', marginTop: 1 }}>{e.id}</div>
                        {!e.is_active && <div style={{ fontSize: 8, color: 'var(--red)', marginTop: 1 }}>ไม่ active</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
