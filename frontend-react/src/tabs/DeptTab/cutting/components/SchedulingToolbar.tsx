import React, { useState } from 'react'
import { DAY_SHORT } from '../scheduling/constants'
import { fmtISO } from '../scheduling/utils'
import type { ShiftMode } from '../scheduling/engine'

type BalanceMode =
  | 'daily_no_ot' | 'weekly_no_ot' | 'fastest_no_ot'
  | 'deadline_no_ot' | 'priority_no_ot' | 'interweek_no_ot' | 'batch_no_ot'
  | 'daily_smart' | 'weekly_smart' | 'fastest_smart'
  | 'deadline_smart' | 'priority_smart' | 'interweek_smart' | 'batch_smart'
  | 'daily_full' | 'weekly_full' | 'fastest_full'
  | 'deadline_full' | 'priority_full' | 'interweek_full' | 'batch_full'

interface Props {
  balanceMode: BalanceMode
  setBalanceMode: (mode: BalanceMode) => void
  viewMode: 'table' | 'cards' | 'pipeline'
  setViewMode: (mode: 'table' | 'cards' | 'pipeline') => void
  workDisplay: 'order' | 'carry' | 'segment' | 'unit'
  setWorkDisplay: (mode: 'order' | 'carry' | 'segment' | 'unit') => void
  lazyOT: boolean
  setLazyOT: (v: boolean) => void
  interweekThreshold: number
  setInterweekThreshold: (v: number) => void
  useNearestKva: boolean
  setUseNearestKva: React.Dispatch<React.SetStateAction<boolean>>
  shiftMode: ShiftMode
  setShiftMode: (mode: ShiftMode) => void
  shiftNDays: number
  setShiftNDays: React.Dispatch<React.SetStateAction<number>>
  shiftHrsDefault: number
  setShiftHrsDefault: React.Dispatch<React.SetStateAction<number>>
  shiftDays: Set<string>
  totalShift: number
  lateOrdersSize: number
  baselineLateCount: number
  days: Date[]
  manualOtMode: boolean
  setManualOtMode: (v: boolean) => void
}

