const pool = require('../db/pool');
const { asyncRoute, toNumber, toInt } = require('../db/helpers');
const { rowToDeptStation } = require('../db/helpers');

const VALID_TRANSITIONS = {
  draft:         ['approved', 'cancelled'],
  approved:      ['in_production', 'draft', 'cancelled'],
  in_production: ['completed', 'approved', 'cancelled'],
  completed:     ['archived'],
  cancelled:     [],
  archived:      [],
};

function deptRoutes(app) {
  // ─── Stations ───────────────────────────────────────────────────────────────
  app.get('/api/dept-stations/:dept', asyncRoute(async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM dept_stations WHERE dept_id = $1 ORDER BY id',
      [req.params.dept]
    );
    res.json(result.rows.map(rowToDeptStation));
  }));

  app.post('/api/dept-stations/:dept', asyncRoute(async (req, res) => {
    const { name, count, reg_hrs, ot_hrs, shift_hrs, shift_enabled, hrs_per_unit, wc_id, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO dept_stations (dept_id, name, count, reg_hrs, ot_hrs, shift_hrs, shift_enabled, hrs_per_unit, wc_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.dept, name || 'สถานี', toInt(count, 1), toNumber(reg_hrs, 8), toNumber(ot_hrs, 4),
       toNumber(shift_hrs, 9), shift_enabled !== false, toNumber(hrs_per_unit, 5.0), wc_id || '', notes || '']
    );
    res.status(201).json(rowToDeptStation(result.rows[0]));
  }));

  app.put('/api/dept-stations/:dept/:id', asyncRoute(async (req, res) => {
    const { name, count, reg_hrs, ot_hrs, shift_hrs, shift_enabled, hrs_per_unit, wc_id, notes } = req.body;
    const result = await pool.query(
      `UPDATE dept_stations
       SET name=$3, count=$4, reg_hrs=$5, ot_hrs=$6, shift_hrs=$7, shift_enabled=$8,
           hrs_per_unit=$9, wc_id=$10, notes=$11, updated_at=now()
       WHERE dept_id=$1 AND id=$2 RETURNING *`,
      [req.params.dept, req.params.id,
       name, toInt(count, 1), toNumber(reg_hrs, 8), toNumber(ot_hrs, 4),
       toNumber(shift_hrs, 9), shift_enabled !== false,
       toNumber(hrs_per_unit, 5.0), wc_id || '', notes || '']
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Station not found' });
    res.json(rowToDeptStation(result.rows[0]));
  }));

  app.delete('/api/dept-stations/:dept/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM dept_stations WHERE dept_id=$1 AND id=$2', [req.params.dept, req.params.id]);
    res.status(204).send();
  }));

  // ─── Snapshots ──────────────────────────────────────────────────────────────
  app.get('/api/dept-plan-snapshots/:dept', asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT id, dept_id, week_start, week_end, label, status, saved_at,
              confirmed_at, started_at, completed_at, result_summary
       FROM dept_plan_snapshots WHERE dept_id=$1 ORDER BY saved_at DESC LIMIT 50`,
      [req.params.dept]
    );
    res.json(result.rows);
  }));

  app.get('/api/dept-plan-snapshots/:dept/:id', asyncRoute(async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM dept_plan_snapshots WHERE dept_id=$1 AND id=$2',
      [req.params.dept, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  }));

  app.post('/api/dept-plan-snapshots/:dept', asyncRoute(async (req, res) => {
    const { week_start, week_end, label, plan_data, planned_finish_dates, planned_hours } = req.body;
    if (!week_start || !week_end) return res.status(400).json({ error: 'week_start and week_end required' });
    const result = await pool.query(
      `INSERT INTO dept_plan_snapshots (dept_id, week_start, week_end, label, plan_data, planned_finish_dates, planned_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, dept_id, week_start, week_end, label, status, saved_at`,
      [req.params.dept, week_start, week_end, label || '',
       JSON.stringify(plan_data || {}),
       JSON.stringify(planned_finish_dates || {}),
       JSON.stringify(planned_hours || {})]
    );
    res.status(201).json(result.rows[0]);
  }));

  app.patch('/api/dept-plan-snapshots/:dept/:id/status', asyncRoute(async (req, res) => {
    const { status, result_summary } = req.body;
    const cur = await pool.query(
      'SELECT status FROM dept_plan_snapshots WHERE dept_id=$1 AND id=$2',
      [req.params.dept, req.params.id]
    );
    if (!cur.rows.length) return res.status(404).json({ error: 'Not found' });
    const current = cur.rows[0].status || 'draft';
    const allowed = VALID_TRANSITIONS[current] ?? [];
    if (!allowed.includes(status)) return res.status(400).json({ error: `Cannot transition ${current} → ${status}` });
    const tsField = status === 'approved' ? 'confirmed_at' : status === 'in_production' ? 'started_at' : status === 'completed' ? 'completed_at' : null;
    const sets = ['status=$3'];
    const vals = [req.params.dept, req.params.id, status];
    if (tsField) sets.push(`${tsField} = now()`);
    if (status === 'completed' && result_summary) { sets.push(`result_summary = $${vals.length + 1}`); vals.push(JSON.stringify(result_summary)); }
    const result = await pool.query(
      `UPDATE dept_plan_snapshots SET ${sets.join(', ')} WHERE dept_id=$1 AND id=$2
       RETURNING id, dept_id, week_start, week_end, label, status, saved_at, confirmed_at, started_at, completed_at, result_summary`,
      vals
    );
    res.json(result.rows[0]);
  }));

  app.delete('/api/dept-plan-snapshots/:dept/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM dept_plan_snapshots WHERE dept_id=$1 AND id=$2', [req.params.dept, req.params.id]);
    res.status(204).send();
  }));
}

module.exports = deptRoutes;
