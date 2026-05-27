import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { getCommittedLoadMap, getLoadInfo, loadColor, loadBadge } from '../../utils/capacity'

export default function LoadBoardTab() {
  const { state } = useApp()
  const { orders, products, wcConfig, openLoad } = state

  const loadMap = useMemo(
    () => getCommittedLoadMap(orders, products, wcConfig, openLoad),
    [orders, products, wcConfig, openLoad]
  )

  const allWCs = Object.keys(wcConfig).sort()

  return (
    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Load Board — ภาระงานต่อ Work Center</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>
            <span style={{ color: 'var(--blue)' }}>จ–ศ 8h</span> + <span style={{ color: 'var(--amber)' }}>เสาร์ 4h</span> · ณ {new Date().toLocaleDateString('th-TH')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
          {[['var(--green)','< 80% ปกติ'],['var(--amber)','80–99% ระวัง'],['var(--red)','≥100% เกิน']].map(([col, lbl]) => (
            <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: col, display: 'inline-block' }} />{lbl}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 10 }}>
        {allWCs.map(wc => {
          const info = getLoadInfo(wc, loadMap, wcConfig)
          const cap  = info.cap
          const cfg  = wcConfig[wc]
          const col  = loadColor(info.pct)
          const overHrs = Math.max(0, info.load - cap.normal)

          return (
            <div key={wc} style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>{wc}</span>
                  <span style={{ fontSize: 11, color: 'var(--txt2)', marginLeft: 8 }}>{cfg.name}</span>
                </div>
                <Bdg cls={loadBadge(info.pct)} text={info.pct + '%'} />
              </div>

              <div style={{ position: 'relative', height: 10, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: Math.min(info.pct, 100) + '%', background: col, borderRadius: 4 }} />
                {info.pct > 100 && <div style={{ position: 'absolute', left: '100%', top: 0, height: '100%', width: Math.min(info.pct - 100, 40) + '%', background: 'rgba(224,90,78,.45)', borderRadius: '0 4px 4px 0' }} />}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: cap.weekday_normal, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ height: 4, background: 'var(--blue)', borderRadius: '2px 0 0 2px', opacity: 0.7 }} />
                  <div style={{ fontSize: 9, color: 'var(--txt3)' }}>จ–ศ {cap.weekday_normal}h</div>
                </div>
                <div style={{ flex: cap.sat_normal, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ height: 4, background: 'var(--amber)', borderRadius: '0 2px 2px 0', opacity: 0.7 }} />
                  <div style={{ fontSize: 9, color: 'var(--txt3)' }}>เสาร์ {cap.sat_normal}h</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Stat label="Load" val={info.load.toFixed(0) + 'h'} col={col} />
                <Stat label="Capacity" val={cap.normal + 'h'} col="var(--txt2)" />
                {info.freehrs > 0
                  ? <Stat label="ว่าง" val={info.freehrs.toFixed(0) + 'h'} col="var(--green)" />
                  : <Stat label="เกิน" val={overHrs.toFixed(0) + 'h'} col="var(--red)" />}
                <Stat label="OT ได้สูงสุด" val={cap.ot + 'h'} col="var(--txt3)" />
              </div>

              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--txt3)', display: 'flex', gap: 10 }}>
                <span>{cfg.workers} คน</span>
                <span>จ–ศ {cfg.hrs}h/วัน</span>
                <span>เสาร์ {cfg.sat_hrs}h</span>
                <span style={{ color: cfg.eff >= 90 ? 'var(--green)' : cfg.eff >= 80 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>Eff {cfg.eff}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Bdg({ cls, text }: { cls: string; text: string }) {
  const bg: Record<string, string> = { 'b-ok': 'rgba(76,175,125,.15)', 'b-warn': 'rgba(224,156,42,.15)', 'b-red': 'rgba(224,90,78,.15)' }
  const col: Record<string, string> = { 'b-ok': 'var(--green)', 'b-warn': 'var(--amber)', 'b-red': 'var(--red)' }
  return <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: bg[cls], color: col[cls] }}>{text}</span>
}

function Stat({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 6, padding: '5px 8px' }}>
      <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: col }}>{val}</div>
    </div>
  )
}