export default function SchedulingToolbar({
  balanceMode, setBalanceMode, viewMode, setViewMode, workDisplay, setWorkDisplay,
  lazyOT, setLazyOT, interweekThreshold, setInterweekThreshold, useNearestKva, setUseNearestKva,
  shiftMode, setShiftMode, shiftNDays, setShiftNDays, shiftHrsDefault, setShiftHrsDefault,
  shiftDays, totalShift, lateOrdersSize, baselineLateCount, days, manualOtMode, setManualOtMode,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const otPol = balanceMode.endsWith('_no_ot') ? 'no_ot' : balanceMode.endsWith('_smart') ? 'smart' : 'full'
  const schedKey = balanceMode.replace(/_(?:no_ot|smart|full)$/, '')

  const otOptions = [
    { id: 'no_ot', label: '❌ ไม่ OT',      col: 'var(--green)' },
    { id: 'smart', label: '⚠️ เมื่อจำเป็น', col: 'var(--amber)' },
    { id: 'full',  label: '🔥 OT เสมอ',     col: 'var(--red)'   },
  ] as const

  const schedOptions = [
    { id: 'daily',     label: '📅 รายวัน' },
    { id: 'weekly',    label: '🗓 รายสัปดาห์' },
    { id: 'fastest',   label: '🏎 เร็วสุด' },
    { id: 'deadline',  label: '📅 วันส่งก่อน' },
    { id: 'priority',  label: '⭐ ความสำคัญ' },
    { id: 'interweek', label: '🔮 สัปดาห์หน้า' },
    { id: 'batch',     label: '🔗 Batch kVA' },
  ] as const

  const schedLabel: Record<string, string> = { daily: '📅 รายวัน', weekly: '🗓 รายสัปดาห์', fastest: '🏎 เร็วสุด', deadline: '📅 วันส่ง', priority: '⭐ ความสำคัญ', interweek: '🔮 สัปดาห์หน้า', batch: '🔗 Batch' }
  const otLabel: Record<string, string> = { no_ot: '❌ ไม่ OT', smart: '⚠️ OT จำเป็น', full: '🔥 OT เสมอ' }
  const shiftLabel: Record<string, string> = { none: '', smart: '⚠ กะ Smart', every: '🌙 ทุกวัน', n_days: `📅 กะ ${shiftNDays}วัน`, manual: '🗓 กะกำหนดเอง', custom: '✏ Custom' }

  if (collapsed) {
    return (
      <div
        onDoubleClick={() => setCollapsed(false)}
        title="ดับเบิลคลิกเพื่อขยาย"
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12, cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}>
        <span style={{ fontSize: 9, color: 'var(--txt3)', opacity: 0.6 }}>▶</span>
        {[schedLabel[schedKey], otLabel[otPol], shiftLabel[shiftMode]].filter(Boolean).map((lbl, i) => (
          <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--bord2)', color: 'var(--txt2)' }}>{lbl}</span>
        ))}
        {manualOtMode && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(249,226,175,.15)', border: '1px solid var(--amber)', color: 'var(--amber)' }}>⚡ OT</span>}
        {viewMode !== 'table' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--bord2)', color: 'var(--txt2)' }}>{viewMode === 'cards' ? '📋' : '🔄'}</span>}
      </div>
    )
  }

  return (
    <div onDoubleClick={() => setCollapsed(true)} style={{ display: 'flex', flexDirection: 'column', gap: 5, marginLeft: 12, userSelect: 'none' }}>
      {/* Row 1: View mode + OT policy */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>มุมมอง:</span>
        {(['cards', 'table', 'pipeline'] as const).map(v => (
          <button key={v} onClick={() => setViewMode(v)} style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 12, border: '1px solid var(--bord2)', cursor: 'pointer',
            background: viewMode === v ? 'var(--blue)' : 'var(--bg3)',
            color: viewMode === v ? '#000' : 'var(--txt2)', fontWeight: viewMode === v ? 700 : 400,
          }}>
            {v === 'cards' ? '📋 รายวัน' : v === 'table' ? '📊 ตาราง' : '🔄 Pipeline'}
          </button>
        ))}
        {([
          { id: 'order',   label: '📦 ต่อออเดอร์',    col: 'var(--green)',  title: 'รวม segment, ซ่อนค้างจากเมื่อวาน' },
          { id: 'carry',   label: '↩ ต่อเนื่อง',      col: 'var(--blue)',   title: 'รวม segment แต่แสดงค้างต่อเนื่อง' },
          { id: 'segment', label: '📋 ต่อเซ็กเมนต์',  col: 'var(--amber)',  title: 'แสดงทุก segment รวมค้าง' },
          { id: 'unit',    label: '🔩 ต่อหน่วย',      col: 'var(--purple)', title: 'แต่ละ transformer แยกแถว' },
        ] as const).map(w => (
          <button key={w.id} onClick={() => setWorkDisplay(w.id)} title={w.title}
            style={{ fontSize: 10, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1px solid ${workDisplay === w.id ? w.col : 'var(--bord2)'}`,
              background: workDisplay === w.id ? w.col + '22' : 'var(--bg3)',
              color: workDisplay === w.id ? w.col : 'var(--txt2)',
              fontWeight: workDisplay === w.id ? 700 : 400,
            }}>
            {w.label}
          </button>
        ))}
        <span style={{ width: 1, height: 16, background: 'var(--bord2)', margin: '0 6px', flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>OT:</span>
        {otOptions.map(ot => (
          <button key={ot.id} onClick={() => setBalanceMode(`${schedKey}_${ot.id}` as BalanceMode)} style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 8,
            border: `1px solid ${otPol === ot.id ? ot.col : 'var(--bord2)'}`,
            background: otPol === ot.id ? ot.col + '22' : 'var(--bg3)',
            color: otPol === ot.id ? ot.col : 'var(--txt2)',
            fontWeight: otPol === ot.id ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {ot.label}
          </button>
        ))}
        <span style={{ width: 1, height: 16, background: 'var(--bord2)', margin: '0 2px', flexShrink: 0 }} />
        {([
          { v: true,  label: '🌅 ท้ายสัปดาห์', title: 'OT ท้ายสัปดาห์ — เต็มวันปกติก่อน ค่อยเพิ่ม OT เมื่อจำเป็น' },
          { v: false, label: '⚡ ต้นสัปดาห์',   title: 'OT ทันที — เพิ่ม OT ตั้งแต่วันแรกถ้า queue เกิน reg' },
        ] as const).map(({ v, label, title }) => (
          <button key={String(v)} title={title} onClick={() => setLazyOT(v)} style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 8,
            border: `1px solid ${lazyOT === v ? 'var(--amber)' : 'var(--bord2)'}`,
            background: lazyOT === v ? 'rgba(249,226,175,.25)' : 'var(--bg3)',
            color: lazyOT === v ? 'var(--amber)' : 'var(--txt2)',
            fontWeight: lazyOT === v ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Row 2: Schedule mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--txt3)', minWidth: 40 }}>แผน:</span>
        {schedOptions.map(s => (
          <button key={s.id} onClick={() => setBalanceMode(`${s.id}_${otPol}` as BalanceMode)} style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 8,
            border: `1px solid ${schedKey === s.id ? 'var(--blue)' : 'var(--bord2)'}`,
            background: schedKey === s.id ? 'rgba(137,180,250,.18)' : 'var(--bg3)',
            color: schedKey === s.id ? 'var(--blue)' : 'var(--txt2)',
            fontWeight: schedKey === s.id ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {s.label}
          </button>
        ))}
        {schedKey === 'interweek' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--txt3)', marginLeft: 4 }}>
            threshold:
            <input
              type="number" min={0.1} max={5} step={0.1}
              value={interweekThreshold}
              onChange={e => setInterweekThreshold(Math.max(0.01, parseFloat(e.target.value) || 0.5))}
              style={{ width: 48, fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--txt1)', textAlign: 'center' }}
            />
          </label>
        )}
        <span style={{ width: 1, height: 16, background: 'var(--bord2)', margin: '0 4px', flexShrink: 0 }} />
        <button
          onClick={() => setUseNearestKva(v => !v)}
          title={useNearestKva ? 'KVA ใกล้เคียง: ใช้ค่าที่ใกล้ที่สุดเมื่อไม่มีค่าตรง' : 'KVA ตรงเท่านั้น: ใช้ hrs_per_unit เมื่อไม่มีค่าตรง'}
          style={{ fontSize: 10, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
            border: `1px solid ${useNearestKva ? 'var(--purple)' : 'var(--bord2)'}`,
            background: useNearestKva ? 'rgba(203,166,247,.2)' : 'var(--bg3)',
            color: useNearestKva ? 'var(--purple)' : 'var(--txt2)',
            fontWeight: useNearestKva ? 700 : 400 }}>
          🎯 KVA {useNearestKva ? 'ใกล้เคียง' : 'ตรงเท่านั้น'}
        </button>
      </div>

      {/* Row 3: Shift mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--txt3)', minWidth: 40 }}>กะ:</span>
        {([
          { id: 'none',   label: '❌ ไม่มีกะ',   col: 'var(--txt3)',   title: 'ไม่ใช้กะกลางคืน' },
          { id: 'smart',  label: '⚠ Smart',      col: 'var(--amber)',  title: 'เปิดกะเมื่องานล้น reg+OT' },
          { id: 'every',  label: '🌙 ทุกวัน',    col: 'var(--blue)',   title: 'เพิ่มกะกลางคืนทุกวัน' },
          { id: 'n_days', label: '📅 N วัน',     col: 'var(--purple)', title: 'เลือก N วันที่ต้องการกะมากที่สุด' },
          { id: 'manual', label: '🗓 กำหนดเอง',  col: 'var(--green)',  title: 'เลือกเครื่อง+วันที่ต้องการกะด้วยตัวเอง' },
          { id: 'custom', label: '✏ Custom',     col: 'var(--purple)', title: 'กำหนดชั่วโมงกะ+OT ต่อเครื่องต่อวันแบบกำหนดเอง' },
        ] as const).map(s => (
          <button key={s.id} onClick={() => setShiftMode(s.id)} title={s.title} style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
            border: `1px solid ${shiftMode === s.id ? s.col : 'var(--bord2)'}`,
            background: shiftMode === s.id ? s.col + '22' : 'var(--bg3)',
            color: shiftMode === s.id ? s.col : 'var(--txt2)',
            fontWeight: shiftMode === s.id ? 700 : 400,
          }}>
            {s.label}
          </button>
        ))}
        {shiftMode === 'n_days' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--txt3)', marginLeft: 4 }}>
            จำนวนวัน:
            <input type="number" min={1} max={6} step={1} value={shiftNDays}
              onChange={e => setShiftNDays(Math.max(1, Math.min(6, parseInt(e.target.value) || 2)))}
              style={{ width: 44, fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--txt1)', textAlign: 'center' }} />
          </label>
        )}
        <span style={{ width: 1, height: 16, background: 'var(--bord2)', margin: '0 4px', flexShrink: 0 }} />
        <button
          onClick={() => setManualOtMode(!manualOtMode)}
          title="กำหนด OT ต่อเครื่องต่อวันด้วยตัวเอง — เมื่อเปิดใช้ OT จะเกิดเฉพาะวันที่เลือก"
          style={{ fontSize: 10, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
            border: `1px solid ${manualOtMode ? 'var(--amber)' : 'var(--bord2)'}`,
            background: manualOtMode ? 'rgba(249,226,175,.2)' : 'var(--bg3)',
            color: manualOtMode ? 'var(--amber)' : 'var(--txt2)',
            fontWeight: manualOtMode ? 700 : 400,
          }}>
          ⚡ OT กำหนดเอง
        </button>
        {shiftMode !== 'none' && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--bord2)', margin: '0 4px', flexShrink: 0 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--txt3)' }}
              title="ชั่วโมงกะ/คืน (default ถ้าไม่ได้ตั้งค่า per-machine)">
              🌙 ชม:
              <input type="number" min={1} max={24} step={0.5} value={shiftHrsDefault}
                onChange={e => setShiftHrsDefault(Math.max(1, parseFloat(e.target.value) || 9))}
                style={{ width: 48, fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--blue)', fontWeight: 700, textAlign: 'center' }} />
              h
            </label>
          </>
        )}
      </div>

      {/* Shift info panel */}
      {shiftMode !== 'none' && shiftMode !== 'manual' && shiftMode !== 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'rgba(137,180,250,.07)', border: '1px solid rgba(137,180,250,.2)', borderRadius: 8, flexWrap: 'wrap', fontSize: 10 }}>
          <span style={{ color: 'var(--blue)', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em' }}>🌙 กะที่ใช้:</span>
          {days.map(d => {
            const dStr = fmtISO(d)
            const hasShift = shiftDays.has(dStr)
            return (
              <span key={dStr} style={{
                padding: '2px 7px', borderRadius: 6, fontWeight: hasShift ? 700 : 400,
                background: hasShift ? 'rgba(137,180,250,.25)' : 'var(--bg3)',
                color: hasShift ? 'var(--blue)' : 'var(--txt3)',
                border: `1px solid ${hasShift ? 'rgba(137,180,250,.5)' : 'var(--bord2)'}`,
                fontSize: 9,
              }}>
                {DAY_SHORT[d.getDay()]} {String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')}
                {hasShift ? ' 🌙' : ''}
              </span>
            )
          })}
          <span style={{ width: 1, height: 16, background: 'var(--bord2)', flexShrink: 0 }} />
          {totalShift >= 0.05 ? (
            <span style={{ color: 'var(--blue)', fontWeight: 700 }}>+{totalShift.toFixed(1)}h/สัปดาห์</span>
          ) : (
            <span style={{ color: 'var(--txt3)' }}>+0h (ไม่มีงานล้น)</span>
          )}
          {lateOrdersSize !== baselineLateCount && (
            <>
              <span style={{ width: 1, height: 16, background: 'var(--bord2)', flexShrink: 0 }} />
              <span style={{ color: 'var(--txt3)', fontSize: 9 }}>🔴 ส่งช้า:</span>
              <span style={{ fontWeight: 700, color: baselineLateCount > lateOrdersSize ? 'var(--green)' : 'var(--red)' }}>
                {baselineLateCount} → {lateOrdersSize}
                {baselineLateCount > lateOrdersSize
                  ? ` (−${baselineLateCount - lateOrdersSize} ดีขึ้น)`
                  : ` (+${lateOrdersSize - baselineLateCount})`}
              </span>
            </>
          )}
          {lateOrdersSize === baselineLateCount && totalShift >= 0.05 && (
            <>
              <span style={{ width: 1, height: 16, background: 'var(--bord2)', flexShrink: 0 }} />
              <span style={{ color: 'var(--txt3)', fontSize: 9 }}>🔴 ส่งช้า: {lateOrdersSize} (ไม่เปลี่ยน)</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
