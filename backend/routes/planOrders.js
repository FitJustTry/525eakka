const pool = require('../db/pool');
const { asyncRoute } = require('../db/helpers');

function planOrderRoutes(app) {
  app.get('/api/plan-orders', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM plan_orders ORDER BY week_start, plan_date, seq, id');
    res.json(result.rows);
  }));

  app.post('/api/plan-orders/batch', asyncRoute(async (req, res) => {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Expected array of rows' });
    const weekStarts = [...new Set(rows.map(r => r.week_start).filter(Boolean))];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const w of weekStarts) {
        await client.query('DELETE FROM plan_orders WHERE week_start=$1', [w]);
      }
      const inserted = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const result = await client.query(
          `INSERT INTO plan_orders (week_start,plan_date,seq,sap_so,item_code,product,customer,kva,qty,deadline,face_mm,electrical,hv,lv,comment,category)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [r.week_start||null, r.plan_date||null, r.seq??i, r.sap_so||'', r.item_code||'', r.product||'', r.customer||'', r.kva||0, r.qty||1, r.deadline||null, r.face_mm||null, r.electrical||'', r.hv||'', r.lv||'', r.comment||'', r.category||'']
        );
        inserted.push(result.rows[0]);
      }
      await client.query('COMMIT');
      res.json({ inserted: inserted.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  }));

  app.put('/api/plan-orders/:id', asyncRoute(async (req, res) => {
    const allowed = ['week_start','plan_date','seq','sap_so','item_code','product','customer','kva','qty','deadline','face_mm','electrical','hv','lv','comment','category'];
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!entries.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = entries.map(([k], i) => `${k}=$${i+2}`).join(', ');
    const result = await pool.query(
      `UPDATE plan_orders SET ${sets}, updated_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id, ...entries.map(([,v]) => v)]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  }));

  app.delete('/api/plan-orders', asyncRoute(async (req, res) => {
    const result = await pool.query('DELETE FROM plan_orders');
    res.json({ deleted: result.rowCount });
  }));

  app.delete('/api/plan-orders/week/:week_start', asyncRoute(async (req, res) => {
    const result = await pool.query('DELETE FROM plan_orders WHERE week_start=$1', [req.params.week_start]);
    res.json({ deleted: result.rowCount });
  }));

  app.delete('/api/plan-orders/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM plan_orders WHERE id=$1', [req.params.id]);
    res.status(204).send();
  }));
}

module.exports = planOrderRoutes;
