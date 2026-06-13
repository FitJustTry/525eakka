/**
 * WIP Pipeline Board
 *
 * Shows all active orders as Kanban columns:
 *   CUTTING → SHAKE → STACK → CLAMP → NOLOAD → DONE
 *
 * Each column shows: count of orders, total kVA, and order cards.
 * The "Close Week" action in each DeptSchedulerPage moves orders here.
 */

import { useMemo, useState } from 'react'
import { useApp } from '../../../context/AppContext'
import { WORKFLOW_SEQUENCE, WORKFLOW_LABELS } from '../shared/types'
import type { WorkflowStatus } from '../shared/types'
import type { Order } from '../../../types'

const STAGE_COLORS: Record<WorkflowStatus, string> = {
  CUTTING: 'var(--amber)',
  SHAKE:   '#cba6f7',
  STACK:   'var(--blue)',
  CLAMP:   '#fab387',
  NOLOAD:  'var(--green)',
  DONE:    'var(--txt3)',
}

const STAGE_BG: Record<WorkflowStatus, string> = {
  CUTTING: 'rgba(249,226,175,.08)',
  SHAKE:   'rgba(203,166,247,.08)',
  STACK:   'rgba(137,180,250,.08)',
  CLAMP:   'rgba(250,179,135,.08)',
  NOLOAD:  'rgba(166,227,161,.08)',
  DONE:    'rgba(108,112,134,.06)',
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority || priority === 'normal') return null
  const cfg = priority === 'rush'
    ? { label: '🔴 Rush', col: 'var(--red)', bg: 'rgba(243,139,168,.15)' }
    : { label: '🟠 High', col: 'var(--amber)', bg: 'rgba(249,226,175,.15)' }
  return (
    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, fontWeight: 700, background: cfg.bg, color: cfg.col }}>
      {cfg.label}
    </span>
  )
}

function OrderCard({ order }: { order: Order }) {
  const overdue = order.deadline && order.deadline < new Date().toISOString().slice(0, 10)
  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--bord)', borderRadius: 7,
      padding: '7px 9px', marginBottom: 5,
      borderLeft: overdue ? '3px solid var(--red)' : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 10, color: 'var(--amber)' }}>
          {order.sap_so || order.id.slice(-8)}
        </span>
        <PriorityBadge priority={order.priority} />
      </div>
      <div style={{ display: 'flex', gap: 6, fontSize: 9, color: 'var(--txt3)' }}>
        <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{order.kva} kVA</span>
        <span>×{order.qty}</span>
        {order.customer && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>| {order.customer}</span>}
      </div>
      {order.deadline && (
        <div style={{ fontSize: 8, color: overdue ? 'var(--red)' : 'var(--txt3)', marginTop: 2 }}>
          📅 {order.deadline}{overdue ? ' ⚠ เกินกำหนด' : ''}
        </div>
      )}
    </div>
  )
}

function StageColumn({ stage, orders, collapsed, onToggle }: {
  stage: WorkflowStatus
  orders: Order[]
  collapsed: boolean
  onToggle: () => void
}) {
  const col = STAGE_COLORS[stage]
  const bg = STAGE_BG[stage]
  const totalKva = orders.reduce((s, o) => s + (o.kva ?? 0) * (o.qty ?? 1), 0)
  const rushCount = orders.filter(o => o.priority === 'rush').length

  return (
    <div style={{
      flex: collapsed ? 0 : 1,
      minWidth: collapsed ? 40 : 200,
      maxWidth: collapsed ? 40 : 280,
      background: bg,
      border: `1px solid ${col}33`,
      borderRadius: 10,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Column header */}
      <div
        onClick={onToggle}
        style={{
          padding: collapsed ? '12px 8px' : '10px 12px',
          borderBottom: `1px solid ${col}33`,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center',
          gap: 6,
          userSelect: 'none',
        }}
      >
        {collapsed ? (
          <>
            <span style={{ fontSize: 10, fontWeight: 700, color: col, writingMode: 'vertical-rl', textOrientation: 'mixed', marginBottom: 4 }}>
              {WORKFLOW_LABELS[stage]}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: col }}>{orders.length}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, color: col, flex: 1 }}>
              {WORKFLOW_LABELS[stage]}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: col }}>{orders.length}</span>
            {rushCount > 0 && (
              <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>🔴{rushCount}</span>
            )}
          </>
        )}
      </div>

      {/* Stats */}
      {!collapsed && (
        <div style={{ padding: '5px 12px', borderBottom: `1px solid ${col}22`, fontSize: 9, color: 'var(--txt3)' }}>
          <span style={{ fontFamily: 'var(--mono)', color: col }}>{totalKva.toLocaleString()} kVA</span>
          {' · '}
          {orders.reduce((s, o) => s + (o.qty ?? 1), 0)} units
        </div>
      )}

      {/* Cards */}
      {!collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 4px' }}>
          {orders.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--txt3)', fontSize: 10, padding: '20px 0' }}>
              ว่าง
            </div>
          )}
          {orders.map(o => <OrderCard key={o.id} order={o} />)}
        </div>
      )}
    </div>
  )
}

