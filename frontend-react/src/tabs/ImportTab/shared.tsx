export const thStyle: React.CSSProperties = {
  padding: '7px 8px', textAlign: 'left', color: 'var(--txt3)', fontSize: 10, fontWeight: 600,
  background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap',
  userSelect: 'none', position: 'sticky', top: 0, zIndex: 2,
}
export const tdStyle: React.CSSProperties = { padding: '5px 8px', borderBottom: '0.5px solid var(--bord)', fontSize: 11 }
export const cancelBtn: React.CSSProperties = { fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }
export const importBtn: React.CSSProperties = { fontSize: 12, padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#000', fontWeight: 700, cursor: 'pointer' }
export const DAY_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export function DropZone({ dragOver, setDragOver, fileRef, onFile, label }: {
  dragOver: boolean
  setDragOver: (v: boolean) => void
  fileRef: React.MutableRefObject<HTMLInputElement | null>
  onFile: (f: File) => void
  label: string
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onClick={() => fileRef.current?.click()}
      style={{ border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--bord2)'}`, borderRadius: 12, padding: '3rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color .2s', background: dragOver ? 'rgba(137,180,250,.05)' : 'transparent', marginBottom: 12 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt2)' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>หรือคลิกเพื่อเลือกไฟล์ (.xlsx, .xls, .csv)</div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

export function ResultBanner({ msg, onClear }: { msg: string; onClear?: () => void }) {
  const isErr = msg.startsWith('❌')
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 8, marginBottom: 10, fontSize: 12, background: isErr ? 'rgba(224,90,78,.08)' : 'rgba(166,227,161,.08)', border: `1px solid ${isErr ? 'rgba(224,90,78,.3)' : 'rgba(166,227,161,.3)'}`, color: isErr ? 'var(--red)' : 'var(--green)' }}>
      <span style={{ flex: 1 }}>{msg}</span>
      {onClear && <button onClick={onClear} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>}
    </div>
  )
}

export function KpiCard({ label, val, col }: { label: string; val: number; col: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, padding: '8px 12px', minWidth: 90 }}>
      <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: col }}>{val.toLocaleString()}</div>
    </div>
  )
}
