const pool = require('../db/pool');
const { asyncRoute, toInt, toNumber, rowToCoilMachine } = require('../db/helpers');

function coilRoutes(app) {
  app.get('/api/coil-machines', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM coil_machines ORDER BY sort_order, id');
    res.json(result.rows.map(rowToCoilMachine));
  }));

  app.post('/api/coil-machines', asyncRoute(async (req, res) => {
    const { name, count, type, min_kva, max_kva, hrs_per_unit, wire, hv_lv, notes, off_days, reg_hrs, ot_hrs } = req.body;
    const result = await pool.query(
      `INSERT INTO coil_machines (name,count,type,min_kva,max_kva,hrs_per_unit,wire,hv_lv,notes,off_days,reg_hrs,ot_hrs,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,(SELECT COALESCE(MAX(sort_order),0)+1 FROM coil_machines)) RETURNING *`,
      [name||'เครื่องพัน', toInt(count,1), type||'', toInt(min_kva,0), toInt(max_kva,9999),
       toNumber(hrs_per_unit,2), wire||'', hv_lv||'', notes||'',
       JSON.stringify(Array.isArray(off_days)?off_days:[]),
       toNumber(reg_hrs,8), toNumber(ot_hrs,4)]
    );
    res.status(201).json(rowToCoilMachine(result.rows[0]));
  }));

  app.put('/api/coil-machines/:id', asyncRoute(async (req, res) => {
    const { name, count, type, min_kva, max_kva, hrs_per_unit, wire, hv_lv, notes, off_days, reg_hrs, ot_hrs } = req.body;
    const result = await pool.query(
      `UPDATE coil_machines SET name=$2,count=$3,type=$4,min_kva=$5,max_kva=$6,hrs_per_unit=$7,wire=$8,hv_lv=$9,notes=$10,off_days=$11,reg_hrs=$12,ot_hrs=$13,updated_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id, name, toInt(count,1), type||'', toInt(min_kva,0), toInt(max_kva,9999),
       toNumber(hrs_per_unit,2), wire||'', hv_lv||'', notes||'',
       JSON.stringify(Array.isArray(off_days)?off_days:[]),
       toNumber(reg_hrs,8), toNumber(ot_hrs,4)]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(rowToCoilMachine(result.rows[0]));
  }));

  app.delete('/api/coil-machines/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM coil_machines WHERE id=$1', [req.params.id]);
    res.status(204).send();
  }));

  app.get('/api/coil-plan', asyncRoute(async (req, res) => {
    const { week_start } = req.query;
    const result = week_start
      ? await pool.query('SELECT * FROM coil_plan WHERE week_start=$1 ORDER BY plan_date, seq', [week_start])
      : await pool.query('SELECT * FROM coil_plan ORDER BY plan_date, seq');
    res.json(result.rows);
  }));

  app.post('/api/coil-plan/batch', asyncRoute(async (req, res) => {
    const { rows, week_start } = req.body;
    if (!Array.isArray(rows) || !week_start) return res.status(400).json({ error: 'Missing rows or week_start' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM coil_plan WHERE week_start=$1', [week_start]);
      for (const r of rows) {
        await client.query(
          `INSERT INTO coil_plan (plan_date,seq,importance,sap_so,item_code,comment,plant,kva,electrical,customer,total_kva,qty,enter_test,cable_box,control,due_store,due_so,adjust_plan,due_clamp,due_box_ctrl,raw_mat,lv,hv,week_start)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
          [r.plan_date,r.seq,r.importance,r.sap_so,r.item_code,r.comment,r.plant,r.kva,r.electrical,r.customer,r.total_kva,r.qty,r.enter_test,r.cable_box,r.control,r.due_store,r.due_so,r.adjust_plan,r.due_clamp,r.due_box_ctrl,r.raw_mat,r.lv,r.hv,week_start]
        );
      }
      await client.query('COMMIT');
      res.json({ inserted: rows.length, week_start });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  app.delete('/api/coil-plan', asyncRoute(async (req, res) => {
    const result = await pool.query('DELETE FROM coil_plan');
    res.json({ deleted: result.rowCount });
  }));

  app.delete('/api/coil-plan/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM coil_plan WHERE id = $1', [req.params.id]);
    res.status(204).send();
  }));

  app.delete('/api/coil-plan/week/:week_start', asyncRoute(async (req, res) => {
    const result = await pool.query('DELETE FROM coil_plan WHERE week_start=$1', [req.params.week_start]);
    res.json({ deleted: result.rowCount });
  }));

  app.put('/api/coil-plan/:id', asyncRoute(async (req, res) => {
    const allowed = ['plan_date','seq','importance','sap_so','item_code','comment','plant','kva',
      'electrical','customer','total_kva','qty','enter_test','cable_box','control',
      'due_store','due_so','adjust_plan','due_clamp','due_box_ctrl','raw_mat','lv','hv'];
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!entries.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = entries.map(([k], i) => `${k}=$${i + 2}`).join(', ');
    const result = await pool.query(
      `UPDATE coil_plan SET ${sets} WHERE id=$1 RETURNING *`,
      [req.params.id, ...entries.map(([, v]) => v)]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  }));
}

module.exports = coilRoutes;