export default function WipBoardPage() {
  const { state } = useApp()
  const { orders } = state
  const [showDone, setShowDone] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<WorkflowStatus>>(new Set(['DONE']))

  const grouped = useMemo(() => {
    const map = new Map<WorkflowStatus, Order[]>()
    WORKFLOW_SEQUENCE.forEach(s => map.set(s, []))
    for (const o of orders) {
      const stage: WorkflowStatus = (o.workflow_status as WorkflowStatus) || 'CUTTING'
      map.get(stage)?.push(o)
    }
    // Sort each column by priority then deadline
    const priorityOrder = { rush: 0, high: 1, normal: 2 }
    map.forEach((list) => {
      list.sort((a, b) => {
        const pa = priorityOrder[a.priority ?? 'normal'] ?? 2
        const pb = priorityOrder[b.priority ?? 'normal'] ?? 2
        if (pa !== pb) return pa - pb
        return (a.deadline ?? '').localeCompare(b.deadline ?? '')
      })
    })
    return map
  }, [orders])

  const activeCols = WORKFLOW_SEQUENCE.filter(s => s !== 'DONE' || showDone)
  const totalActive = orders.filter(o => !o.workflow_status || o.workflow_status !== 'DONE').length
  const totalDone = (grouped.get('DONE') ?? []).length
  const rushOrders = orders.filter(o => o.priority === 'rush' && o.workflow_status !== 'DONE')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🗂 WIP Pipeline Board</span>
        <span style={{ fontSize: 10, background: 'var(--bg3)', border: '1px solid var(--bord)', padding: '2px 8px', borderRadius: 6, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
          {totalActive} งาน active
        </span>
        {totalDone > 0 && (
          <span style={{ fontSize: 10, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
            {totalDone} done
          </span>
        )}
        {rushOrders.length > 0 && (
          <span style={{ fontSize: 10, background: 'rgba(243,139,168,.12)', border: '1px solid var(--red)44', padding: '2px 8px', borderRadius: 6, color: 'var(--red)', fontWeight: 700 }}>
            🔴 {rushOrders.length} Rush
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={() => setShowDone(v => !v)}
            style={{
              fontSize: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${showDone ? 'var(--green)' : 'var(--bord)'}`,
              background: showDone ? 'rgba(166,227,161,.1)' : 'var(--bg3)',
              color: showDone ? 'var(--green)' : 'var(--txt3)',
            }}>
            ✅ แสดง Done
          </button>
        </div>
      </div>

      {/* Rush banner */}
      {rushOrders.length > 0 && (
        <div style={{ background: 'rgba(243,139,168,.08)', border: '1px solid var(--red)44', borderRadius: 8, padding: '6px 12px', fontSize: 10 }}>
          <span style={{ fontWeight: 700, color: 'var(--red)', marginRight: 8 }}>🔴 Rush orders:</span>
          {rushOrders.slice(0, 8).map(o => (
            <span key={o.id} style={{ marginRight: 8, fontFamily: 'var(--mono)', color: 'var(--amber)' }}>
              {o.sap_so || o.id.slice(-6)} {o.kva}kVA [{o.workflow_status || 'CUTTING'}]
            </span>
          ))}
          {rushOrders.length > 8 && <span style={{ color: 'var(--txt3)' }}>+{rushOrders.length - 8}</span>}
        </div>
      )}

      {/* Board */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', overflowX: 'auto', minHeight: 400 }}>
        {activeCols.map(stage => (
          <StageColumn
            key={stage}
            stage={stage}
            orders={grouped.get(stage) ?? []}
            collapsed={collapsed.has(stage)}
            onToggle={() => setCollapsed(prev => {
              const next = new Set(prev)
              next.has(stage) ? next.delete(stage) : next.add(stage)
              return next
            })}
          />
        ))}
      </div>

    </div>
  )
}
