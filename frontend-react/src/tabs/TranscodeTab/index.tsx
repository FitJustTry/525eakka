import { useState } from 'react'

const IC_TYPE: Record<string, string> = {
  '1':'3Ph Conservator','C':'3Ph Conservator (High Loss)','2':'3Ph N₂ Gas Sealed',
  'N':'3Ph N₂ Gas Sealed (High Loss)','3':'3Ph Hermetically Sealed (Full Oil)',
  'F':'3Ph Full Oil (High Loss)','4':'3Ph Cast Resin','5':'3Ph Pad Mounted',
  '6':'Dry Type Class H','8':'Special Type','9':'1 Phase','T':'Dry Type Class H',
  'U':'1 Phase (เทพารักษ์)',
}
const IC_GH: Record<string, string> = {
  '01':'0–1,000 V','03':'3,300 V','06':'6,600 V','10':'1,001–10,999 V','11':'11,000 V',
  '12':'12,000 V','19':'19,000 V','20':'11,001–21,999 V','22':'22,000 V','24':'24,000 V',
  '30':'22,001–32,999 V','33':'33,000–36,000 V','40':'11kV / 22kV (Dual)','42':'12kV / 24kV (Dual)',
  '50':'36,001–50,000 V','60':'>50,001 V',
}
const IC_GRP: Record<string, string> = {
  'A':'Ekarat Std — Foil Winding','B':'Ekarat Std — Foil + Box 1','C':'Ekarat Std — Wire Winding',
  'D':'Ekarat Std — Wire + Box 1','E':'PEA Std — Foil Winding','F':'PEA Std — Wire Winding',
  'G':'PEA Evaluated Cost (Foil)','H':'Aluminum HV Winding','I':'MEA Std — Foil Winding',
  'J':'MEA Std — Wire Winding','K':'Export Std — Foil Winding','L':'Aluminum HV+LV Winding',
  'M':'Export Std — Wire Winding','N':'Export Std — Wire + Box 1',
  'S':'Special Add-on (Cable Box / Control / Conservator)',
}

const CAT_A: Record<string, string> = {
  '5':'Finished Product (สำเร็จรูป)','4':'90% Semi-finished',
}

const KVA_LIST = [50,100,160,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,7500,10000,12500,16000]
const EX_CODES = ['51410022A1','53415022S001','52310019E1','51210022I2','54100022A001','53630033K1']

function decodeKva(cdef: string): string | null {
  if (!cdef || cdef.length < 4) return null
  const c = parseInt(cdef[0]), def = parseInt(cdef.slice(1))
  if (isNaN(c) || isNaN(def)) return null
  const kva = def * Math.pow(10, c) / 1000
  return kva % 1 === 0 ? kva.toFixed(0) : kva.toFixed(1)
}

function encodeKva(kva: number): string | null {
  const va = kva * 1000
  for (let c = 2; c <= 6; c++) {
    const def = va / Math.pow(10, c)
    if (def >= 1 && def <= 999 && Number.isInteger(def))
      return `${c}${String(Math.round(def)).padStart(3, '0')}`
  }
  return null
}

interface Decoded {
  category: string; type: string; kva: string | null; hv: string; group: string; running: string
  raw: { A: string; B: string; CDEF: string; GH: string; I: string; run: string }
}

function decodeItemCode(code: string): Decoded | null {
  code = code.trim().toUpperCase().replace(/\s/g, '')
  if (code.length < 8) return null
  const A = code[0], B = code[1], CDEF = code.slice(2, 6), GH = code.slice(6, 8), rest = code.slice(8)
  const I = rest[0] || '', run = rest.slice(1) || ''
  return {
    category: CAT_A[A] ?? `หมวด ${A}`,
    type: IC_TYPE[B] ?? `Unknown (${B})`,
    kva: decodeKva(code),
    hv: IC_GH[GH] ?? `Unknown GH=${GH}`,
    group: IC_GRP[I] ?? (I ? `Unknown (${I})` : '—'),
    running: run || '—',
    raw: { A, B, CDEF, GH, I, run },
  }
}

