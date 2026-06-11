import { api } from '../../../api'
import { useApp } from '../../../context/AppContext'
import type { CuttingMachine, CuttingRate } from '../../../types'

export function useCuttingActions(saving: number | null, setSaving: (id: number | null) => void) {
  const { state, dispatch } = useApp()
  const machines = state.cuttingMachines

  async function handleAdd() {
    const m = { name: 'เครื่องตัด', count: 1, min_kva: 160, max_kva: 2500, hrs_per_unit: 2.5, laser: false, m4: false, min_face_mm: 1, max_face_mm: 9999, drill_8mm: false, drill_22mm: false, notes: '', reg_hrs: 8, ot_hrs: 4, time_mul: 1, tmc_hrs: 0 }
    const saved = await api.cuttingMachines.create(m)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: [...machines, saved] })
  }

  async function handleDelete(id: number) {
    await api.cuttingMachines.delete(id)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: machines.filter(m => m.id !== id) })
  }

  async function handleChange(id: number, field: keyof Omit<CuttingMachine, 'id'>, raw: string) {
    const updated = machines.map(m => {
      if (m.id !== id) return m
      const next = { ...m }
      if (field === 'name')         next.name         = raw
      if (field === 'count')        next.count        = Math.max(1, parseInt(raw) || 1)
      if (field === 'min_kva')      next.min_kva      = Math.max(0, parseInt(raw) || 0)
      if (field === 'max_kva')      next.max_kva      = Math.max(0, parseInt(raw) || 0)
      if (field === 'hrs_per_unit') next.hrs_per_unit = Math.max(0.1, parseFloat(raw) || 1)
      if (field === 'reg_hrs')      next.reg_hrs      = Math.max(0.5, parseFloat(raw) || 8)
      if (field === 'ot_hrs')       next.ot_hrs       = Math.max(0,   parseFloat(raw) || 0)
      if (field === 'time_mul')     next.time_mul     = Math.max(0.1, parseFloat(raw) || 1)
      if (field === 'tmc_hrs')      next.tmc_hrs      = Math.max(0,   parseFloat(raw) || 0)
      if (field === 'min_face_mm')  next.min_face_mm  = Math.max(1, parseInt(raw) || 1)
      if (field === 'max_face_mm')  next.max_face_mm  = Math.max(1, parseInt(raw) || 9999)
      if (field === 'notes')        next.notes        = raw
      if (field === 'shift_hrs')    next.shift_hrs    = Math.max(0, parseFloat(raw) || 9)
      return next
    })
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === id)!
    setSaving(id)
    await api.cuttingMachines.update(id, machine)
    setSaving(null)
  }

  async function toggleOffDay(id: number, dow: number) {
    const m = machines.find(mc => mc.id === id)!
    const current = m.off_days ?? []
    const next = current.includes(dow) ? current.filter(d => d !== dow) : [...current, dow]
    const updated = machines.map(mc => mc.id === id ? { ...mc, off_days: next } : mc)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    setSaving(id)
    await api.cuttingMachines.update(id, { ...m, off_days: next })
    setSaving(null)
  }

  async function handleToggle(id: number, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm' | 'shift_enabled') {
    const updated = machines.map(m => m.id !== id ? m : { ...m, [field]: !m[field] })
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === id)!
    setSaving(id)
    await api.cuttingMachines.update(id, machine)
    setSaving(null)
  }

  async function saveMachineRates(machineId: number, rates: CuttingRate[]) {
    const updated = machines.map(m => m.id === machineId ? { ...m, rates } : m)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === machineId)!
    await api.cuttingMachines.update(machineId, machine)
  }

  async function saveMachineTmcRates(machineId: number, tmc_rates: CuttingRate[]) {
    const updated = machines.map(m => m.id === machineId ? { ...m, tmc_rates } : m)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === machineId)!
    await api.cuttingMachines.update(machineId, machine)
  }

  return { handleAdd, handleDelete, handleChange, toggleOffDay, handleToggle, saveMachineRates, saveMachineTmcRates }
}
