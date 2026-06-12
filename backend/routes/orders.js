const pool = require('../db/pool');
const { asyncRoute, toNumber, rowToOrder } = require('../db/helpers');
const { getSnapshot, upsertWorkCenter, upsertProduct, upsertOrder } = require('../db/init');

function orderRoutes(app) {
  app.get('/api/orders', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM accepted_orders ORDER BY created_at ASC, id ASC');
    res.json(result.rows.map(rowToOrder));
  }));

  app.post('/api/orders', asyncRoute(async (req, res) => {
    const client = await pool.connect();
    try {
      const saved = await upsertOrder(client, req.body);
      res.status(201).json(saved);
    } finally {
      client.release();
    }
  }));

  app.post('/api/orders/batch', asyncRoute(async (req, res) => {
    const orders = Array.isArray(req.body) ? req.body : req.body.orders;
    if (!Array.isArray(orders)) return res.status(400).json({ error: 'Expected an array of orders' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM accepted_orders');
      const saved = [];
      for (const order of orders) saved.push(await upsertOrder(client, order));
      await client.query('COMMIT');
      res.json(saved);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  app.put('/api/orders/:id', asyncRoute(async (req, res) => {
    const allowed = ['product','qty','deadline','customer','kva','category','sap_so','plan_date','comment','item_code',
      'week_start','seq','plant','electrical','total_kva','enter_test','cable_box','control',
      'due_store','due_so','adjust_plan','due_clamp','due_box_ctrl','raw_mat','lv','hv','done_qty'];
    const entries = Object.entries(req.body).filter(([key]) => allowed.includes(key));
    if (!entries.length) return res.status(400).json({ error: 'No valid fields to update' });

    const sets = entries.map(([key], index) => `${key} = $${index + 2}`);
    sets.push('updated_at = now()');
    const values = entries.map(([, value]) => value);

    // Set done_at the first time done_qty reaches qty
    const doneQtyVal = entries.find(([k]) => k === 'done_qty')?.[1];
    if (doneQtyVal != null) {
      const cur = await pool.query('SELECT qty, done_at FROM accepted_orders WHERE id=$1', [req.params.id]);
      if (cur.rows.length && parseInt(doneQtyVal) >= cur.rows[0].qty && !cur.rows[0].done_at) {
        sets.push('done_at = now()');
      }
    }

    const result = await pool.query(
      `UPDATE accepted_orders SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Order not found' });
    res.json(rowToOrder(result.rows[0]));
  }));

  app.delete('/api/orders', asyncRoute(async (req, res) => {
    const result = await pool.query('DELETE FROM accepted_orders');
    res.json({ deleted: result.rowCount });
  }));

  app.delete('/api/orders/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM accepted_orders WHERE id = $1', [req.params.id]);
    res.status(204).send();
  }));

  app.post('/api/seed', asyncRoute(async (req, res) => {
    const hasBody = req.body && Object.keys(req.body).length > 0;
    const seed = hasBody ? req.body : {
      wc_config: {
        EE3102: { name: 'แท่นตัดเหล็ก Oil+C.H.', workers: 11, hrs: 8, ot: 4, sat_hrs: 4, sat_ot: 2, eff: 78 },
        EE3201: { name: 'พันคอยล์แรงสูง', workers: 33, hrs: 8, ot: 4, sat_hrs: 4, sat_ot: 2, eff: 95 },
        EE3301: { name: 'ลงคอยล์+เสียบเหล็ก', workers: 11, hrs: 8, ot: 4, sat_hrs: 4, sat_ot: 4, eff: 90 },
      },
      products: {
        'tr.50kVA': { label: 'tr.50kVA - 50kVA', std_hrs: 27.1, kva: 50, ops: [] },
        'tr.160kVA': { label: 'tr.160kVA - 160kVA', std_hrs: 29.4, kva: 160, ops: [] },
      },
      open_load: { EE3102: 140.75, EE3201: 162.65 },
      holidays: { '2026-01-01': 'ปีใหม่', '2026-04-13': 'สงกรานต์' },
      factory_holidays: {},
      accepted_orders: [],
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (seed.wc_config) for (const [wcId, cfg] of Object.entries(seed.wc_config)) await upsertWorkCenter(client, wcId, cfg);
      if (seed.products) for (const [productId, product] of Object.entries(seed.products)) await upsertProduct(client, productId, product);
      if (seed.open_load) {
        for (const [wcId, hours] of Object.entries(seed.open_load)) {
          await client.query(
            `INSERT INTO open_load (wc_id, hours) VALUES ($1,$2)
             ON CONFLICT (wc_id) DO UPDATE SET hours = EXCLUDED.hours, updated_at = now()`,
            [wcId, toNumber(hours)]
          );
        }
      }
      if (seed.holidays) {
        for (const [date, name] of Object.entries(seed.holidays)) {
          await client.query(
            `INSERT INTO holidays (date, name) VALUES ($1,$2)
             ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
            [date, name]
          );
        }
      }
      if (seed.factory_holidays) {
        for (const [date, name] of Object.entries(seed.factory_holidays)) {
          await client.query(
            `INSERT INTO factory_holidays (date, name) VALUES ($1,$2)
             ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
            [date, name]
          );
        }
      }
      if (Array.isArray(seed.accepted_orders)) {
        for (const order of seed.accepted_orders) await upsertOrder(client, order);
      }
      await client.query('COMMIT');
      res.json({ message: 'Seeded data', snapshot: await getSnapshot(pool) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));
}

module.exports = orderRoutes;