const SEGS = [
  { chars: 'A',      label: 'A',      color: '#f38ba8', desc: 'หมวดสินค้า', eg: '5=Finished · 4=90%' },
  { chars: 'B',      label: 'B',      color: '#f9e2af', desc: 'ประเภทหม้อแปลง', eg: '1=Conservator · 3=Full Oil · 9=1Ph' },
  { chars: 'CDEF',   label: 'CDEF',   color: '#a6e3a1', desc: 'ขนาด kVA (Encoded)', eg: '3100=100kVA · 4100=1,000kVA' },
  { chars: 'GH',     label: 'GH',     color: '#89b4fa', desc: 'แรงดัน HV', eg: '22=22kV · 33=33kV · 11=11kV' },
  { chars: 'I',      label: 'I',      color: '#cba6f7', desc: 'กลุ่มมาตรฐาน/วัสดุ', eg: 'A=Ekarat Foil · E=PEA · I=MEA' },
  { chars: 'J(KLM)', label: 'J(KLM)', color: '#fab387', desc: 'หมายเลขวิ่ง', eg: '001–999 · S001=Special' },
]

interface EncState { A: string; B: string; kva: number; GH: string; I: string; run: string }

const DEFAULT_ENC: EncState = { A: '5', B: '1', kva: 100, GH: '22', I: 'A', run: '001' }

