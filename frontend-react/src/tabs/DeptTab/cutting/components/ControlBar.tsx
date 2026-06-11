import React from 'react'

interface Props {
  showWireData: boolean
  setShowWireData: React.Dispatch<React.SetStateAction<boolean>>
  strictWire: boolean
  setStrictWire: React.Dispatch<React.SetStateAction<boolean>>
  requireDrill: boolean
  setRequireDrill: React.Dispatch<React.SetStateAction<boolean>>
  stickyOrders: boolean
  setStickyOrders: React.Dispatch<React.SetStateAction<boolean>>
  includePrevCarry: boolean
  setIncludePrevCarry: React.Dispatch<React.SetStateAction<boolean>>
  prevCarryQty: number
  planSaving: boolean
  planSaveMsg: string | null
  weekOrdersLength: number
  onSavePlan: () => void
  onExportCSV: () => void
  onExportXLSX: () => void
  onExportMachineXLSX: () => void
  onExportTXT: () => void
  onExportPrint: () => void
  onExportMachinePrint: () => void
  onExportJSON: () => void
  onLoadSnapshots: () => void
}

export default function ControlBar({
  showWireData, setShowWireData, strictWire, setStrictWire, requireDrill, setRequireDrill,
  stickyOrders, setStickyOrders, includePrevCarry, setIncludePrevCarry, prevCarryQty,
  planSaving, planSaveMsg, weekOrdersLength, onSavePlan,
  onExportCSV, onExportXLSX, onExportMachineXLSX, onExportTXT, onExportPrint, onExportMachinePrint, onExportJSON,
  onLoadSnapshots
}: Props) {
  const exports = [
    { label: '📄 CSV', fn: onExportCSV, desc: 'Spreadsheet rows' },
    { label: '📊 Excel (.xlsx)', fn: onExportXLSX, desc: 'ต่อวัน — formatted workbook' },
    { label: '📊 Excel ต่อเครื่อง', fn: onExportMachineXLSX, desc: 'แต่ละเครื่อง = 1 sheet' },
    { label: '📝 Text (.txt)', fn: onExportTXT, desc: 'Plain text summary' },
    { label: '🖨 Print / PDF', fn: onExportPrint, desc: 'Print ต่อวัน' },
    { label: '🖨 Print ต่อเครื่อง', fn: onExportMachinePrint, desc: 'บัตรงานต่อเครื่อง' },
    { label: '{ } JSON', fn: onExportJSON, desc: 'Raw data' },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--bord)', flexShrink: 0, flexWrap: 'wrap' }}>
      <button onClick={() => setShowWireData(v => !v)}
        title="แสดง Raw Mat / LV / HV ในแต่ละ order"
        style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${showWireData ? 'rgba(137,180,250,.5)' : 'var(--bord2)'}`, background: showWireData ? 'rgba(137,180,250,.15)' : 'var(--bg3)', color: showWireData ? 'var(--blue)' : 'var(--txt3)', cursor: 'pointer', fontWeight: showWireData ? 700 : 400 }}>
        📐 Wire Data
      </button>
      <button onClick={() => setStrictWire(v => !v)}
        title={strictWire ? 'Wire Match ON: LS→laser machine, M-4→M4 machine' : 'Wire Match OFF: soft preference only'}
        style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${strictWire ? 'rgba(250,179,135,.6)' : 'var(--bord2)'}`, background: strictWire ? 'rgba(250,179,135,.15)' : 'var(--bg3)', color: strictWire ? 'var(--amber)' : 'var(--txt3)', cursor: 'pointer', fontWeight: strictWire ? 700 : 400 }}>
        {strictWire ? '🔒 Wire Match' : '🔓 Wire Match'}
      </button>
      <button onClick={() => setRequireDrill(v => !v)}
        title={requireDrill ? 'เจาะ ≥315kVA ON' : 'เจาะ ≥315kVA OFF'}
        style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${requireDrill ? 'rgba(166,227,161,.6)' : 'var(--bord2)'}`, background: requireDrill ? 'rgba(166,227,161,.12)' : 'var(--bg3)', color: requireDrill ? 'var(--green)' : 'var(--txt3)', cursor: 'pointer', fontWeight: requireDrill ? 700 : 400 }}>
        🔩 เจาะ ≥315kVA
      </button>
      <button onClick={() => setStickyOrders(v => !v)}
        title={stickyOrders ? 'ครบต่อเครื่อง ON' : 'แยกเครื่องได้'}
        style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${stickyOrders ? 'rgba(203,166,247,.6)' : 'var(--bord2)'}`, background: stickyOrders ? 'rgba(203,166,247,.15)' : 'var(--bg3)', color: stickyOrders ? 'var(--purple)' : 'var(--txt3)', cursor: 'pointer', fontWeight: stickyOrders ? 700 : 400 }}>
        {stickyOrders ? '🔗 ครบต่อเครื่อง' : '🔀 แยกเครื่องได้'}
      </button>
      <button onClick={() => setIncludePrevCarry(v => !v)}
        title="นำงานที่ค้างจากสัปดาห์ที่แล้วมาคำนวณด้วย"
        style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${includePrevCarry ? 'rgba(137,180,250,.5)' : 'var(--bord2)'}`, background: includePrevCarry ? 'rgba(137,180,250,.15)' : 'var(--bg3)', color: includePrevCarry ? 'var(--blue)' : 'var(--txt3)', cursor: 'pointer', fontWeight: includePrevCarry ? 700 : 400 }}>
        ↩ รวมงานค้างสัปดาห์ก่อน
      </button>
      {includePrevCarry && prevCarryQty > 0 && (
        <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 600 }}>+{prevCarryQty} ตัว ยกมา</span>
      )}
      {includePrevCarry && prevCarryQty === 0 && (
        <span style={{ fontSize: 10, color: 'var(--green)' }}>✓ สัปดาห์ก่อนเสร็จทุก order</span>
      )}
      <div style={{ width: 1, height: 20, background: 'var(--bord2)' }} />
      <button onClick={onSavePlan} disabled={planSaving || weekOrdersLength === 0}
        style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#000', fontWeight: 700, cursor: 'pointer', opacity: (planSaving || weekOrdersLength === 0) ? 0.5 : 1 }}>
        {planSaving ? 'กำลังบันทึก…' : '💾 บันทึกแผน'}
      </button>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button disabled={weekOrdersLength === 0}
          onClick={e => { const m = (e.currentTarget.nextSibling as HTMLElement); m.style.display = m.style.display === 'block' ? 'none' : 'block' }}
          style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', fontWeight: 600, cursor: 'pointer', opacity: weekOrdersLength === 0 ? 0.5 : 1 }}>
          📤 Export ▾
        </button>
        <div style={{ display: 'none', position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.3)', minWidth: 160, padding: 4, marginTop: 2 }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.display = 'none' }}>
          {exports.map(({ label, fn, desc }) => (
            <button key={label} onClick={() => { fn(); (document.activeElement as HTMLElement)?.blur() }}
              style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 6, color: 'var(--txt)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: 9, color: 'var(--txt3)' }}>{desc}</span>
            </button>
          ))}
        </div>
      </div>
      <button onClick={onLoadSnapshots}
        style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>
        📋 ดูแผนที่บันทึก
      </button>
      {planSaveMsg && <span style={{ fontSize: 10, color: planSaveMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{planSaveMsg}</span>}
      <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 'auto' }}>บันทึกแผนเพื่อดูย้อนหลัง</span>
    </div>
  )
}
