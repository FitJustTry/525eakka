import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

const GROUPS = ['transformer', 'tank']

function productGroup(key: string) {
  if (key.startsWith('tr.') || key.startsWith('Tr.')) return 'transformer'
  if (key.startsWith('tank.')) return 'tank'
  return 'other'
}

export default function CatalogTab() {
  const { state } = useApp()
  const { products, wcConfig } = state

  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const q = search.toLowerCase()
  const entries = useMemo(() => {
    return Object.entries(products)
      .filter(([k, p]) => {
        if (filterGroup && productGroup(k) !== filterGroup) return false
        if (q && !p.label.toLowerCase().includes(q) && !k.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => a[1].kva - b[1].kva)
  }, [products, filterGroup, q])

  const sel = selected ? products[selected] : null

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left: list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>📦 Product Catalog</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>สูตรการผลิตและ Routing ของแต่ละรุ่น</div>
          </div>
        </div>

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

      {/* Right: detail */}
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

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Routing Operations</div>
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
          ))}
        </div>
      )}
    </div>
  )
}
