const pool = require('../db/pool');
const { asyncRoute, toInt, toNumber, rowToCuttingMachine } = require('../db/helpers');

function cuttingRoutes(app) {
  app.get('/api/cutting-machines', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM cutting_machines ORDER BY sort_order, id');
    res.json(result.rows.map(rowToCuttingMachine));
  }));

  app.post('/api/cutting-machines', asyncRoute(async (req, res) => {
    const { name, count, min_kva, max_kva, hrs_per_unit, laser, m4, min_face_mm, max_face_mm, drill_8mm, drill_22mm, notes, rates, reg_hrs, ot_hrs, wc_id, off_days, time_mul, tmc_hrs, tmc_rates, tr_power_hrs, tr_power_rates, class_h_hrs, class_h_rates } = req.body;
    const result = await pool.query(
      `INSERT INTO cutting_machines (name, count, min_kva, max_kva, hrs_per_unit, laser, m4, min_face_mm, max_face_mm, drill_8mm, drill_22mm, notes, rates, reg_hrs, ot_hrs, wc_id, off_days, time_mul, tmc_hrs, tmc_rates, tr_power_hrs, tr_power_rates, class_h_hrs, class_h_rates, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,(SELECT COALESCE(MAX(sort_order),0)+1 FROM cutting_machines))
       RETURNING *`,
      [name||'เครื่องตัด', toInt(count,1), toInt(min_kva,50), toInt(max_kva,1000), toNumber(hrs_per_unit,2.5),
       !!laser, !!m4, toInt(min_face_mm,1), toInt(max_face_mm,9999), !!drill_8mm, !!drill_22mm, notes||'',
       JSON.stringify(Array.isArray(rates) ? rates : []), toNumber(reg_hrs,8), toNumber(ot_hrs,4), wc_id||'',
       JSON.stringify(Array.isArray(off_days) ? off_days : []), toNumber(time_mul,1), toNumber(tmc_hrs,0),
       JSON.stringify(Array.isArray(tmc_rates) ? tmc_rates : []), toNumber(tr_power_hrs,0),
       JSON.stringify(Array.isArray(tr_power_rates) ? tr_power_rates : []), toNumber(class_h_hrs,0),
       JSON.stringify(Array.isArray(class_h_rates) ? class_h_rates : [])]
    );
    res.status(201).json(rowToCuttingMachine(result.rows[0]));
  }));

  app.put('/api/cutting-machines/:id', asyncRoute(async (req, res) => {
    const { name, count, min_kva, max_kva, hrs_per_unit, laser, m4, min_face_mm, max_face_mm, drill_8mm, drill_22mm, notes, rates, reg_hrs, ot_hrs, wc_id, off_days, time_mul, tmc_hrs, tmc_rates, tr_power_hrs, tr_power_rates, class_h_hrs, class_h_rates } = req.body;
    const result = await pool.query(
      `UPDATE cutting_machines SET name=$2, count=$3, min_kva=$4, max_kva=$5, hrs_per_unit=$6,
       laser=$7, m4=$8, min_face_mm=$9, max_face_mm=$10, drill_8mm=$11, drill_22mm=$12, notes=$13, rates=$14,
       reg_hrs=$15, ot_hrs=$16, wc_id=$17, off_days=$18, time_mul=$19, tmc_hrs=$20, tmc_rates=$21,
       tr_power_hrs=$22, tr_power_rates=$23, class_h_hrs=$24, class_h_rates=$25, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.params.id, name, toInt(count,1), toInt(min_kva,50), toInt(max_kva,1000), toNumber(hrs_per_unit,2.5),
       !!laser, !!m4, toInt(min_face_mm,1), toInt(max_face_mm,9999), !!drill_8mm, !!drill_22mm, notes||'',
       JSON.stringify(Array.isArray(rates) ? rates : []), toNumber(reg_hrs,8), toNumber(ot_hrs,4), wc_id||'',
       JSON.stringify(Array.isArray(off_days) ? off_days : []), toNumber(time_mul,1), toNumber(tmc_hrs,0),
       JSON.stringify(Array.isArray(tmc_rates) ? tmc_rates : []), toNumber(tr_power_hrs,0),
       JSON.stringify(Array.isArray(tr_power_rates) ? tr_power_rates : []), toNumber(class_h_hrs,0),
       JSON.stringify(Array.isArray(class_h_rates) ? class_h_rates : [])]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Machine not found' });
    res.json(rowToCuttingMachine(result.rows[0]));
  }));

  app.delete('/api/cutting-machines/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM cutting_machines WHERE id = $1', [req.params.id]);
    res.status(204).send();
  }));

  app.get('/api/cutting-rates', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT rates FROM cutting_rates WHERE id=1');
    res.json(result.rows[0]?.rates ?? []);
  }));

  app.put('/api/cutting-rates', asyncRoute(async (req, res) => {
    const rates = Array.isArray(req.body) ? req.body : [];
    await pool.query(
      'INSERT INTO cutting_rates (id, rates) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET rates=EXCLUDED.rates',
      [JSON.stringify(rates)]
    );
    res.json(rates);
  }));

  app.get('/api/cutting-tmc-rates', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT rates FROM cutting_tmc_rates WHERE id=1');
    res.json(result.rows[0]?.rates ?? []);
  }));

  app.put('/api/cutting-tmc-rates', asyncRoute(async (req, res) => {
    const rates = Array.isArray(req.body) ? req.body : [];
    await pool.query(
      'INSERT INTO cutting_tmc_rates (id, rates) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET rates=EXCLUDED.rates',
      [JSON.stringify(rates)]
    );
    res.json(rates);
  }));

  app.get('/api/cutting-class-h-rates', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT rates FROM cutting_class_h_rates WHERE id=1');
    res.json(result.rows[0]?.rates ?? []);
  }));

  app.put('/api/cutting-class-h-rates', asyncRoute(async (req, res) => {
    const rates = Array.isArray(req.body) ? req.body : [];
    await pool.query(
      'INSERT INTO cutting_class_h_rates (id, rates) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET rates=EXCLUDED.rates',
      [JSON.stringify(rates)]
    );
    res.json(rates);
  }));

  app.get('/api/cutting-tr-power-rates', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT rates FROM cutting_tr_power_rates WHERE id=1');
    res.json(result.rows[0]?.rates ?? []);
  }));

  app.put('/api/cutting-tr-power-rates', asyncRoute(async (req, res) => {
    const rates = Array.isArray(req.body) ? req.body : [];
    await pool.query(
      'INSERT INTO cutting_tr_power_rates (id, rates) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET rates=EXCLUDED.rates',
      [JSON.stringify(rates)]
    );
    res.json(rates);
  }));

  app.get('/api/cutting-plan-snapshots', asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT id, week_start, week_end, label, status, saved_at, confirmed_at, started_at, completed_at
       FROM cutting_plan_snapshots ORDER BY saved_at DESC LIMIT 50`
    );
    res.json(result.rows);
  }));

  app.get('/api/cutting-plan-snapshots/:id', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM cutting_plan_snapshots WHERE id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  }));

  app.post('/api/cutting-plan-snapshots', asyncRoute(async (req, res) => {
    const { week_start, week_end, label, plan_data, planned_finish_dates, planned_hours } = req.body;
    if (!week_start || !week_end) return res.status(400).json({ error: 'week_start and week_end required' });
    const result = await pool.query(
      `INSERT INTO cutting_plan_snapshots (week_start, week_end, label, plan_data, planned_finish_dates, planned_hours)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, week_start, week_end, label, status, saved_at`,
      [week_start, week_end, label || '', JSON.stringify(plan_data || {}),
       JSON.stringify(planned_finish_dates || {}), JSON.stringify(planned_hours || {})]
    );
    res.status(201).json(result.rows[0]);
  }));

  // Status transitions: draft→approved→in_production→completed→archived; any live→cancelled
  const VALID_TRANSITIONS = {
    draft:         ['approved', 'cancelled'],
    approved:      ['in_production', 'draft', 'cancelled'],
    in_production: ['completed', 'approved', 'cancelled'],
    completed:     ['archived'],
    cancelled:     [],
    archived:      [],
  };
  app.patch('/api/cutting-plan-snapshots/:id/status', asyncRoute(async (req, res) => {
    const { status } = req.body;
    const cur = await pool.query('SELECT status FROM cutting_plan_snapshots WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Not found' });
    const current = cur.rows[0].status || 'draft';
    const allowed = VALID_TRANSITIONS[current] ?? [];
    if (!allowed.includes(status)) return res.status(400).json({ error: `Cannot transition ${current} → ${status}` });
    const tsField = status === 'approved' ? 'confirmed_at' : status === 'in_production' ? 'started_at' : status === 'completed' ? 'completed_at' : null;
    const tsClause = tsField ? `, ${tsField} = now()` : '';
    const result = await pool.query(
      `UPDATE cutting_plan_snapshots SET status=$1${tsClause} WHERE id=$2
       RETURNING id, week_start, week_end, label, status, saved_at, confirmed_at, started_at, completed_at`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  }));

  app.delete('/api/cutting-plan-snapshots/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM cutting_plan_snapshots WHERE id=$1', [req.params.id]);
    res.status(204).send();
  }));
}

module.exports = cuttingRoutes;
