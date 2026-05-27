import { useState } from 'react'
import { useApp } from './context/AppContext'
import type { TabId } from './types'

import DeptTab         from './tabs/DeptTab'
import SimulateTab     from './tabs/SimulateTab'
import ImportTab       from './tabs/ImportTab'
import OrdersTab       from './tabs/OrdersTab'
import CatalogTab      from './tabs/CatalogTab'
import EmployeesTab    from './tabs/EmployeesTab'
import TimeDashTab     from './tabs/TimeDashTab'
import LoadBoardTab    from './tabs/LoadBoardTab'
import GanttTab        from './tabs/GanttTab'
import PlanTab         from './tabs/PlanTab'
import CapacityTab     from './tabs/CapacityTab'
import ItemDecodeTab   from './tabs/ItemDecodeTab'
import TranscodeTab    from './tabs/TranscodeTab'
import SapRoutingTab   from './tabs/SapRoutingTab'
import CalendarTab     from './tabs/CalendarTab'
import SettingsTab     from './tabs/SettingsTab'
import DataTab         from './tabs/DataTab'

const TABS: { id: TabId; label: string }[] = [
  { id: 'simulate',   label: '🎯 Simulate' },
  { id: 'import',     label: '📥 Import' },
  { id: 'orders',     label: '📋 Orders' },
  { id: 'plan',       label: '📅 Plan' },
  { id: 'capacity',   label: '⚡ Capacity' },
  { id: 'gantt',      label: '📊 Gantt' },
  { id: 'load',       label: '🔥 Load' },
  { id: 'catalog',    label: '📦 Catalog' },
  { id: 'employees',  label: '👷 พนักงาน' },
  { id: 'timedash',   label: '⏱ Time' },
  { id: 'dept',       label: '🏭 แผนก' },
  { id: 'itemdecode', label: '🔑 Item Code' },
  { id: 'transcode',  label: '🔢 EN-T-001' },
  { id: 'saprouting', label: '📋 SAP Routing' },
  { id: 'calendar',   label: '📆 Calendar' },
  { id: 'data',        label: '🗄 Data' },
  { id: 'settings',   label: '⚙ Settings' },
]

export default function App() {
  const { state } = useApp()
  const [tab, setTab] = useState<TabId>('simulate')

  if (state.loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', color: 'var(--txt3)', fontSize: 13 }}>
      กำลังโหลด…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden' }}>
      {/* Top bar */}
      <header style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--bord)', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 0, height: 40, flexShrink: 0, overflowX: 'auto' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginRight: 16, letterSpacing: '0.08em', flexShrink: 0 }}>EKARAT</span>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--blue)' : 'transparent'}`, color: tab === t.id ? 'var(--txt)' : 'var(--txt3)', cursor: 'pointer', fontSize: 11, fontWeight: tab === t.id ? 700 : 400, padding: '0 10px', height: 40, transition: 'color .15s', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {t.label}
          </button>
        ))}
      </header>

      {/* Content */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {!state.backendOk && (
          <div style={{ position: 'fixed', bottom: 12, right: 16, fontSize: 11, padding: '6px 12px', background: 'rgba(224,90,78,.15)', border: '1px solid rgba(224,90,78,.3)', borderRadius: 8, color: 'var(--red)', zIndex: 50 }}>
            ⚠ Backend offline — ข้อมูลอาจไม่ได้รับการบันทึก
          </div>
        )}
        {tab === 'simulate'   && <SimulateTab />}
        {tab === 'import'     && <ImportTab />}
        {tab === 'orders'     && <OrdersTab />}
        {tab === 'catalog'    && <CatalogTab />}
        {tab === 'employees'  && <EmployeesTab />}
        {tab === 'timedash'   && <TimeDashTab />}
        {tab === 'dept'       && <DeptTab />}
        {tab === 'load'       && <LoadBoardTab />}
        {tab === 'gantt'      && <GanttTab />}
        {tab === 'plan'       && <PlanTab />}
        {tab === 'capacity'   && <CapacityTab />}
        {tab === 'itemdecode' && <ItemDecodeTab />}
        {tab === 'transcode'  && <TranscodeTab />}
        {tab === 'saprouting' && <SapRoutingTab />}
        {tab === 'calendar'   && <CalendarTab />}
        {tab === 'data'       && <DataTab />}
        {tab === 'settings'   && <SettingsTab />}
      </main>
    </div>
  )
}
