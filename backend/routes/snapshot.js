const pool = require('../db/pool');
const { asyncRoute, toNumber } = require('../db/helpers');
const { getSnapshot, upsertWorkCenter, upsertProduct, upsertOrder } = require('../db/init');

function snapshotRoutes(app) {
  app.get('/api/snapshot', asyncRoute(async (req, res) => {
    res.json(await getSnapshot());
  }));

  app.put('/api/snapshot', asyncRoute(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const data = req.body || {};
      if (data.wc_config) {
        await client.query('DELETE FROM work_centers');
        for (const [wcId, cfg] of Object.entries(data.wc_config)) await upsertWorkCenter(client, wcId, cfg);
      }
      if (data.products) {
        await client.query('DELETE FROM products');
        for (const [productId, product] of Object.entries(data.products)) await upsertProduct(client, productId, product);
      }
      if (data.open_load) {
        await client.query('DELETE FROM open_load');
        for (const [wcId, hours] of Object.entries(data.open_load)) {
          await client.query(
            `INSERT INTO open_load (wc_id, hours) VALUES ($1,$2)
             ON CONFLICT (wc_id) DO UPDATE SET hours = EXCLUDED.hours, updated_at = now()`,
            [wcId, toNumber(hours)]
          );
        }
      }
      if (data.holidays) {
        await client.query('DELETE FROM holidays');
        for (const [date, name] of Object.entries(data.holidays)) {
          await client.query(
            `INSERT INTO holidays (date, name) VALUES ($1,$2)
             ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
            [date, name]
          );
        }
      }
      if (data.factory_holidays) {
        await client.query('DELETE FROM factory_holidays');
        for (const [date, name] of Object.entries(data.factory_holidays)) {
          await client.query(
            `INSERT INTO factory_holidays (date, name) VALUES ($1,$2)
             ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
            [date, name]
          );
        }
      }
      if (Array.isArray(data.accepted_orders)) {
        await client.query('DELETE FROM accepted_orders');
        for (const order of data.accepted_orders) await upsertOrder(client, order);
      }
      await client.query('COMMIT');
      res.json(await getSnapshot(pool));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));
}

module.exports = snapshotRoutes;
