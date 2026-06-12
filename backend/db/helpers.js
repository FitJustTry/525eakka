function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value, fallback = 0) {
  return Math.trunc(toNumber(value, fallback));
}

function dateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function rowToWorkCenter(row) {
  return {
    name: row.name,
    workers: toInt(row.workers),
    hrs: toNumber(row.hrs),
    ot: toNumber(row.ot),
    sat_hrs: toNumber(row.sat_hrs),
    sat_ot: toNumber(row.sat_ot),
    eff: toInt(row.eff, 90),
  };
}

function rowToProduct(row) {
  return {
    label: row.label,
    std_hrs: toNumber(row.std_hrs),
    kva: toInt(row.kva),
    ops: Array.isArray(row.ops) ? row.ops : [],
  };
}

function rowToOrder(row) {
  return {
    id: row.id,
    product: row.product,
    qty: toInt(row.qty, 1),
    deadline: dateKey(row.deadline),
    customer: row.customer || '',
    kva: row.kva === null ? null : toInt(row.kva),
    category: row.category || '',
    sap_so: row.sap_so || '',
    plan_date: dateKey(row.plan_date),
    comment: row.comment || '',
    item_code: row.item_code || '',
    week_start: row.week_start || '',
    seq: toInt(row.seq, 0),
    plant: row.plant || '',
    electrical: row.electrical || '',
    total_kva: toNumber(row.total_kva, 0),
    enter_test: row.enter_test || '',
    cable_box: row.cable_box || '',
    control: row.control || '',
    due_store: row.due_store || '',
    due_so: row.due_so || '',
    adjust_plan: row.adjust_plan || '',
    due_clamp: row.due_clamp || '',
    due_box_ctrl: row.due_box_ctrl || '',
    raw_mat: row.raw_mat || '',
    lv: row.lv || '',
    hv: row.hv || '',
    done_qty: toInt(row.done_qty, 0),
    created_at: row.created_at,
  };
}

function rowToCuttingMachine(row) {
  return {
    id: row.id, name: row.name,
    count: toInt(row.count, 1), min_kva: toInt(row.min_kva, 50),
    max_kva: toInt(row.max_kva, 1000), hrs_per_unit: toNumber(row.hrs_per_unit, 2.5),
    laser: !!row.laser, m4: !!row.m4,
    min_face_mm: toInt(row.min_face_mm, 1), max_face_mm: toInt(row.max_face_mm, 9999),
    drill_8mm: !!row.drill_8mm, drill_22mm: !!row.drill_22mm, notes: row.notes || '',
    rates: Array.isArray(row.rates) ? row.rates : [],
    reg_hrs: toNumber(row.reg_hrs, 8),
    ot_hrs: toNumber(row.ot_hrs, 4),
    wc_id: row.wc_id || '',
    off_days: Array.isArray(row.off_days) ? row.off_days : [],
    time_mul: toNumber(row.time_mul, 1),
    tmc_hrs: toNumber(row.tmc_hrs, 0),
    tmc_rates: Array.isArray(row.tmc_rates) ? row.tmc_rates : [],
    tr_power_hrs: toNumber(row.tr_power_hrs, 0),
    tr_power_rates: Array.isArray(row.tr_power_rates) ? row.tr_power_rates : [],
    class_h_hrs: toNumber(row.class_h_hrs, 0),
    class_h_rates: Array.isArray(row.class_h_rates) ? row.class_h_rates : [],
  };
}

function rowToCoilMachine(row) {
  return {
    id: row.id, name: row.name, count: toInt(row.count, 1),
    type: row.type || '', min_kva: toInt(row.min_kva, 0), max_kva: toInt(row.max_kva, 9999),
    hrs_per_unit: toNumber(row.hrs_per_unit, 2), wire: row.wire || '', hv_lv: row.hv_lv || '',
    notes: row.notes || '', off_days: Array.isArray(row.off_days) ? row.off_days : [],
    reg_hrs: toNumber(row.reg_hrs, 8), ot_hrs: toNumber(row.ot_hrs, 4),
    sort_order: toInt(row.sort_order, 0),
  };
}

module.exports = {
  toNumber,
  toInt,
  dateKey,
  asyncRoute,
  rowToWorkCenter,
  rowToProduct,
  rowToOrder,
  rowToCuttingMachine,
  rowToCoilMachine,
};
