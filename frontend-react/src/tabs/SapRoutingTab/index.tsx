import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { SAP_ROUTING_DB } from '../../data/sapRouting'

const SR_CATS: Record<string, { label: string; color: string }> = {
  all:   { label: 'ทั้งหมด',    color: 'var(--txt2)' },
  tr:    { label: 'หม้อแปลง',  color: 'var(--amber)' },
  tank:  { label: 'ตัวถัง',    color: '#89b4fa' },
  coil:  { label: 'คอยล์',     color: 'var(--green)' },
  core:  { label: 'เหล็กแกน',  color: 'var(--blue)' },
  clamp: { label: 'แคลมป์',    color: 'var(--txt2)' },
  box:   { label: 'BOX',       color: 'var(--red)' },
  other: { label: 'อื่นๆ',     color: 'var(--txt3)' },
}

const LIMIT = 150

// Static lookup for desc/cat/rno by mat code
const STATIC_MAP = new Map(SAP_ROUTING_DB.map(r => [r.mat, r]))

interface CatalogEntry {
  mat: string
  desc: string
  cat: string
  rno: string
  ops: [string, string, string, number][]
  fromDb: boolean
}

export default function SapRoutingTab() {
  const { state } = useApp()
  const { wcConfig } = state

  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [dbEntries, setDbEntries] = useState<CatalogEntry[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sap-routing/catalog')
      .then(r => r.json())
      .then((rows: { mat: string; ops: [string, string, string, number][] }[]) => {
        if (!rows.length) { setDbEntries(null); setLoading(false); return }
        const entries: CatalogEntry[] = rows.map(r => {
          const s = STATIC_MAP.get(r.mat)
          return {
            mat: r.mat,
            desc: s?.desc ?? '',
            cat: s?.cat ?? 'other',
            rno: s?.rno ?? '',
            ops: r.ops,
            fromDb: true,
          }
        })
        setDbEntries(entries)
        setLoading(false)
      })
      .catch(() => { setDbEntries(null); setLoading(false) })
  }, [])

  // Use DB entries when available, otherwise static
  const entries: CatalogEntry[] = useMemo(() => {
    if (dbEntries && dbEntries.length > 0) return dbEntries
    return SAP_ROUTING_DB.map(r => ({ ...r, fromDb: false }))
  }, [dbEntries])

  const isLive = dbEntries && dbEntries.length > 0

  const q = search.toLowerCase()

  const catCounts = useMemo(() => {
    const cnt: Record<string, number> = { all: entries.length }
    entries.forEach(r => { cnt[r.cat] = (cnt[r.cat] ?? 0) + 1 })
    return cnt
  }, [entries])

  const filtered = useMemo(() =>
    entries.filter(r =>
      (cat === 'all' || r.cat === cat) &&
      (!q || r.mat.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q) ||
        r.ops.some(op => op[2].toLowerCase().includes(q) || op[1].toLowerCase().includes(q)))
    ),
    [entries, cat, q]
  )

  const item = selected ? entries.find(r => r.mat === selected) ?? null : null

  const th: React.CSSProperties = { padding: '5px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'var(--txt3)', background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '4px 8px', borderBottom: '0.5px solid var(--bord)', fontSize: 11 }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', fontSize: 13 }}>
      Loading…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '1.25rem 1.5rem 1.25rem' }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          📋 SAP Routing Catalog
          {isLive
            ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(166,227,161,.18)', color: 'var(--green)', border: '1px solid rgba(166,227,161,.3)', fontWeight: 600 }}>📡 Live DB</span>
            : <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(137,180,250,.12)', color: 'var(--blue)', border: '1px solid rgba(137,180,250,.25)', fontWeight: 600 }}>📄 Static</span>
          }
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>
          {isLive
            ? <>Routing จาก DB · <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{entries.length}</span> materials · grouped avg std hrs</>
            : <>Routing จาก Static File · <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{entries.length}</span> รายการ · นำเข้า SAP ใน Import tab เพื่อใช้ข้อมูลจริง</>
          }
        </div>
      </div>

      {/* Cat pills */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.entries(SR_CATS).map(([k, v]) => {
          const cnt = catCounts[k] ?? 0
          if (k !== 'all' && cnt === 0) return null
          const active = cat === k
          return (
            <button key={k} onClick={() => { setCat(k); setSelected(null) }}
              style={{ fontSize: 11, padding: '4px 11px', borderRadius: 16, cursor: 'pointer', fontWeight: active ? 700 : 400, background: active ? v.color + '22' : 'var(--bg3)', border: `1.5px solid ${active ? v.color : 'var(--bord)'}`, color: active ? v.color : 'var(--txt2)', transition: 'all .15s' }}>
              {v.label} <span style={{ fontSize: 9, opacity: 0.65 }}>{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="text" placeholder="ค้นหา Material Code, ชื่อ, หรือ WC..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt)', outline: 'none', width: 300 }} />
        {search && <button onClick={() => setSearch('')} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>✕ ล้าง</button>}
        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{filtered.length} รายการ{filtered.length > LIMIT ? ` (แสดง ${LIMIT})` : ''}</span>
      </div>

      {/* Two-panel layout */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12 }}>
        {/* Left list */}
        <div style={{ border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg2)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.slice(0, LIMIT).map(r => {
              const cc = SR_CATS[r.cat]?.color ?? 'var(--txt3)'
              const tot = r.ops.reduce((s, op) => s + op[3], 0)
              const sel = r.mat === selected
              return (
                <div key={r.mat} onClick={() => setSelected(sel ? null : r.mat)}
                  style={{ padding: '9px 10px', cursor: 'pointer', borderBottom: '0.5px solid var(--bord)', background: sel ? 'var(--bg4)' : 'var(--bg2)', borderLeft: `3px solid ${sel ? cc : 'transparent'}` }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: cc }}>{r.mat}</div>
                  {r.desc
                    ? <div style={{ fontSize: 11, color: 'var(--txt)', marginTop: 1, lineHeight: 1.3 }}>{r.desc}</div>
                    : <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1, fontStyle: 'italic' }}>{r.ops.length} operations</div>
                  }
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: cc + '18', color: cc }}>{SR_CATS[r.cat]?.label ?? r.cat}</span>
                    <span style={{ fontSize: 9, color: 'var(--txt3)' }}>{r.ops.length} ops</span>
                    <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: 700 }}>{tot.toFixed(2)}h</span>
                  </div>
                </div>
              )
            })}
            {filtered.length > LIMIT && (
              <div style={{ padding: 8, textAlign: 'center', fontSize: 10, color: 'var(--txt3)' }}>+{filtered.length - LIMIT} รายการ — พิมพ์เพื่อกรอง</div>
            )}
            {filtered.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--txt3)', fontSize: 12 }}>ไม่พบรายการ</div>
            )}
          </div>
        </div>

        {/* Right detail */}
        <div style={{ overflowY: 'auto' }}>
          {!item ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: 'var(--txt3)', fontSize: 12 }}>
              เลือกรายการจากด้านซ้ายเพื่อดูรายละเอียด routing
            </div>
          ) : (() => {
            const cc = SR_CATS[item.cat]?.color ?? 'var(--txt3)'
            const tot = item.ops.reduce((s, op) => s + op[3], 0)
            const maxH = Math.max(...item.ops.map(op => op[3]))
            const wcSum: Record<string, number> = {}
            item.ops.forEach(op => { wcSum[op[1]] = (wcSum[op[1]] ?? 0) + op[3] })

            return (
              <div style={{ background: 'var(--bg2)', border: `1px solid var(--bord)`, borderRadius: 10, borderLeft: `3px solid ${cc}`, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: cc }}>{item.mat}</div>
                    {item.desc
                      ? <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginTop: 3 }}>{item.desc}</div>
                      : <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3, fontStyle: 'italic' }}>No description</div>
                    }
                    <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.rno && <>Routing No: <span style={{ fontFamily: 'var(--mono)' }}>{item.rno}</span> · </>}
                      <span style={{ padding: '1px 6px', borderRadius: 3, background: cc + '18', color: cc }}>{SR_CATS[item.cat]?.label ?? item.cat}</span>
                      {item.fromDb && <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(166,227,161,.15)', color: 'var(--green)', fontSize: 9 }}>avg hrs from DB</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', color: cc }}>{tot.toFixed(2)}<span style={{ fontSize: 12, fontWeight: 400 }}> h</span></div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{item.ops.length} operations</div>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 12 }}>
                  <thead>
                    <tr>
                      {!item.fromDb && <th style={{ ...th, width: 44 }}>Op</th>}
                      <th style={{ ...th, width: 76 }}>WC</th>
                      <th style={th}>ชื่องาน</th>
                      <th style={{ ...th, textAlign: 'right', width: 60 }}>{item.fromDb ? 'Avg h' : 'STD h'}</th>
                      <th style={{ ...th, width: 120 }}>สัดส่วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.ops.map((op, i) => {
                      const pct = maxH > 0 ? op[3] / maxH * 100 : 0
                      const barCol = op[3] >= maxH * 0.8 ? 'var(--red)' : op[3] >= maxH * 0.5 ? 'var(--amber)' : 'var(--green)'
                      const wcName = wcConfig[op[1]]?.name
                      return (
                        <tr key={i} style={{ borderBottom: '0.5px solid var(--bord)', background: i % 2 ? 'var(--bg3)' : 'transparent' }}>
                          {!item.fromDb && <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--txt3)' }}>{op[0]}</td>}
                          <td style={td}>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--amber)' }}>{op[1]}</div>
                            {wcName && <div style={{ fontSize: 8, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>{wcName}</div>}
                          </td>
                          <td style={{ ...td, color: 'var(--txt2)' }}>{op[2]}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: barCol }}>{op[3].toFixed(3)}</td>
                          <td style={td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ flex: 1, height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct.toFixed(0)}%`, background: barCol, borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 8, color: 'var(--txt3)', width: 24, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg3)', borderTop: '1px solid var(--bord2)' }}>
                      <td colSpan={item.fromDb ? 3 : 4} style={{ ...td, fontWeight: 700, fontSize: 11 }}>รวม</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, color: cc, fontSize: 12 }}>{tot.toFixed(3)}</td>
                      <td style={td} />
                    </tr>
                  </tfoot>
                </table>

                {/* WC summary chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {Object.entries(wcSum).map(([wc, h]) => {
                    const pct = tot > 0 ? h / tot * 100 : 0
                    const col = h >= maxH * 0.8 ? 'var(--red)' : h >= maxH * 0.5 ? 'var(--amber)' : 'var(--green)'
                    const wcName = wcConfig[wc]?.name ?? ''
                    return (
                      <div key={wc} style={{ padding: '5px 9px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--bord)', textAlign: 'center', minWidth: 72 }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: 'var(--amber)' }}>{wc}</div>
                        {wcName && <div style={{ fontSize: 8, color: 'var(--txt3)', marginTop: 1, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wcName}</div>}
                        <div style={{ fontSize: 13, fontWeight: 800, color: col, fontFamily: 'var(--mono)' }}>{h.toFixed(2)}</div>
                        <div style={{ fontSize: 8, color: 'var(--txt3)' }}>{pct.toFixed(0)}%</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
