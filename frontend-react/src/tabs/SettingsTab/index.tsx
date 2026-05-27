import { useApp } from '../../context/AppContext'
import { api } from '../../api'
import type { WCConfig } from '../../types'

export default function SettingsTab() {
  const { state, dispatch } = useApp()
  const { wcConfig } = state

  async function handleChange(wc: string, field: keyof WCConfig, raw: string) {
    const val = field === 'name' ? raw : parseInt(raw) || 0
    const updated = { ...wcConfig, [wc]: { ...wcConfig[wc], [field]: val } }
    dispatch({ type: 'SET_WC_CONFIG', wcConfig: updated })
    await api.wcConfig.update(wc, updated[wc])
  }

  const allWCs = Object.keys(wcConfig).sort()

  const th: React.CSSProperties = { padding: '7px 8px', textAlign: 'left', color: 'var(--txt3)', fontSize: 10, fontWeight: 600, background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--bord)', fontSize: 11 }

  function NumInput({ wc, field, val, col }: { wc: string; field: keyof WCConfig; val: number; col?: string }) {
    return (
      <input
        type="number" min={0} defaultValue={val}
        onBlur={e => handleChange(wc, field, e.target.value)}
        style={{ width: 54, fontFamily: 'var(--mono)', fontSize: 11, color: col ?? 'var(--txt)', background: 'var(--bg4)', border: '1px solid var(--bord2)', borderRadius: 4, padding: '3px 4px', textAlign: 'center', outline: 'none' }}
      />
    )
  }

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>⚙ ตั้งค่า Work Center</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>
          STD ÷ Eff = ชั่วโมงจริง · Eff ≥ 90% <span style={{ color: 'var(--green)' }}>●</span> · 80–89% <span style={{ color: 'var(--amber)' }}>●</span> · &lt; 80% <span style={{ color: 'var(--red)' }}>●</span>
        </div>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={th}>WC</th>
                <th style={{ ...th, minWidth: 140 }}>ชื่อ</th>
                <th style={{ ...th, textAlign: 'center' }}>คน</th>
                <th style={{ ...th, textAlign: 'center', color: 'var(--blue)' }}>จ–ศ h</th>
                <th style={{ ...th, textAlign: 'center' }}>OT h</th>
                <th style={{ ...th, textAlign: 'center', color: 'var(--amber)' }}>เสาร์ h</th>
                <th style={{ ...th, textAlign: 'center' }}>เสาร์ OT</th>
                <th style={{ ...th, textAlign: 'center', color: 'var(--green)' }}>Eff %</th>
                <th style={{ ...th, textAlign: 'center' }}>Normal/สัปดาห์</th>
              </tr>
            </thead>
            <tbody>
              {allWCs.map(wc => {
                const cfg = wcConfig[wc]
                const normal = cfg.workers * cfg.hrs * 5 + cfg.workers * cfg.sat_hrs
                const effCol = cfg.eff >= 90 ? 'var(--green)' : cfg.eff >= 80 ? 'var(--amber)' : 'var(--red)'
                return (
                  <tr key={wc} style={{ background: 'transparent' }} onMouseOver={e => (e.currentTarget.style.background = 'var(--bg3)')} onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: 700 }}>{wc}</td>
                    <td style={td}>
                      <input defaultValue={cfg.name} onBlur={e => handleChange(wc, 'name', e.target.value)}
                        style={{ width: '100%', fontSize: 11, color: 'var(--txt)', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit' }} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}><NumInput wc={wc} field="workers" val={cfg.workers} /></td>
                    <td style={{ ...td, textAlign: 'center' }}><NumInput wc={wc} field="hrs" val={cfg.hrs} col="var(--blue)" /></td>
                    <td style={{ ...td, textAlign: 'center' }}><NumInput wc={wc} field="ot" val={cfg.ot} /></td>
                    <td style={{ ...td, textAlign: 'center' }}><NumInput wc={wc} field="sat_hrs" val={cfg.sat_hrs} col="var(--amber)" /></td>
                    <td style={{ ...td, textAlign: 'center' }}><NumInput wc={wc} field="sat_ot" val={cfg.sat_ot} /></td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input type="number" min={0} max={100} defaultValue={cfg.eff} onBlur={e => handleChange(wc, 'eff', e.target.value)}
                        style={{ width: 54, fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: effCol, background: 'var(--bg4)', border: '1px solid var(--bord2)', borderRadius: 4, padding: '3px 4px', textAlign: 'center', outline: 'none' }} />
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt2)' }}>
                      <span style={{ color: 'var(--green)' }}>{normal}h</span>
                      <span style={{ color: 'var(--txt3)' }}> +</span>
                      <span style={{ color: '#9b7fe8' }}> {cfg.workers * cfg.ot * 5 + cfg.workers * cfg.sat_ot}h OT</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
