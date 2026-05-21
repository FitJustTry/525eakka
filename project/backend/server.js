require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool, types } = require('pg');

// Return DATE columns as plain "YYYY-MM-DD" strings to avoid timezone shifts
types.setTypeParser(types.builtins.DATE, val => val);

const PORT = Number(process.env.PORT || 3000);

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'ekarat',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
      }
);

function dateKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function normalizeOrder(order = {}) {
  return {
    id: String(order.id || Date.now()),
    product: order.product || '',
    qty: parseInt(order.qty, 10) || 1,
    deadline: dateKey(order.deadline),
    customer: order.customer || '',
    kva: order.kva === undefined || order.kva === null || order.kva === '' ? 0 : parseInt(order.kva, 10) || 0,
    category: order.category || '',
    sap_so: order.sap_so || '',
    plan_date: order.plan_date ? dateKey(order.plan_date) : '',
    comment: order.comment || '',
    created_at: order.created_at || new Date().toISOString(),
  };
}

function rowToOrder(r) {
  return {
    id: r.id,
    product: r.product,
    qty: r.qty,
    deadline: dateKey(r.deadline),
    customer: r.customer,
    kva: r.kva,
    category: r.category,
    sap_so: r.sap_so,
    plan_date: r.plan_date ? dateKey(r.plan_date) : '',
    comment: r.comment,
    created_at: r.created_at,
  };
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wc_config (
      wc_id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS products (
      product_id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS open_load (
      wc_id TEXT PRIMARY KEY,
      hours NUMERIC NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS holidays (
      date DATE PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS factory_holidays (
      date DATE PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accepted_orders (
      id TEXT PRIMARY KEY,
      product TEXT NOT NULL DEFAULT '',
      qty INTEGER NOT NULL DEFAULT 1,
      deadline DATE,
      customer TEXT NOT NULL DEFAULT '',
      kva INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT '',
      sap_so TEXT NOT NULL DEFAULT '',
      plan_date DATE,
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getSnapshot() {
  const [wcRows, prodRows, olRows, holRows, fholRows, ordRows] = await Promise.all([
    pool.query('SELECT wc_id, data FROM wc_config'),
    pool.query('SELECT product_id, data FROM products'),
    pool.query('SELECT wc_id, hours FROM open_load'),
    pool.query('SELECT date, name FROM holidays'),
    pool.query('SELECT date, name FROM factory_holidays'),
    pool.query('SELECT * FROM accepted_orders ORDER BY created_at'),
  ]);

  const wc_config = {};
  wcRows.rows.forEach(r => { wc_config[r.wc_id] = r.data; });

  const products = {};
  prodRows.rows.forEach(r => { products[r.product_id] = r.data; });

  const open_load = {};
  olRows.rows.forEach(r => { open_load[r.wc_id] = Number(r.hours); });

  const holidays = {};
  holRows.rows.forEach(r => { holidays[dateKey(r.date)] = r.name; });

  const factory_holidays = {};
  fholRows.rows.forEach(r => { factory_holidays[dateKey(r.date)] = r.name; });

  const accepted_orders = ordRows.rows.map(rowToOrder);

  return { wc_config, products, open_load, holidays, factory_holidays, accepted_orders };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'postgresql', host: process.env.PGHOST || 'localhost', dbname: process.env.PGDATABASE || 'ekarat' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/snapshot', async (req, res) => {
  try {
    res.json(await getSnapshot());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/snapshot', async (req, res) => {
  try {
    const next = req.body || {};
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (next.wc_config) {
        await client.query('DELETE FROM wc_config');
        for (const [wc_id, data] of Object.entries(next.wc_config)) {
          await client.query('INSERT INTO wc_config (wc_id, data) VALUES ($1, $2)', [wc_id, JSON.stringify(data)]);
        }
      }

      if (next.products) {
        await client.query('DELETE FROM products');
        for (const [product_id, data] of Object.entries(next.products)) {
          await client.query('INSERT INTO products (product_id, data) VALUES ($1, $2)', [product_id, JSON.stringify(data)]);
        }
      }

      if (next.open_load) {
        await client.query('DELETE FROM open_load');
        for (const [wc_id, hours] of Object.entries(next.open_load)) {
          await client.query('INSERT INTO open_load (wc_id, hours) VALUES ($1, $2)', [wc_id, Number(hours) || 0]);
        }
      }

      if (next.holidays) {
        await client.query('DELETE FROM holidays');
        for (const [date, name] of Object.entries(next.holidays)) {
          await client.query('INSERT INTO holidays (date, name) VALUES ($1, $2)', [date, name]);
        }
      }

      if (next.factory_holidays) {
        await client.query('DELETE FROM factory_holidays');
        for (const [date, name] of Object.entries(next.factory_holidays)) {
          await client.query('INSERT INTO factory_holidays (date, name) VALUES ($1, $2)', [date, name]);
        }
      }

      if (Array.isArray(next.accepted_orders)) {
        await client.query('DELETE FROM accepted_orders');
        for (const o of next.accepted_orders.map(normalizeOrder)) {
          await client.query(
            `INSERT INTO accepted_orders (id,product,qty,deadline,customer,kva,category,sap_so,plan_date,comment,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [o.id, o.product, o.qty, o.deadline || null, o.customer, o.kva, o.category, o.sap_so, o.plan_date || null, o.comment, o.created_at]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json(await getSnapshot());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/wc', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT wc_id, data FROM wc_config');
    const result = {};
    rows.forEach(r => { result[r.wc_id] = r.data; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/wc/:wcId', async (req, res) => {
  try {
    const { wcId } = req.params;
    const { rows } = await pool.query('SELECT data FROM wc_config WHERE wc_id = $1', [wcId]);
    const merged = { ...(rows[0]?.data || {}), ...req.body };
    await pool.query(
      'INSERT INTO wc_config (wc_id, data) VALUES ($1, $2) ON CONFLICT (wc_id) DO UPDATE SET data = EXCLUDED.data',
      [wcId, JSON.stringify(merged)]
    );
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT product_id, data FROM products');
    const result = {};
    rows.forEach(r => { result[r.product_id] = r.data; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/products/:productId', async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO products (product_id, data) VALUES ($1, $2) ON CONFLICT (product_id) DO UPDATE SET data = EXCLUDED.data',
      [req.params.productId, JSON.stringify(req.body)]
    );
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/openload', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT wc_id, hours FROM open_load');
    const result = {};
    rows.forEach(r => { result[r.wc_id] = Number(r.hours); });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/openload/:wc', async (req, res) => {
  try {
    const hours = Number(req.body.hours) || 0;
    await pool.query(
      'INSERT INTO open_load (wc_id, hours) VALUES ($1, $2) ON CONFLICT (wc_id) DO UPDATE SET hours = EXCLUDED.hours',
      [req.params.wc, hours]
    );
    res.json({ [req.params.wc]: hours });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/holidays', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT date, name FROM holidays');
    const result = {};
    rows.forEach(r => { result[dateKey(r.date)] = r.name; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/holidays', async (req, res) => {
  try {
    const { date, name } = req.body;
    if (!date || !name) return res.status(400).json({ error: 'date and name are required' });
    const d = dateKey(date);
    await pool.query(
      'INSERT INTO holidays (date, name) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name',
      [d, name]
    );
    res.status(201).json({ date: d, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/holidays/:date', async (req, res) => {
  try {
    await pool.query('DELETE FROM holidays WHERE date = $1', [req.params.date]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/factory-holidays', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT date, name FROM factory_holidays');
    const result = {};
    rows.forEach(r => { result[dateKey(r.date)] = r.name; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/factory-holidays', async (req, res) => {
  try {
    const { date, name } = req.body;
    if (!date || !name) return res.status(400).json({ error: 'date and name are required' });
    const d = dateKey(date);
    await pool.query(
      'INSERT INTO factory_holidays (date, name) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name',
      [d, name]
    );
    res.status(201).json({ date: d, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/factory-holidays/:date', async (req, res) => {
  try {
    await pool.query('DELETE FROM factory_holidays WHERE date = $1', [req.params.date]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM accepted_orders ORDER BY created_at');
    res.json(rows.map(rowToOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const order = normalizeOrder(req.body);
    if (!order.product || !order.deadline) {
      return res.status(400).json({ error: 'product and deadline are required' });
    }
    await pool.query(
      `INSERT INTO accepted_orders (id,product,qty,deadline,customer,kva,category,sap_so,plan_date,comment,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET product=$2,qty=$3,deadline=$4,customer=$5,kva=$6,category=$7,sap_so=$8,plan_date=$9,comment=$10`,
      [order.id, order.product, order.qty, order.deadline || null, order.customer, order.kva, order.category, order.sap_so, order.plan_date || null, order.comment, order.created_at]
    );
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/batch', async (req, res) => {
  try {
    const orders = Array.isArray(req.body) ? req.body : req.body.orders;
    if (!Array.isArray(orders)) return res.status(400).json({ error: 'Expected an array of orders' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM accepted_orders');
      for (const o of orders.map(normalizeOrder)) {
        await client.query(
          `INSERT INTO accepted_orders (id,product,qty,deadline,customer,kva,category,sap_so,plan_date,comment,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [o.id, o.product, o.qty, o.deadline || null, o.customer, o.kva, o.category, o.sap_so, o.plan_date || null, o.comment, o.created_at]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const { rows } = await pool.query('SELECT * FROM accepted_orders ORDER BY created_at');
    res.json(rows.map(rowToOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM accepted_orders WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = normalizeOrder({ ...rowToOrder(rows[0]), ...req.body, id: req.params.id });
    await pool.query(
      `UPDATE accepted_orders SET product=$2,qty=$3,deadline=$4,customer=$5,kva=$6,category=$7,sap_so=$8,plan_date=$9,comment=$10
       WHERE id=$1`,
      [order.id, order.product, order.qty, order.deadline || null, order.customer, order.kva, order.category, order.sap_so, order.plan_date || null, order.comment]
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM accepted_orders WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/seed', async (req, res) => {
  try {
    const seed = req.body && Object.keys(req.body).length ? req.body : {
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

      for (const [wc_id, data] of Object.entries(seed.wc_config || {})) {
        await client.query(
          'INSERT INTO wc_config (wc_id, data) VALUES ($1, $2) ON CONFLICT (wc_id) DO UPDATE SET data = EXCLUDED.data',
          [wc_id, JSON.stringify(data)]
        );
      }
      for (const [product_id, data] of Object.entries(seed.products || {})) {
        await client.query(
          'INSERT INTO products (product_id, data) VALUES ($1, $2) ON CONFLICT (product_id) DO UPDATE SET data = EXCLUDED.data',
          [product_id, JSON.stringify(data)]
        );
      }
      for (const [wc_id, hours] of Object.entries(seed.open_load || {})) {
        await client.query(
          'INSERT INTO open_load (wc_id, hours) VALUES ($1, $2) ON CONFLICT (wc_id) DO UPDATE SET hours = EXCLUDED.hours',
          [wc_id, Number(hours) || 0]
        );
      }
      for (const [date, name] of Object.entries(seed.holidays || {})) {
        await client.query(
          'INSERT INTO holidays (date, name) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name',
          [date, name]
        );
      }
      for (const [date, name] of Object.entries(seed.factory_holidays || {})) {
        await client.query(
          'INSERT INTO factory_holidays (date, name) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name',
          [date, name]
        );
      }
      if (Array.isArray(seed.accepted_orders)) {
        for (const o of seed.accepted_orders.map(normalizeOrder)) {
          await client.query(
            `INSERT INTO accepted_orders (id,product,qty,deadline,customer,kva,category,sap_so,plan_date,comment,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO NOTHING`,
            [o.id, o.product, o.qty, o.deadline || null, o.customer, o.kva, o.category, o.sap_so, o.plan_date || null, o.comment, o.created_at]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ message: 'Seeded data', snapshot: await getSnapshot() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Ekarat backend running at http://localhost:${PORT}`);
    console.log(`📄 Frontend: http://localhost:${PORT}/`);
    console.log(`🐘 Database: ${process.env.DATABASE_URL || `postgresql://${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'ekarat'}`}`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
