const pool = require('../db/pool');
const { asyncRoute, toNumber, dateKey, rowToWorkCenter } = require('../db/helpers');
const { getSnapshot, upsertWorkCenter, upsertProduct } = require('../db/init');

function holidayRoutes(tableName) {
  return {
    list: asyncRoute(async (req, res) => {
      const result = await pool.query(`SELECT date, name FROM ${tableName} ORDER BY date`);
      const data = {};
      result.rows.forEach(row => { data[dateKey(row.date)] = row.name; });
      res.json(data);
    }),
    upsert: asyncRoute(async (req, res) => {
      const { date, name } = req.body;
      if (!date || !name) return res.status(400).json({ error: 'date and name are required' });
      await pool.query(
        `INSERT INTO ${tableName} (date, name) VALUES ($1,$2)
         ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
        [date, name]
      );
      res.status(201).json({ date, name });
    }),
    remove: asyncRoute(async (req, res) => {
      await pool.query(`DELETE FROM ${tableName} WHERE date = $1`, [req.params.date]);
      res.status(204).send();
    }),
  };
}

function configRoutes(app) {
  app.get('/api/config/wc', asyncRoute(async (req, res) => {
    res.json((await getSnapshot()).wc_config);
  }));

  app.put('/api/config/wc/:wcId', asyncRoute(async (req, res) => {
    const client = await pool.connect();
    try {
      const current = await client.query('SELECT * FROM work_centers WHERE wc_id = $1', [req.params.wcId]);
      const merged = { ...(current.rows[0] ? rowToWorkCenter(current.rows[0]) : {}), ...req.body };
      const saved = await upsertWorkCenter(client, req.params.wcId, merged);
      res.json(saved);
    } finally {
      client.release();
    }
  }));

  app.get('/api/config/products', asyncRoute(async (req, res) => {
    res.json((await getSnapshot()).products);
  }));

  app.put('/api/config/products/:productId', asyncRoute(async (req, res) => {
    const client = await pool.connect();
    try {
      const saved = await upsertProduct(client, req.params.productId, req.body);
      res.json(saved);
    } finally {
      client.release();
    }
  }));

  app.get('/api/config/openload', asyncRoute(async (req, res) => {
    res.json((await getSnapshot()).open_load);
  }));

  app.put('/api/config/openload/:wc', asyncRoute(async (req, res) => {
    const hours = toNumber(req.body.hours);
    await pool.query(
      `INSERT INTO open_load (wc_id, hours) VALUES ($1,$2)
       ON CONFLICT (wc_id) DO UPDATE SET hours = EXCLUDED.hours, updated_at = now()`,
      [req.params.wc, hours]
    );
    res.json({ [req.params.wc]: hours });
  }));

  const publicHoliday = holidayRoutes('holidays');
  app.get('/api/holidays', publicHoliday.list);
  app.post('/api/holidays', publicHoliday.upsert);
  app.delete('/api/holidays/:date', publicHoliday.remove);

  const factoryHoliday = holidayRoutes('factory_holidays');
  app.get('/api/factory-holidays', factoryHoliday.list);
  app.post('/api/factory-holidays', factoryHoliday.upsert);
  app.delete('/api/factory-holidays', asyncRoute(async (req, res) => {
    const result = await pool.query('DELETE FROM factory_holidays');
    res.json({ deleted: result.rowCount });
  }));
  app.delete('/api/factory-holidays/:date', factoryHoliday.remove);
}

module.exports = configRoutes;
