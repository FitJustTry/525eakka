import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../../context/AppContext'

const GROUPS = ['transformer', 'tank']

function productGroup(key: string) {
  if (key.startsWith('tr.') || key.startsWith('Tr.')) return 'transformer'
  if (key.startsWith('tank.')) return 'tank'
  return 'other'
}

interface SapOp { wc: string; op: string; hrs: number; rows: number }
interface SapEntry { mat: string; desc: string; plant: string; total_hrs: number; ops: SapOp[]; order_nos?: string[] }
interface RealOp { wc: string; op: string; hrs: number; materials: number }
interface RealRouting { kva: number; ops: RealOp[]; total_hrs: number }

export default function CatalogTab() {
  const { state } = useApp()
  const { products, wcConfig } = state

  const [mode, setMode] = useState<'products' | 'sap'>('products')
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  // Real SAP routing for selected product
  const [realRouting, setRealRouting] = useState<RealRouting | null>(null)
  const [realLoading, setRealLoading] = useState(false)

  // SAP routing state
  const [sapData, setSapData] = useState<SapEntry[]>([])
  const [sapLoading, setSapLoading] = useState(false)
  const [sapSelected, setSapSelected] = useState<string | null>(null)
  const [sapSearchResults, setSapSearchResults] = useState<SapEntry[] | null>(null) // null = show all catalog
  const [sapSearching, setSapSearching] = useState(false)

  useEffect(() => {
    if (mode === 'sap' && sapData.length === 0) {
      setSapLoading(true)
      fetch('/api/sap-routing/catalog')
        .then(r => r.json())
        .then(d => { setSapData(Array.isArray(d) ? d : []); setSapLoading(false) })
        .catch(() => setSapLoading(false))
    }
  }, [mode])

  // Live search — fires 400ms after typing stops
  useEffect(() => {
    if (mode !== 'sap') return
    if (!search.trim()) { setSapSearchResults(null); return }
    const t = setTimeout(() => {
      setSapSearching(true)
      fetch(`/api/sap-routing/search?q=${encodeURIComponent(search.trim())}`)
        .then(r => r.json())
        .then(d => { setSapSearchResults(Array.isArray(d) ? d : []); setSapSearching(false) })
        .catch(() => setSapSearching(false))
    }, 400)
    return () => clearTimeout(t)
  }, [search, mode])

  // Fetch real SAP routing whenever a product is selected
  useEffect(() => {
    if (!selected) { setRealRouting(null); return }
    const kva = products[selected]?.kva
    if (!kva) return
    setRealLoading(true)
    setRealRouting(null)
    fetch(`/api/sap-routing/by-kva?kva=${kva}`)
      .then(r => r.json())
      .then(d => { setRealRouting(d); setRealLoading(false) })
      .catch(() => setRealLoading(false))
  }, [selected])

  const q = search.toLowerCase()

  // Product catalog entries
  const entries = useMemo(() => {
    return Object.entries(products)
      .filter(([k, p]) => {
        if (filterGroup && productGroup(k) !== filterGroup) return false
        if (q && !p.label.toLowerCase().includes(q) && !k.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => a[1].kva - b[1].kva)
  }, [products, filterGroup, q])

  // SAP catalog entries
  // When search active → use live search results; otherwise use catalog with local filter
  const sapEntries = useMemo(() => {
    if (sapSearchResults !== null) return sapSearchResults
    if (!q) return sapData
    return sapData.filter(e =>
      e.mat.toLowerCase().includes(q) ||
      e.desc.toLowerCase().includes(q) ||
      e.ops.some(o => o.wc.toLowerCase().includes(q) || o.op.toLowerCase().includes(q))
    )
  }, [sapData, sapSearchResults, q])

  const sel = selected ? products[selected] : null
  const sapSel = sapSelected ? sapData.find(e => e.mat === sapSelected) ?? null : null

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
      {/* Mode toggle header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--bord)', background: 'var(--bg2)', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>📦 Product Catalog</span>
        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>สูตรการผลิตและ Routing ของแต่ละรุ่น</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {([['products', '📦 Product'], ['sap', '⚙️ SAP Routing']] as const).map(([m, lbl]) => (
            <button key={m} onClick={() => { setMode(m); setSearch('') }}
              style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, border: `1px solid ${mode === m ? 'var(--blue)' : 'var(--bord2)'}`, background: mode === m ? 'rgba(137,180,250,.15)' : 'var(--bg3)', color: mode === m ? 'var(--blue)' : 'var(--txt2)', fontWeight: mode === m ? 700 : 400, cursor: 'pointer' }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── PRODUCT CATALOG MODE ── */}
        {mode === 'products' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
              {/* KPI */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  ['ผลิตภัณฑ์ทั้งหมด', Object.keys(products).length, 'var(--txt)'],
                  ['หม้อแปลง', Object.keys(products).filter(k => productGroup(k) === 'transformer').length, 'var(--blue)'],
                  ['ตัวถัง', Object.keys(products).filter(k => productGroup(k) === 'tank').length, 'var(--amber)'],
                ].map(([lbl, val, col]) => (
                  <div key={String(lbl)} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--bord)' }}>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{lbl}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: col as string }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="text" placeholder="ค้นหาผลิตภัณฑ์..." value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none', width: 220 }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  {['', ...GROUPS, 'other'].map(g => (
                    <button key={g} onClick={() => setFilterGroup(g)}
                      style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: filterGroup === g ? 'var(--blue)' : 'var(--bg3)', color: filterGroup === g ? '#000' : 'var(--txt2)', cursor: 'pointer', fontWeight: filterGroup === g ? 700 : 400 }}>
                      {g === '' ? 'ทั้งหมด' : g === 'transformer' ? 'หม้อแปลง' : g === 'tank' ? 'ตัวถัง' : 'อื่นๆ'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                {entries.map(([key, p]) => {
                  const group = productGroup(key)
                  const groupCol = group === 'transformer' ? 'var(--blue)' : group === 'tank' ? 'var(--amber)' : 'var(--txt3)'
                  const isSel = selected === key
                  return (
                    <div key={key} onClick={() => setSelected(isSel ? null : key)}
                      style={{ background: 'var(--bg2)', border: `1px solid ${isSel ? 'var(--blue)' : 'var(--bord)'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'border-color .15s' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--amber)' }}>{key}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt)', marginTop: 2 }}>{p.label.split('—')[1]?.trim() ?? p.label}</div>
                        </div>
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: groupCol + '20', color: groupCol, fontWeight: 700, flexShrink: 0 }}>
                          {group === 'transformer' ? 'Tr' : group === 'tank' ? 'Tank' : 'Other'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                        {[
                          [p.kva.toLocaleString() + ' kVA', 'kVA'],
                          [p.std_hrs.toFixed(1) + ' h', 'STD hrs'],
                          [p.ops.length + ' ops', 'Operations'],
                        ].map(([val, lbl]) => (
                          <div key={lbl} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '5px 7px', textAlign: 'center' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{val}</div>
                            <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 1 }}>{lbl}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {entries.length === 0 && (
                  <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>ไม่พบผลิตภัณฑ์ที่ตรงกับการค้นหา</div>
                )}
              </div>
            </div>

            {/* Product detail panel */}
            {sel && selected && (
              <div style={{ width: 340, borderLeft: '1px solid var(--bord)', overflowY: 'auto', padding: '1.25rem', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{selected}</div>
                  <button onClick={() => setSelected(null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12 }}>{sel.label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                  {[['kVA', sel.kva.toLocaleString()], ['STD hrs', sel.std_hrs.toFixed(1)], ['Operations', sel.ops.length]].map(([lbl, val]) => (
                    <div key={lbl} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, color: 'var(--txt3)', marginBottom: 2 }}>{lbl}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{val}</div>
                    </div>
                  ))}
                </div>
                {/* ── Real SAP routing — flow pipeline ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.06em' }}>⚙ SAP Routing Flow</div>
                  {realLoading && <span style={{ fontSize: 10, color: 'var(--txt3)' }}>กำลังโหลด…</span>}
                  {realRouting && <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{realRouting.ops.length} ops · {realRouting.total_hrs.toFixed(1)}h · {realRouting.ops[0]?.materials ?? 0} materials</span>}
                </div>

                {!realLoading && realRouting && realRouting.ops.length > 0 && (() => {
                  // Sort by SAP sequence number (op field: "0010", "0020"…)
                  const sorted = [...realRouting.ops].sort((a, b) => {
                    const na = parseInt(a.op) || 9999
                    const nb = parseInt(b.op) || 9999
                    return na - nb
                  })
                  const maxHrs = Math.max(...sorted.map(o => o.hrs))
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {sorted.map((op, i) => {
                        const pct = maxHrs > 0 ? op.hrs / maxHrs : 0
                        const wcName = wcConfig[op.wc]?.name ?? op.wc
                        const isLast = i === sorted.length - 1
                        // Color by WC prefix
                        const col = op.wc.startsWith('EE3') ? 'var(--blue)'
                          : op.wc.startsWith('EE4') ? 'var(--green)'
                          : op.wc.startsWith('PT') ? 'var(--purple)'
                          : 'var(--amber)'
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
                            {/* Connector line */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                              <div style={{ width: 2, height: 10, background: i === 0 ? 'transparent' : 'var(--bord2)' }} />
                              <div style={{ width: 20, height: 20, borderRadius: '50%', background: col + '22', border: `2px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: col, fontWeight: 700, flexShrink: 0 }}>
                                {op.op ? op.op.replace(/^0+/, '') : i + 1}
                              </div>
                              {!isLast && <div style={{ width: 2, flex: 1, minHeight: 10, background: 'var(--bord2)' }} />}
                            </div>
                            {/* Card */}
                            <div style={{ flex: 1, margin: '4px 0 4px 6px', padding: '7px 10px', background: col + '0a', border: `1px solid ${col}33`, borderRadius: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt)' }}>{wcName}</div>
                                  <div style={{ fontSize: 9, color: col, fontFamily: 'var(--mono)', marginTop: 1 }}>{op.wc}</div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: col }}>{op.hrs.toFixed(2)}h</div>
                                  <div style={{ fontSize: 8, color: 'var(--txt3)' }}>{op.materials}mat avg</div>
                                </div>
                              </div>
                              {/* Hours bar */}
                              <div style={{ marginTop: 5, height: 3, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${pct * 100}%`, height: '100%', background: col, borderRadius: 2, transition: 'width .3s' }} />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {!realLoading && realRouting && realRouting.ops.length === 0 && (
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 12 }}>ไม่พบข้อมูล SAP Routing สำหรับ {sel.kva.toLocaleString()}kVA</div>
                )}

                {/* ── Stored routing (from products table) — only shown when no real SAP data ── */}
                {sel.ops.length > 0 && (!realRouting || realRouting.ops.length === 0) && <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt3)', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>📦 Product Catalog Routing <span style={{ fontSize: 9, fontWeight: 400 }}>(static — no SAP data found)</span></div>
                  {sel.ops.map((op, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--bg3)', borderRadius: 7, marginBottom: 4 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--bg4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--txt3)', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600 }}>{op.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--amber)', fontFamily: 'var(--mono)', marginTop: 1 }}>{op.wc} · {wcConfig[op.wc]?.name ?? ''}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}>{op.hrs.toFixed(2)}h</div>
                      <div style={{ fontSize: 9, color: 'var(--txt3)' }}>STD</div>
                    </div>
                  </div>
                ))}</>}
              </div>
            )}
          </>
        )}

        {/* ── SAP ROUTING MODE ── */}
        {mode === 'sap' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
              {/* KPI */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  ['Material Codes', sapData.length, 'var(--txt)'],
                  ['Total Operations', sapData.reduce((s, e) => s + e.ops.length, 0), 'var(--blue)'],
                  ['Work Centers', [...new Set(sapData.flatMap(e => e.ops.map(o => o.wc)))].length, 'var(--green)'],
                ].map(([lbl, val, col]) => (
                  <div key={String(lbl)} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--bord)' }}>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{lbl}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: col as string }}>{sapLoading ? '…' : val}</div>
                  </div>
                ))}
              </div>

              {/* Search */}
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="text" placeholder="ค้นหา: Sales Order / Material Code / คำอธิบาย / WC / Operation..." value={search}
                  onChange={e => { setSearch(e.target.value); setSapSelected(null) }}
                  style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none', width: 360 }} />
                {sapSearching && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>กำลังค้นหา…</span>}
                {!sapSearching && search && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{sapEntries.length} results</span>}
                {search && <button onClick={() => { setSearch(''); setSapSearchResults(null) }}
                  style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>✕ ล้าง</button>}
              </div>

              {sapLoading && <div style={{ color: 'var(--txt3)', fontSize: 13, padding: 20 }}>กำลังโหลด SAP Routing…</div>}

              {!sapLoading && sapData.length === 0 && (
                <div style={{ color: 'var(--txt3)', fontSize: 13, padding: 20 }}>ยังไม่มีข้อมูล SAP Routing — ไปที่ Import → SAP เพื่อนำเข้าข้อมูล</div>
              )}

              {/* List */}
              {!sapLoading && sapEntries.map(e => {
                const isSel = sapSelected === e.mat
                return (
                  <div key={e.mat} onClick={() => setSapSelected(isSel ? null : e.mat)}
                    style={{ background: 'var(--bg2)', border: `1px solid ${isSel ? 'var(--blue)' : 'var(--bord)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 6, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--amber)' }}>{e.mat}</div>
                        {e.desc && <div style={{ fontSize: 10, color: 'var(--txt2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.desc}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, fontSize: 10 }}>
                        <span style={{ background: 'rgba(137,180,250,.15)', color: 'var(--blue)', padding: '2px 8px', borderRadius: 5, fontFamily: 'var(--mono)', fontWeight: 600 }}>{e.ops.length} ops</span>
                        <span style={{ background: 'rgba(166,227,161,.12)', color: 'var(--green)', padding: '2px 8px', borderRadius: 5, fontFamily: 'var(--mono)', fontWeight: 600 }}>{e.total_hrs.toFixed(1)}h</span>
                        {e.plant && <span style={{ background: 'var(--bg3)', color: 'var(--txt3)', padding: '2px 8px', borderRadius: 5 }}>{e.plant}</span>}
                      </div>
                    </div>
                    {/* Order nos (when found via search) */}
                    {!isSel && e.order_nos && e.order_nos.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {e.order_nos.slice(0, 6).map(o => (
                          <span key={o} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(250,179,135,.12)', color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{o}</span>
                        ))}
                        {e.order_nos.length > 6 && <span style={{ fontSize: 9, color: 'var(--txt3)' }}>+{e.order_nos.length - 6}</span>}
                      </div>
                    )}
                    {/* Inline flow preview sorted by sequence */}
                    {!isSel && (
                      <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {[...e.ops].sort((a, b) => (parseInt(a.op)||9999) - (parseInt(b.op)||9999)).slice(0, 8).map((op, i, arr) => (
                          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4,
                              background: op.wc.startsWith('EE3') ? 'rgba(137,180,250,.15)' : op.wc.startsWith('EE4') ? 'rgba(166,227,161,.15)' : op.wc.startsWith('PT') ? 'rgba(203,166,247,.15)' : 'rgba(250,179,135,.15)',
                              color: op.wc.startsWith('EE3') ? 'var(--blue)' : op.wc.startsWith('EE4') ? 'var(--green)' : op.wc.startsWith('PT') ? 'var(--purple)' : 'var(--amber)',
                              fontFamily: 'var(--mono)', fontWeight: 600 }}>
                              {op.wc}
                            </span>
                            {i < arr.length - 1 && <span style={{ fontSize: 8, color: 'var(--bord2)' }}>→</span>}
                          </span>
                        ))}
                        {e.ops.length > 8 && <span style={{ fontSize: 9, color: 'var(--txt3)' }}>+{e.ops.length - 8}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* SAP detail panel */}
            {sapSel && (
              <div style={{ width: 380, borderLeft: '1px solid var(--bord)', overflowY: 'auto', padding: '1.25rem', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{sapSel.mat}</div>
                    {sapSel.desc && <div style={{ fontSize: 10, color: 'var(--txt2)', marginTop: 2, maxWidth: 280 }}>{sapSel.desc}</div>}
                  </div>
                  <button onClick={() => setSapSelected(null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>

                {sapSel.order_nos && sapSel.order_nos.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, color: 'var(--txt3)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Sales / Production Orders</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {sapSel.order_nos.map(o => (
                        <span key={o} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: 'rgba(250,179,135,.12)', color: 'var(--amber)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{o}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
                  {[
                    ['Operations', sapSel.ops.length],
                    ['Total hrs', sapSel.total_hrs.toFixed(2)],
                    ['Plant', sapSel.plant || '—'],
                  ].map(([lbl, val]) => (
                    <div key={lbl} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'var(--txt3)', marginBottom: 2 }}>{lbl}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{val}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Production Flow</div>
                {(() => {
                  const sorted = [...sapSel.ops].sort((a, b) => (parseInt(a.op) || 9999) - (parseInt(b.op) || 9999))
                  const maxHrs = Math.max(...sorted.map(o => o.hrs))
                  return sorted.map((op, i) => {
                    const pct = maxHrs > 0 ? op.hrs / maxHrs : 0
                    const wcName = wcConfig[op.wc]?.name ?? op.wc
                    const isLast = i === sorted.length - 1
                    const col = op.wc.startsWith('EE3') ? 'var(--blue)'
                      : op.wc.startsWith('EE4') ? 'var(--green)'
                      : op.wc.startsWith('PT') ? 'var(--purple)'
                      : 'var(--amber)'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'stretch' }}>
                        {/* Connector */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                          <div style={{ width: 2, height: 10, background: i === 0 ? 'transparent' : 'var(--bord2)' }} />
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: col + '22', border: `2px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: col, fontWeight: 700, flexShrink: 0 }}>
                            {op.op ? op.op.replace(/^0+/, '') : i + 1}
                          </div>
                          {!isLast && <div style={{ width: 2, flex: 1, minHeight: 10, background: 'var(--bord2)' }} />}
                        </div>
                        {/* Card */}
                        <div style={{ flex: 1, margin: '4px 0 4px 6px', padding: '8px 10px', background: col + '0a', border: `1px solid ${col}33`, borderRadius: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt)' }}>{wcName}</div>
                              <div style={{ fontSize: 9, color: col, fontFamily: 'var(--mono)', marginTop: 1 }}>{op.wc}</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: col }}>{op.hrs.toFixed(2)}h</div>
                              <div style={{ fontSize: 8, color: 'var(--txt3)' }}>{op.rows}× avg</div>
                            </div>
                          </div>
                          <div style={{ marginTop: 5, height: 3, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${pct * 100}%`, height: '100%', background: col, borderRadius: 2 }} />
                          </div>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
