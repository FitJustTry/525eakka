import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { api } from '../../api'
import { isWorkDay, toKey } from '../../utils/dates'
import { TH_MONTHS, TH_DAYS } from '../../data/holidays'

export default function CalendarTab() {
  const { state, dispatch } = useApp()
  const { holidays, factoryHolidays } = state

  const today = new Date()
  const [viewYear, setViewYear]   = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [addDate, setAddDate]     = useState('')
  const [addName, setAddName]     = useState('')
  const [editKey, setEditKey]     = useState<string | null>(null)
  const [editName, setEditName]   = useState('')

  function navMonth(dir: number) {
    let m = viewMonth + dir, y = viewYear
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setViewMonth(m); setViewYear(y)
  }

  async function handleAdd() {
    if (!addDate || !addName.trim()) { alert('กรุณากรอกวันที่และชื่อวันหยุด'); return }
    if (holidays[addDate] && !factoryHolidays[addDate]) { alert('วันนี้เป็นวันหยุดราชการอยู่แล้ว'); return }
    const next = { ...factoryHolidays, [addDate]: addName.trim() }
    dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: next })
    await api.factoryHolidays.create(addDate, addName.trim())
    setAddDate(''); setAddName('')
  }

  async function handleRemove(key: string) {
    const name = factoryHolidays[key]
    if (name === '__WORKDAY__') {
      // removing a workday override → restore as holiday
      const next = { ...factoryHolidays }; delete next[key]
      dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: next })
      await api.factoryHolidays.delete(key)
      return
    }
    if (!confirm(`ลบวันหยุดโรงงาน "${name}" (${key})?`)) return
    const next = { ...factoryHolidays }; delete next[key]
    dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: next })
    await api.factoryHolidays.delete(key)
  }

  // Mark a ราชการ holiday as a factory working day
  async function handleMarkWorkday(key: string) {
    const holName = holidays[key] || factoryHolidays[key] || key
    if (!confirm(`ยืนยัน: ให้ "${holName}" (${key}) เป็นวันทำงานของโรงงาน?`)) return
    const next = { ...factoryHolidays, [key]: '__WORKDAY__' }
    dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: next })
    await api.factoryHolidays.create(key, '__WORKDAY__')
  }

  // Restore a workday override back to holiday
  async function handleRestoreHoliday(key: string) {
    const holName = holidays[key] || key
    if (!confirm(`คืน "${holName}" (${key}) เป็นวันหยุดราชการ?`)) return
    const next = { ...factoryHolidays }; delete next[key]
    dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: next })
    await api.factoryHolidays.delete(key)
  }

  // Inline rename: save to factoryHolidays to override the display name
  async function saveEdit() {
    if (!editKey) return
    const name = editName.trim()
    setEditKey(null)
    if (!name) return
    const next = { ...factoryHolidays, [editKey]: name }
    dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: next })
    await api.factoryHolidays.create(editKey, name)
  }

  async function handleDayClick(key: string) {
    if (factoryHolidays[key] === '__WORKDAY__') { await handleRestoreHoliday(key); return }
    if (factoryHolidays[key]) { await handleRemove(key); return }
    if (holidays[key]) {
      // Clicking a ราชการ holiday: offer to mark as working day
      await handleMarkWorkday(key)
      return
    }
    const name = prompt(`เพิ่มวันหยุดโรงงาน ${key}:\nชื่อวันหยุด:`)
    if (!name) return
    const next = { ...factoryHolidays, [key]: name }
    dispatch({ type: 'SET_FACTORY_HOLIDAYS', factoryHolidays: next })
    await api.factoryHolidays.create(key, name)
  }

  // Effective holidays (excluding workday overrides) for display counts
  const allHols = { ...holidays, ...factoryHolidays }
  const effectiveHols = Object.fromEntries(Object.entries(allHols).filter(([, v]) => v !== '__WORKDAY__'))

  const upcoming = Object.entries(effectiveHols)
    .filter(([k]) => k >= toKey(today))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 8)

  // Workday overrides upcoming
  const upcomingOverrides = Object.entries(factoryHolidays)
    .filter(([k, v]) => v === '__WORKDAY__' && k >= toKey(today))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 4)

  const monthHols = Object.keys(effectiveHols).filter(k => {
    const d = new Date(k + 'T00:00:00')
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
  }).length

  let workDaysLeft = 0
  const cur = new Date(today)
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  while (cur <= lastDay) {
    if (isWorkDay(cur, holidays, factoryHolidays)) workDaysLeft++
    cur.setDate(cur.getDate() + 1)
  }

  // Calendar grid
  const first = new Date(viewYear, viewMonth, 1)
  const last  = new Date(viewYear, viewMonth + 1, 0)
  const todayKey = toKey(today)

  const cells: React.ReactNode[] = []
  for (let i = 0; i < first.getDay(); i++) cells.push(<div key={'e' + i} />)
  for (let day = 1; day <= last.getDate(); day++) {
    const d   = new Date(viewYear, viewMonth, day)
    const key = toKey(d)
    const dow = d.getDay()
    const isSun = dow === 0; const isSat = dow === 6
    const hol = holidays[key]; const fhol = factoryHolidays[key]
    const isWorkdayOverride = fhol === '__WORKDAY__'
    const isToday = key === todayKey

    let bg = 'transparent', border = 'transparent', color = 'var(--txt2)'
    if (isSun) { color = 'var(--red)'; bg = 'rgba(224,90,78,.05)' }
    if (isSat) { color = 'var(--amber)'; bg = 'rgba(224,156,42,.06)'; border = 'rgba(224,156,42,.15)' }
    if (hol && !isWorkdayOverride)  { bg = 'rgba(224,90,78,.15)'; border = 'rgba(224,90,78,.35)'; color = 'var(--red)' }
    if (fhol && !isWorkdayOverride) { bg = 'rgba(155,127,232,.15)'; border = 'rgba(155,127,232,.35)'; color = 'var(--purple,#9b7fe8)' }
    if (isWorkdayOverride) { bg = 'rgba(166,227,161,.15)'; border = 'rgba(166,227,161,.45)'; color = 'var(--green)' }
    const borderStyle = isToday ? `2px solid var(--amber)` : `1px solid ${border}`

    const displayHol = isWorkdayOverride ? '▶ ทำงาน' : (fhol || hol || undefined)

    cells.push(
      <div key={key} title={displayHol}
        onClick={() => handleDayClick(key)}
        style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'pointer', background: bg, border: borderStyle, position: 'relative' }}>
        <div style={{ fontSize: 12, fontWeight: isToday || hol || fhol ? 700 : 400, color }}>{day}</div>
        {isWorkdayOverride && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--green)', marginTop: 1 }} />}
        {!isWorkdayOverride && (hol || fhol) && <div style={{ width: 4, height: 4, borderRadius: '50%', background: fhol ? '#9b7fe8' : 'var(--red)', marginTop: 1 }} />}
      </div>
    )
  }

  const mcStyle: React.CSSProperties = { background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--bord)' }
  const btnSm: React.CSSProperties = { background: 'transparent', border: '1px solid var(--bord2)', color: 'var(--txt3)', padding: '3px 8px', fontSize: 10, borderRadius: 5, cursor: 'pointer' }

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>ปฏิทินโรงงาน</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>วันหยุดไทย + วันหยุดพิเศษโรงงาน</div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
          {[
            ['rgba(224,90,78,.15)','var(--red)','วันหยุดราชการ'],
            ['rgba(155,127,232,.15)','#9b7fe8','วันหยุดโรงงาน'],
            ['rgba(166,227,161,.15)','var(--green)','ทำงาน (override)'],
            ['rgba(224,156,42,.12)','var(--amber)','วันเสาร์'],
          ].map(([bg, brd, lbl]) => (
            <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: `1px solid ${brd}`, display: 'inline-block' }} />{lbl}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        <div style={mcStyle}><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>วันทำงานเหลือ</div><div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{workDaysLeft}</div><div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>วัน (เดือนนี้)</div></div>
        <div style={mcStyle}><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>วันหยุดเดือนนี้</div><div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)' }}>{monthHols}</div><div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>วัน</div></div>
        <div style={mcStyle}><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>วันหยุดพิเศษ</div><div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: '#9b7fe8' }}>{Object.keys(factoryHolidays).filter(k => factoryHolidays[k] !== '__WORKDAY__').length}</div><div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>ที่กำหนดเอง</div></div>
        <div style={mcStyle}><div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>วันหยุดไทย (ปีนี้)</div><div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)' }}>{Object.keys(holidays).filter(k => k.startsWith(String(today.getFullYear()))).length}</div><div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>วัน {today.getFullYear()}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, alignItems: 'start' }}>
        {/* Calendar */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 12, padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => navMonth(-1)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'transparent', color: 'var(--txt2)', cursor: 'pointer' }}>← ก่อนหน้า</button>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{TH_MONTHS[viewMonth]} {viewYear + 543}</div>
            <button onClick={() => navMonth(1)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'transparent', color: 'var(--txt2)', cursor: 'pointer' }}>ถัดไป →</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 6 }}>
            {TH_DAYS.map((d, i) => <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, padding: '4px 0', color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--amber)' : 'var(--txt3)' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>{cells}</div>
          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--txt3)' }}>คลิกวันเพื่อเพิ่ม/ลบวันหยุด · คลิกวันหยุดราชการเพื่อมาร์กเป็นวันทำงาน</div>
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Add holiday */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 12, padding: '1.125rem 1.25rem' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 12 }}>➕ เพิ่มวันหยุดโรงงาน</div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 5, display: 'block' }}>วันที่</label>
              <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
                style={{ width: '100%', fontSize: 13, padding: '7px 10px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 8, color: 'var(--txt)', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 5, display: 'block' }}>ชื่อวันหยุด</label>
              <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="เช่น หยุดพิเศษ / Shutdown"
                style={{ width: '100%', fontSize: 13, padding: '7px 10px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 8, color: 'var(--txt)', outline: 'none' }} />
            </div>
            <button onClick={handleAdd} style={{ width: '100%', padding: 8, background: 'var(--amber)', border: 'none', color: '#000', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>เพิ่มวันหยุด</button>
          </div>

          {/* Upcoming holidays */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 12, padding: '1.125rem 1.25rem' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 12 }}>วันหยุดที่กำลังจะมาถึง</div>
            {upcoming.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--txt3)', textAlign: 'center', padding: '12px 0' }}>ไม่มีวันหยุดในช่วงนี้</div>
              : upcoming.map(([k, v]) => {
                  const d = new Date(k + 'T00:00:00')
                  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
                  const isFactory = !!factoryHolidays[k] && factoryHolidays[k] !== '__WORKDAY__'
                  const isGovt = !!holidays[k] && !isFactory
                  const col = isFactory ? '#9b7fe8' : 'var(--red)'
                  const isEditing = editKey === k
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--bord)', fontSize: 12 }}>
                      {/* Date badge */}
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: isFactory ? 'rgba(155,127,232,.15)' : 'rgba(224,90,78,.12)', border: `1px solid ${col}50`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: col }}>{d.getDate()}</div>
                        <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{TH_MONTHS[d.getMonth()].slice(0, 3)}</div>
                      </div>
                      {/* Name (inline edit or display) */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditKey(null) }}
                            style={{ width: '100%', fontSize: 12, padding: '3px 6px', background: 'var(--bg3)', border: '1px solid var(--blue)', borderRadius: 5, color: 'var(--txt)', outline: 'none' }} />
                        ) : (
                          <>
                            <div style={{ color: 'var(--txt)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
                            <div style={{ color: 'var(--txt3)', fontSize: 10, marginTop: 1 }}>
                              อีก {diff} วัน · <span style={{ color: col }}>{isFactory ? 'โรงงาน' : 'ราชการ'}</span>
                            </div>
                          </>
                        )}
                      </div>
                      {/* Action buttons */}
                      {!isEditing && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => { setEditKey(k); setEditName(v) }} style={btnSm} title="แก้ไขชื่อ">✏</button>
                          {isFactory && (
                            <button onClick={() => handleRemove(k)} style={btnSm} title="ลบวันหยุดโรงงาน">✕</button>
                          )}
                          {isGovt && (
                            <button onClick={() => handleMarkWorkday(k)}
                              style={{ ...btnSm, color: 'var(--green)', borderColor: 'rgba(166,227,161,.4)' }}
                              title="มาร์กเป็นวันทำงาน">ทำงาน</button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

            {/* Workday overrides section */}
            {upcomingOverrides.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--green)', textTransform: 'uppercase', marginTop: 12, marginBottom: 8 }}>▶ ทำงาน (override ราชการ)</div>
                {upcomingOverrides.map(([k]) => {
                  const d = new Date(k + 'T00:00:00')
                  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
                  const originalName = holidays[k] || k
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--bord)', fontSize: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(166,227,161,.12)', border: '1px solid rgba(166,227,161,.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{d.getDate()}</div>
                        <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{TH_MONTHS[d.getMonth()].slice(0, 3)}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--green)', fontWeight: 500, fontSize: 11 }}>{originalName}</div>
                        <div style={{ color: 'var(--txt3)', fontSize: 10 }}>อีก {diff} วัน · โรงงานทำงาน</div>
                      </div>
                      <button onClick={() => handleRestoreHoliday(k)} style={btnSm} title="คืนเป็นวันหยุด">คืน</button>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