export default function TranscodeTab() {
  const [decInput, setDecInput] = useState('')
  const [enc, setEnc] = useState<EncState>(DEFAULT_ENC)
  const [showRef, setShowRef] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const dec = decInput.length >= 8 ? decodeItemCode(decInput) : null
  const encCode = (() => {
    const cf = encodeKva(enc.kva)
    return cf ? `${enc.A}${enc.B}${cf}${enc.GH}${enc.I}${enc.run || '001'}` : null
  })()

  const kvaRef = KVA_LIST.map(k => ({ kva: k, code: encodeKva(k) })).filter(x => x.code)

  const inp = (s: React.CSSProperties) => ({
    fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none', width: '100%', ...s,
  })

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>🔢 Transformer Item Code — EN-T-001</div>
      <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 14 }}>ถอดรหัส / สร้างรหัส สำหรับ Item Code หม้อแปลงไฟฟ้า Ekarat</div>

      {/* Structure */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>โครงสร้างรหัส — AB · CDEF · GH · I · J(KLM)</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
          {SEGS.map((s, i) => (
            <div key={s.chars} style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              {i > 0 && <div style={{ color: 'var(--bord2)', fontSize: 18, paddingBottom: 28 }}>·</div>}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: s.color, padding: '6px 10px', borderRadius: 7, background: s.color + '14', border: `1.5px solid ${s.color}40`, letterSpacing: '.1em', textAlign: 'center', width: '100%' }}>{s.chars}</div>
                <div style={{ fontSize: 8, color: s.color, fontWeight: 700, marginTop: 2 }}>{s.label}</div>
                <div style={{ fontSize: 8, color: 'var(--txt3)', textAlign: 'center', maxWidth: 72, lineHeight: 1.3, marginTop: 1 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
          {SEGS.map(s => (
            <div key={s.label} style={{ padding: '5px 8px', borderRadius: 6, borderLeft: `3px solid ${s.color}`, background: s.color + '08' }}>
              <div style={{ fontSize: 8, color: s.color, fontWeight: 700, marginBottom: 1 }}>{s.label}</div>
              <div style={{ fontSize: 9, color: 'var(--txt2)', lineHeight: 1.5 }}>{s.eg}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Decoder + Encoder */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Decoder */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>🔍 Decoder — ถอดรหัส</div>
          <input type="text" maxLength={14} placeholder="เช่น 51410022A1" value={decInput}
            onChange={e => setDecInput(e.target.value.toUpperCase())}
            style={{ ...inp({}), fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: '.08em', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {EX_CODES.map(ex => (
              <button key={ex} onClick={() => setDecInput(ex)}
                style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--amber)', cursor: 'pointer', fontFamily: 'var(--mono)' }}>{ex}</button>
            ))}
          </div>

          {decInput.length > 0 && decInput.length < 8 && (
            <div style={{ fontSize: 12, color: 'var(--txt3)', padding: '8px 0' }}>รหัสสั้นเกินไป (ต้องการ 8+ หลัก)</div>
          )}

          {dec && (
            <>
              {/* Breakdown */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8, alignItems: 'flex-end' }}>
                {[
                  { chars: dec.raw.A, label: 'A', color: '#f38ba8', tip: dec.category },
                  { chars: dec.raw.B, label: 'B', color: '#f9e2af', tip: dec.type },
                  { chars: dec.raw.CDEF, label: 'CDEF', color: '#a6e3a1', tip: dec.kva + ' kVA' },
                  { chars: dec.raw.GH, label: 'GH', color: '#89b4fa', tip: 'HV: ' + dec.hv },
                  { chars: dec.raw.I, label: 'I', color: '#cba6f7', tip: dec.group },
                  { chars: dec.raw.run, label: 'J', color: '#fab387', tip: 'Running: ' + dec.running },
                ].filter(s => s.chars).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                    {i > 0 && <div style={{ color: 'var(--bord2)', fontSize: 14, paddingBottom: 14 }}>·</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div title={s.tip} style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: s.color, padding: '3px 7px', borderRadius: 5, background: s.color + '12', border: `1.5px solid ${s.color}40`, letterSpacing: '.1em' }}>{s.chars}</div>
                      <div style={{ fontSize: 8, color: s.color, fontWeight: 600, marginTop: 1 }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
                {[
                  ['หมวดสินค้า (A)', dec.category],
                  ['ประเภท (B)', dec.type],
                  ['กำลังไฟฟ้า (CDEF)', (dec.kva ?? '?') + ' kVA'],
                  ['แรงดันสูง (GH)', dec.hv],
                  ['กลุ่ม/มาตรฐาน (I)', dec.group],
                  ['Running No.', dec.running],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '6px 8px', background: 'var(--bg3)', borderRadius: 5, border: '1px solid var(--bord)' }}>
                    <div style={{ fontSize: 8, color: 'var(--txt3)', marginBottom: 1 }}>{k}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt)' }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '7px 10px', background: 'rgba(249,226,175,.06)', borderRadius: 6, border: '1px solid rgba(249,226,175,.2)', fontSize: 11 }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', letterSpacing: '.08em' }}>{decInput.toUpperCase()}</span>
                <span style={{ color: 'var(--txt2)', marginLeft: 8 }}>= {dec.kva} kVA · {dec.type} · HV {dec.hv}</span>
              </div>
            </>
          )}
        </div>

        {/* Encoder */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>🔧 Encoder — สร้างรหัส</div>

          {[
            { label: 'A — หมวดสินค้า', key: 'A', opts: Object.entries(CAT_A).map(([k, v]) => ({ v: k, l: `${k}: ${v}` })) },
            { label: 'B — ประเภทหม้อแปลง', key: 'B', opts: Object.entries(IC_TYPE).map(([k, v]) => ({ v: k, l: `${k}: ${v}` })) },
            { label: 'GH — แรงดัน HV', key: 'GH', opts: Object.entries(IC_GH).map(([k, v]) => ({ v: k, l: `${k}: ${v}` })) },
            { label: 'I — กลุ่ม/มาตรฐาน', key: 'I', opts: Object.entries(IC_GRP).map(([k, v]) => ({ v: k, l: `${k}: ${v}` })) },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: 'var(--txt2)', display: 'block', marginBottom: 3 }}>{f.label}</label>
              <select value={(enc as unknown as Record<string, string>)[f.key]}
                onChange={e => setEnc(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={inp({ fontSize: 11 })}>
                {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: 'var(--txt2)', display: 'block', marginBottom: 3 }}>CDEF — ขนาด kVA</label>
            <select value={enc.kva} onChange={e => setEnc(prev => ({ ...prev, kva: parseInt(e.target.value) }))} style={inp({ fontSize: 11 })}>
              {KVA_LIST.map(k => {
                const cf = encodeKva(k)
                return cf ? <option key={k} value={k}>{k.toLocaleString()} kVA → {cf}</option> : null
              })}
            </select>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: 'var(--txt2)', display: 'block', marginBottom: 3 }}>J(KLM) — Running No.</label>
            <input type="text" maxLength={6} value={enc.run}
              onChange={e => setEnc(prev => ({ ...prev, run: e.target.value }))}
              style={{ ...inp({}), fontFamily: 'var(--mono)' }} />

          </div>

          {encCode ? (
            <div style={{ padding: '10px 14px', background: 'rgba(166,227,161,.08)', borderRadius: 8, border: '1px solid rgba(166,227,161,.3)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green)', letterSpacing: '.12em', marginBottom: 4 }}>{encCode}</div>
              <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{enc.kva.toLocaleString()} kVA · {IC_TYPE[enc.B]} · HV {IC_GH[enc.GH]}</div>
            </div>
          ) : (
            <div style={{ padding: '10px', background: 'var(--bg3)', borderRadius: 8, textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>ไม่สามารถสร้างรหัสได้ (kVA ไม่ถูกต้อง)</div>
          )}
        </div>
      </div>

      {/* kVA Reference Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg3)', borderBottom: '1px solid var(--bord)', cursor: 'pointer' }}
          onClick={() => setShowRef(r => !r)}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>📊 ตาราง kVA → CDEF Reference</div>
          <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{showRef ? '▲' : '▼'}</div>
        </div>
        {showRef && (
          <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {kvaRef.map(r => r && (
              <div key={r.kva} style={{ background: 'var(--bg3)', borderRadius: 7, padding: '6px 10px', border: '1px solid var(--bord)', textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{r.kva!.toLocaleString()}</div>
                <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 1 }}>kVA</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginTop: 3 }}>{r.code}</div>
                <div style={{ fontSize: 8, color: 'var(--txt3)' }}>CDEF</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Guide / Reference */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--bg3)', borderBottom: showGuide ? '1px solid var(--bord)' : 'none', cursor: 'pointer' }}
          onClick={() => setShowGuide(g => !g)}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>📖 คู่มือ Item Code — EN-T-001</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>Transformer Item Code Data Logic · โครงสร้าง AB CDEF GH I J(KLM) · 10–12 หลัก</div>
          </div>
          <div style={{ fontSize: 18, color: 'var(--txt3)', marginLeft: 16 }}>{showGuide ? '▲' : '▼'}</div>
        </div>
        {showGuide && (
          <div style={{ padding: '24px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── Structure banner ── */}
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '16px 20px', border: '1px solid var(--bord)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>โครงสร้างรหัส</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
                {[
                  { seg: 'A', color: '#f38ba8', desc: 'หมวดสินค้า', sub: '1 digit' },
                  { seg: 'B', color: '#f9e2af', desc: 'ประเภทหม้อแปลง', sub: '1 digit' },
                  { seg: 'CDEF', color: '#a6e3a1', desc: 'ขนาด kVA', sub: '4 digits' },
                  { seg: 'GH', color: '#89b4fa', desc: 'แรงดัน HV', sub: '2 digits' },
                  { seg: 'I', color: '#cba6f7', desc: 'กลุ่ม/มาตรฐาน', sub: '1 digit' },
                  { seg: 'J(KLM)', color: '#fab387', desc: 'Running No.', sub: '1–4 digits' },
                ].map((s, i) => (
                  <div key={s.seg} style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                    {i > 0 && <div style={{ color: 'var(--txt3)', fontSize: 22, paddingBottom: 22, fontWeight: 300 }}>·</div>}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 900, color: s.color, padding: '8px 14px', borderRadius: 8, background: s.color + '18', border: `2px solid ${s.color}50`, letterSpacing: '.12em', minWidth: 52 }}>{s.seg}</div>
                      <div style={{ fontSize: 10, color: s.color, fontWeight: 700, marginTop: 4 }}>{s.desc}</div>
                      <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 1 }}>{s.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--amber)', background: 'rgba(249,226,175,.08)', padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(249,226,175,.2)', display: 'inline-block', letterSpacing: '.1em' }}>
                A B · C D E F · G H · I · J(KLM)
              </div>
            </div>

            {/* ── Digits 1 & 2 ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
              {/* A */}
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--bord)', borderTop: '3px solid #f38ba8' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f38ba8', marginBottom: 12 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 18, marginRight: 8 }}>A</span>หมวดสินค้า
                </div>
                {[['5','Finished Transformer','สำเร็จรูป'],['4','90% Semi-Finished','ใช้ภายใน']].map(([c, en, th]) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--bord)' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 900, color: '#f38ba8', minWidth: 24, textAlign: 'center' }}>{c}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{en}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{th}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* B */}
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--bord)', borderTop: '3px solid #f9e2af' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f9e2af', marginBottom: 12 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 18, marginRight: 8 }}>B</span>ประเภทหม้อแปลง
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                  {[
                    ['1 / C','3 Ph. Conservator Type','C = High Loss'],
                    ['2 / N','3 Ph. N₂ Gas Sealed','N = High Loss'],
                    ['3 / F','3 Ph. Hermetically Sealed — Full Oil','F = High Loss'],
                    ['4','3 Ph. Cast Resin','Dry Type'],
                    ['5','3 Ph. Pad Mounted',''],
                    ['6','Dry Type','Class H, Class A'],
                    ['8','Special Type',''],
                    ['9','1 Phase',''],
                  ].map(([c, en, note]) => (
                    <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--bord)' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 900, color: '#f9e2af', minWidth: 36 }}>{c}</span>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--txt)' }}>{en}</div>
                        {note && <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── kVA Logic ── */}
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--bord)', borderTop: '3px solid #a6e3a1' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#a6e3a1', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 18, marginRight: 8 }}>CDEF</span>ขนาด kVA — สูตรคำนวณ
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ padding: '10px 18px', background: 'rgba(166,227,161,.1)', borderRadius: 8, border: '1px solid rgba(166,227,161,.3)', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: '#a6e3a1', letterSpacing: '.06em' }}>DEF × 10<sup style={{ fontSize: 12 }}>C</sup></div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>= VA → ÷ 1,000 = kVA</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.7 }}>
                  <div><strong style={{ color: 'var(--txt)' }}>C</strong> = ตัวคูณ (เลขยกกำลังของ 10)</div>
                  <div><strong style={{ color: 'var(--txt)' }}>DEF</strong> = ค่าฐาน (3 หลัก)</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { kva: '30 kVA', code: '2300', calc: '300 × 10² = 30,000 VA' },
                  { kva: '160 kVA', code: '3160', calc: '160 × 10³ = 160,000 VA' },
                  { kva: '1,000 kVA', code: '4100', calc: '100 × 10⁴ = 1,000,000 VA' },
                  { kva: '1,500 kVA', code: '4150', calc: '150 × 10⁴ = 1,500,000 VA' },
                ].map(ex => (
                  <div key={ex.code} style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--bord)', textAlign: 'center', flex: '1 1 140px' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 900, color: '#a6e3a1' }}>{ex.code}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', margin: '4px 0' }}>{ex.kva}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{ex.calc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── GH & I ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* GH */}
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--bord)', borderTop: '3px solid #89b4fa' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#89b4fa', marginBottom: 12 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 18, marginRight: 8 }}>GH</span>แรงดัน HV
                </div>
                {[['01','0–1,000 V'],['11','11,000 V'],['19','19,000 V'],['22','22,000 V'],['33','33,000–36,000 V'],['40','11,000 / 22,000 V (Dual)']].map(([c,d]) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--bord)' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 900, color: '#89b4fa', minWidth: 32 }}>{c}</span>
                    <span style={{ fontSize: 13, color: 'var(--txt2)' }}>{d}</span>
                  </div>
                ))}
              </div>

              {/* I */}
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--bord)', borderTop: '3px solid #cba6f7' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#cba6f7', marginBottom: 12 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 18, marginRight: 8 }}>I</span>กลุ่ม / มาตรฐาน / วัสดุ
                </div>
                {[
                  ['A / C','Ekarat Standard','A=Foil · C=Wire'],
                  ['E / F','PEA Standard','E=Foil · F=Wire'],
                  ['I / J','MEA Standard','I=Foil · J=Wire'],
                  ['S','Special Add-ons','Cable Box, Control, Conservator'],
                  ['H / L','Aluminum Winding','H=HV only · L=HV & LV'],
                ].map(([c,en,note]) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--bord)' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 900, color: '#cba6f7', minWidth: 40 }}>{c}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{en}</div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Running No ── */}
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '14px 18px', border: '1px solid var(--bord)', borderTop: '3px solid #fab387', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 900, color: '#fab387' }}>J(KLM)</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fab387', marginBottom: 3 }}>หมายเลขวิ่ง (Running Number)</div>
                <div style={{ fontSize: 12, color: 'var(--txt2)' }}>ลำดับที่ใช้แยกแบบการออกแบบในรุ่นเดียวกัน — เช่น <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt)' }}>1</span>, <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt)' }}>001</span>, <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt)' }}>S001</span></div>
              </div>
            </div>

            {/* ── Decoding Examples ── */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 14 }}>ตัวอย่างการถอดรหัส</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  {
                    code: '51410022A1',
                    segs: [
                      { chars: '5',    label: 'A',    color: '#f38ba8', meaning: 'Finished Transformer' },
                      { chars: '1',    label: 'B',    color: '#f9e2af', meaning: '3 Ph. Conservator Type' },
                      { chars: '4100', label: 'CDEF', color: '#a6e3a1', meaning: '1,000 kVA (100 × 10⁴)' },
                      { chars: '22',   label: 'GH',   color: '#89b4fa', meaning: '22,000 V HV System' },
                      { chars: 'A',    label: 'I',    color: '#cba6f7', meaning: 'Ekarat Standard (Foil Winding)' },
                      { chars: '1',    label: 'J',    color: '#fab387', meaning: 'Design Sequence No. 1' },
                    ]
                  },
                  {
                    code: '53415022S001',
                    segs: [
                      { chars: '5',    label: 'A',    color: '#f38ba8', meaning: 'Finished Transformer' },
                      { chars: '3',    label: 'B',    color: '#f9e2af', meaning: '3 Ph. Hermetically Sealed — Full Oil' },
                      { chars: '4150', label: 'CDEF', color: '#a6e3a1', meaning: '1,500 kVA (150 × 10⁴)' },
                      { chars: '22',   label: 'GH',   color: '#89b4fa', meaning: '22,000 V HV System' },
                      { chars: 'S',    label: 'I',    color: '#cba6f7', meaning: 'Special Add-on (+Cable Box Type 1)' },
                      { chars: '001',  label: 'KLM',  color: '#fab387', meaning: 'Design Sequence No. 001' },
                    ]
                  },
                ].map(ex => (
                  <div key={ex.code} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--bord)' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 900, color: 'var(--amber)', marginBottom: 14, letterSpacing: '.1em' }}>{ex.code}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
                      {ex.segs.map(s => (
                        <div key={s.label} style={{ padding: '4px 8px', borderRadius: 5, background: s.color + '18', border: `1.5px solid ${s.color}50`, textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: s.color, fontSize: 13 }}>{s.chars}</div>
                          <div style={{ fontSize: 8, color: s.color, opacity: 0.8, marginTop: 1 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    {ex.segs.map(s => (
                      <div key={s.label} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--bord)' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: s.color, minWidth: 36 }}>{s.chars}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: s.color, opacity: 0.7, minWidth: 28 }}>{s.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--txt2)' }}>{s.meaning}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
