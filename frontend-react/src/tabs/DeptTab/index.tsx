import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import CuttingMachines from './CuttingMachines'
import CoilMachines from './CoilMachines'

type DeptId = 'core' | 'coil' | 'inner' | 'outer'

const DEPTS: { id: DeptId; label: string; color: string; wcs: string[] }[] = [
  {
    id: 'core',
    label: 'แผนกเหล็กแกน',
    color: '#89b4fa',
    wcs: ['EE3102','EE3104','EE3105','EE3106','EE3107'],
  },
  {
    id: 'coil',
    label: 'แผนกพันคอยล์',
    color: '#a6e3a1',
    wcs: ['EE3201','EE3202','EE3203','EE3501','EE3502','EE3503','EE3504','EE3505','EE3601'],
  },
  {
    id: 'inner',
    label: 'แผนกประกอบภายใน',
    color: '#f9e2af',
    wcs: ['EE3301','EE3302','EE3303','EE3401','EE3402','EE3403'],
  },
  {
    id: 'outer',
    label: 'แผนกประกอบภายนอก',
    color: '#89dceb',
    wcs: ['EE4201','EE4202','EE4204','MP5101','MP5102','MP5103','MP5202','MP5304','MP5401','MP5402','MP5403','MP5404','MP5601','MP5602','MP5603'],
  },
]

export default function DeptTab() {
  const [dept, setDept] = useState<DeptId>('core')
  const [showCutting, setShowCutting] = useState(false)
  const [showCoil, setShowCoil] = useState(false)

  const current = DEPTS.find(d => d.id === dept)!

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
      {/* Department selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginRight: 4 }}>🏭 แผนก</div>
        {DEPTS.map(d => (
          <button key={d.id} onClick={() => { setDept(d.id); setShowCutting(false); setShowCoil(false) }}
            style={{
              fontSize: 12, padding: '6px 18px', borderRadius: 20,
              border: `1.5px solid ${dept === d.id ? d.color : 'var(--bord)'}`,
              background: dept === d.id ? d.color + '22' : 'var(--bg3)',
              color: dept === d.id ? d.color : 'var(--txt2)',
              fontWeight: dept === d.id ? 700 : 400,
              cursor: 'pointer', transition: 'all .15s',
            }}>
            {d.label}
          </button>
        ))}
        {/* แผนกเหล็กแกน → show cutting machines */}
        {dept === 'core' && (
          <button onClick={() => setShowCutting(v => !v)}
            style={{
              marginLeft: 'auto', fontSize: 11, padding: '5px 12px', borderRadius: 20,
              border: `1px solid ${showCutting ? 'var(--amber)' : 'var(--bord)'}`,
              background: showCutting ? 'rgba(224,156,42,.12)' : 'var(--bg3)',
              color: showCutting ? 'var(--amber)' : 'var(--txt3)',
              cursor: 'pointer',
            }}>
            🔧 เครื่องตัดโลหะ
          </button>
        )}
        {/* แผนกพันคอยล์ → show coil machines */}
        {dept === 'coil' && (
          <button onClick={() => setShowCoil(v => !v)}
            style={{
              marginLeft: 'auto', fontSize: 11, padding: '5px 12px', borderRadius: 20,
              border: `1px solid ${showCoil ? 'var(--green)' : 'var(--bord)'}`,
              background: showCoil ? 'rgba(166,227,161,.12)' : 'var(--bg3)',
              color: showCoil ? 'var(--green)' : 'var(--txt3)',
              cursor: 'pointer',
            }}>
            🌀 เครื่องพันคอยล์
          </button>
        )}
      </div>

      {dept === 'core' && showCutting
        ? <CuttingMachines />
        : dept === 'coil' && showCoil
          ? <CoilMachines />
          : <DeptContent dept={current} />
      }
    </div>
  )
}

function DeptContent({ dept }: { dept: typeof DEPTS[0] }) {
  const { state } = useApp()
  const { wcConfig, employees } = state

  const rows = dept.wcs
    .map(id => ({ id, cfg: wcConfig[id] }))
    .filter(r => !!r.cfg)

  const totalWorkers  = rows.reduce((s, r) => s + (r.cfg?.workers ?? 0), 0)
  const totalWeeklyHrs = rows.reduce((s, r) => {
    const c = r.cfg!
    return s + c.workers * (c.hrs * 5 + (c.sat_hrs ?? 0))
  }, 0)

  const deptEmps = Object.entries(employees)
    .filter(([wc]) => dept.wcs.includes(wc))
    .flatMap(([, list]) => list)

  return (
    <>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'สถานีงาน',      val: rows.length,                    col: dept.color },
          { label: 'คนทั้งหมด',    val: totalWorkers,                   col: 'var(--blue)' },
          { label: 'ชม./สัปดาห์',  val: Math.round(totalWeeklyHrs),     col: 'var(--amber)' },
          { label: 'พนักงาน (DB)', val: deptEmps.length,                col: 'var(--green)' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, padding: '8px 14px', minWidth: 110 }}>
            <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: col }}>{val.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* WC table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ background: 'var(--bg3)' }}>
              {['WC','ชื่อสถานีงาน','คน','ชม./วัน','เสาร์','Eff %','ชม./สัปดาห์'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--txt3)', fontWeight: 600, borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, cfg }) => {
              if (!cfg) return null
              const eff = cfg.eff ?? 90
              const weeklyHrs = cfg.workers * (cfg.hrs * 5 + (cfg.sat_hrs ?? 0))
              return (
                <tr key={id} style={{ borderBottom: '0.5px solid var(--bord)' }}>
                  <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: dept.color, fontWeight: 700 }}>{id}</td>
                  <td style={{ padding: '7px 10px', fontSize: 12 }}>{cfg.name}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 600 }}>{cfg.workers}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', textAlign: 'right' }}>{cfg.hrs}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', textAlign: 'right', color: cfg.sat_hrs ? 'var(--txt2)' : 'var(--txt3)' }}>{cfg.sat_hrs ?? 0}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 600,
                      background: eff >= 90 ? 'rgba(166,227,161,.15)' : eff >= 80 ? 'rgba(249,226,175,.15)' : 'rgba(224,90,78,.1)',
                      color: eff >= 90 ? 'var(--green)' : eff >= 80 ? 'var(--amber)' : 'var(--red)',
                    }}>{eff}%</span>
                  </td>
                  <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--txt2)', fontWeight: 600 }}>{weeklyHrs.toLocaleString()}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--bg3)', borderTop: '1px solid var(--bord2)' }}>
              <td colSpan={2} style={{ padding: '7px 10px', fontSize: 11, fontWeight: 600, color: 'var(--txt2)' }}>รวม {rows.length} สถานีงาน</td>
              <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 700, color: dept.color }}>{totalWorkers}</td>
              <td colSpan={3} />
              <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 700, color: dept.color }}>{Math.round(totalWeeklyHrs).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Employees section (if loaded) */}
      {deptEmps.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--txt2)' }}>
            พนักงาน {deptEmps.length} คน
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {deptEmps.map(emp => (
              <div key={emp.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 16,
                background: 'var(--bg3)', border: '1px solid var(--bord)', fontSize: 11,
              }}>
                {emp.is_head && <span style={{ fontSize: 9, color: 'var(--amber)' }}>★</span>}
                <span>{emp.name}</span>
                {emp.title && <span style={{ fontSize: 9, color: 'var(--txt3)' }}>{emp.title}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
