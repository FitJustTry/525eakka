import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../../api'
import type { MachineDowntime } from '../../../../types'
import { fmtISO } from '../scheduling/utils'

export function useDowntime() {
  const [downtimes, setDowntimes] = useState<MachineDowntime[]>([])

  useEffect(() => {
    api.downtime.list().then(setDowntimes).catch(() => {})
  }, [])

  const addDowntime = useCallback(async (d: Omit<MachineDowntime, 'id' | 'created_at'>) => {
    const created = await api.downtime.create(d)
    setDowntimes(prev => [...prev, created])
    return created
  }, [])

  const updateDowntime = useCallback(async (id: number, patch: Partial<Omit<MachineDowntime, 'id' | 'created_at' | 'machine_id'>>) => {
    const updated = await api.downtime.update(id, patch)
    setDowntimes(prev => prev.map(d => d.id === id ? updated : d))
  }, [])

  const deleteDowntime = useCallback(async (id: number) => {
    await api.downtime.delete(id)
    setDowntimes(prev => prev.filter(d => d.id !== id))
  }, [])

  // Map<machineId, Set<"YYYY-MM-DD">> covering all downtime date ranges
  const downtimeDays = useCallback((): Map<number, Set<string>> => {
    const map = new Map<number, Set<string>>()
    for (const d of downtimes) {
      if (!map.has(d.machine_id)) map.set(d.machine_id, new Set())
      const set = map.get(d.machine_id)!
      let cur = new Date(d.start_date)
      const end = new Date(d.end_date)
      while (cur <= end) {
        set.add(fmtISO(cur))
        cur = new Date(cur.getTime() + 86400000)
      }
    }
    return map
  }, [downtimes])

  return { downtimes, addDowntime, updateDowntime, deleteDowntime, downtimeDays }
}
