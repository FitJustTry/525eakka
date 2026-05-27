require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.PGHOST || 'localhost',
  port: process.env.DATABASE_URL ? undefined : Number(process.env.PGPORT || 5432),
  database: process.env.DATABASE_URL ? undefined : process.env.PGDATABASE || 'ekarat_capacity',
  user: process.env.DATABASE_URL ? undefined : process.env.PGUSER || 'ekarat_user',
  password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD || 'your_password',
  ssl: String(process.env.PGSSL || '').toLowerCase() === 'true'
    ? { rejectUnauthorized: false }
    : false,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

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
    created_at: row.created_at,
  };
}

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_centers (
        wc_id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        workers INTEGER NOT NULL DEFAULT 0,
        hrs NUMERIC NOT NULL DEFAULT 0,
        ot NUMERIC NOT NULL DEFAULT 0,
        sat_hrs NUMERIC NOT NULL DEFAULT 0,
        sat_ot NUMERIC NOT NULL DEFAULT 0,
        eff INTEGER NOT NULL DEFAULT 90,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        product_id TEXT PRIMARY KEY,
        label TEXT NOT NULL DEFAULT '',
        std_hrs NUMERIC NOT NULL DEFAULT 0,
        kva INTEGER NOT NULL DEFAULT 0,
        ops JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS open_load (
        wc_id TEXT PRIMARY KEY,
        hours NUMERIC NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        date DATE PRIMARY KEY,
        name TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS factory_holidays (
        date DATE PRIMARY KEY,
        name TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS accepted_orders (
        id TEXT PRIMARY KEY,
        product TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 1,
        deadline DATE NOT NULL,
        customer TEXT,
        kva INTEGER,
        category TEXT,
        sap_so TEXT,
        plan_date DATE,
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_accepted_orders_deadline ON accepted_orders(deadline)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_accepted_orders_created ON accepted_orders(created_at DESC)');
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS plan_date DATE`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS item_code TEXT`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        wc_id TEXT NOT NULL,
        emp_id TEXT NOT NULL DEFAULT '',
        emp_name TEXT NOT NULL DEFAULT '',
        dept TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_head BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_head BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS firstname TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS lastname TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS head_id TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS wc_list TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS access_code TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS image TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}'`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_employees_wc ON employees(wc_id)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS cutting_machines (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 1,
        min_kva INTEGER NOT NULL DEFAULT 50,
        max_kva INTEGER NOT NULL DEFAULT 1000,
        hrs_per_unit NUMERIC NOT NULL DEFAULT 2.5,
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS laser_m4 BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS max_face_mm INTEGER NOT NULL DEFAULT 9999`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS drill_8mm BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS drill_22mm BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS coil_plan (
        id SERIAL PRIMARY KEY,
        plan_date TEXT NOT NULL,
        seq NUMERIC,
        importance TEXT,
        sap_so TEXT, item_code TEXT, comment TEXT, plant TEXT,
        kva NUMERIC, electrical TEXT, customer TEXT,
        total_kva NUMERIC, qty INTEGER,
        enter_test TEXT, cable_box TEXT, control TEXT,
        due_store TEXT, due_so TEXT, adjust_plan TEXT,
        due_clamp TEXT, due_box_ctrl TEXT, raw_mat TEXT,
        lv TEXT, hv TEXT,
        week_start TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_coil_plan_week ON coil_plan(week_start)');
    await client.query('COMMIT');
    console.log('✅ PostgreSQL tables ready');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database init error:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function getSnapshot(client = pool) {
  const [wcRows, productRows, openRows, holRows, fholRows, orderRows, empRows, cutRows] = await Promise.all([
    client.query('SELECT * FROM work_centers ORDER BY wc_id'),
    client.query('SELECT * FROM products ORDER BY product_id'),
    client.query('SELECT * FROM open_load ORDER BY wc_id'),
    client.query('SELECT date, name FROM holidays ORDER BY date'),
    client.query('SELECT date, name FROM factory_holidays ORDER BY date'),
    client.query('SELECT * FROM accepted_orders ORDER BY created_at ASC, id ASC'),
    client.query('SELECT * FROM employees ORDER BY wc_id, sort_order, id'),
    client.query('SELECT * FROM cutting_machines ORDER BY sort_order, id'),
  ]);

  const wc_config = {};
  wcRows.rows.forEach(row => { wc_config[row.wc_id] = rowToWorkCenter(row); });

  const products = {};
  productRows.rows.forEach(row => { products[row.product_id] = rowToProduct(row); });

  const open_load = {};
  openRows.rows.forEach(row => { open_load[row.wc_id] = toNumber(row.hours); });

  const holidays = {};
  holRows.rows.forEach(row => { holidays[dateKey(row.date)] = row.name; });

  const factory_holidays = {};
  fholRows.rows.forEach(row => { factory_holidays[dateKey(row.date)] = row.name; });

  const employees = {};
  empRows.rows.forEach(row => {
    if (!employees[row.wc_id]) employees[row.wc_id] = { dept: row.dept, employees: [] };
    employees[row.wc_id].employees.push({ id: row.emp_id, name: row.emp_name, title: row.title||'', firstname: row.firstname||'', lastname: row.lastname||'', is_active: row.is_active, is_head: row.is_head, head_id: row.head_id||'', wc_list: row.wc_list||'', access_code: row.access_code||'', image: row.image||'', extra: row.extra||{} });
  });

  return {
    wc_config,
    products,
    open_load,
    holidays,
    factory_holidays,
    accepted_orders: orderRows.rows.map(rowToOrder),
    employees,
    cutting_machines: cutRows.rows.map(rowToCuttingMachine),
  };
}

async function upsertWorkCenter(client, wcId, value = {}) {
  const cfg = rowToWorkCenter({
    name: value.name || wcId,
    workers: value.workers,
    hrs: value.hrs,
    ot: value.ot,
    sat_hrs: value.sat_hrs,
    sat_ot: value.sat_ot,
    eff: value.eff,
  });
  await client.query(
    `INSERT INTO work_centers (wc_id, name, workers, hrs, ot, sat_hrs, sat_ot, eff)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (wc_id) DO UPDATE SET
       name = EXCLUDED.name,
       workers = EXCLUDED.workers,
       hrs = EXCLUDED.hrs,
       ot = EXCLUDED.ot,
       sat_hrs = EXCLUDED.sat_hrs,
       sat_ot = EXCLUDED.sat_ot,
       eff = EXCLUDED.eff,
       updated_at = now()`,
    [wcId, cfg.name, cfg.workers, cfg.hrs, cfg.ot, cfg.sat_hrs, cfg.sat_ot, cfg.eff]
  );
  return cfg;
}

async function upsertProduct(client, productId, value = {}) {
  const product = rowToProduct({
    label: value.label || productId,
    std_hrs: value.std_hrs,
    kva: value.kva,
    ops: value.ops,
  });
  await client.query(
    `INSERT INTO products (product_id, label, std_hrs, kva, ops)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (product_id) DO UPDATE SET
       label = EXCLUDED.label,
       std_hrs = EXCLUDED.std_hrs,
       kva = EXCLUDED.kva,
       ops = EXCLUDED.ops,
       updated_at = now()`,
    [productId, product.label, product.std_hrs, product.kva, JSON.stringify(product.ops)]
  );
  return product;
}

async function upsertOrder(client, value = {}) {
  const order = {
    id: String(value.id || Date.now()),
    product: value.product,
    qty: toInt(value.qty, 1),
    deadline: dateKey(value.deadline),
    customer: value.customer || '',
    kva: value.kva === undefined || value.kva === null || value.kva === '' ? null : toInt(value.kva),
    category: value.category || '',
    sap_so: value.sap_so || '',
    plan_date: dateKey(value.plan_date),
    comment: value.comment || '',
  };
  if (!order.product) throw new Error('product is required');
  if (!order.deadline) throw new Error('deadline is required');

  await client.query(
    `INSERT INTO accepted_orders
       (id, product, qty, deadline, customer, kva, category, sap_so, plan_date, comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO UPDATE SET
       product = EXCLUDED.product,
       qty = EXCLUDED.qty,
       deadline = EXCLUDED.deadline,
       customer = EXCLUDED.customer,
       kva = EXCLUDED.kva,
       category = EXCLUDED.category,
       sap_so = EXCLUDED.sap_so,
       plan_date = EXCLUDED.plan_date,
       comment = EXCLUDED.comment,
       updated_at = now()`,
    [
      order.id, order.product, order.qty, order.deadline, order.customer,
      order.kva, order.category, order.sap_so, order.plan_date, order.comment,
    ]
  );
  return order;
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get('/api/health', asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT now() AS now');
  res.json({ ok: true, database: 'postgresql', time: result.rows[0].now });
}));

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

const publicHoliday = holidayRoutes('holidays');
app.get('/api/holidays', publicHoliday.list);
app.post('/api/holidays', publicHoliday.upsert);
app.delete('/api/holidays/:date', publicHoliday.remove);

const factoryHoliday = holidayRoutes('factory_holidays');
app.get('/api/factory-holidays', factoryHoliday.list);
app.post('/api/factory-holidays', factoryHoliday.upsert);
app.delete('/api/factory-holidays/:date', factoryHoliday.remove);

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
  const allowed = ['product', 'qty', 'deadline', 'customer', 'kva', 'category', 'sap_so', 'plan_date', 'comment'];
  const entries = Object.entries(req.body).filter(([key]) => allowed.includes(key));
  if (!entries.length) return res.status(400).json({ error: 'No valid fields to update' });

  const sets = entries.map(([key], index) => `${key} = $${index + 2}`);
  sets.push('updated_at = now()');
  const values = entries.map(([, value]) => value);
  const result = await pool.query(
    `UPDATE accepted_orders SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    [req.params.id, ...values]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Order not found' });
  res.json(rowToOrder(result.rows[0]));
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

app.get('/api/employees', asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT * FROM employees ORDER BY wc_id, sort_order, id');
  const employees = {};
  result.rows.forEach(row => {
    if (!employees[row.wc_id]) employees[row.wc_id] = { dept: row.dept, employees: [] };
    employees[row.wc_id].employees.push({ id: row.emp_id, name: row.emp_name, title: row.title||'', firstname: row.firstname||'', lastname: row.lastname||'', is_active: row.is_active, is_head: row.is_head, head_id: row.head_id||'', wc_list: row.wc_list||'', access_code: row.access_code||'', image: row.image||'', extra: row.extra||{} });
  });
  res.json(employees);
}));

// POST /api/employees/batch — replace all employees with EMP_DIR-shaped object
// Body: { "EE3102": { dept: "EE", employees: [{id, name, is_active}] }, ... }
app.post('/api/employees/batch', asyncRoute(async (req, res) => {
  const empDir = req.body;
  if (typeof empDir !== 'object' || Array.isArray(empDir))
    return res.status(400).json({ error: 'Expected EMP_DIR object' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM employees');
    let sortOrder = 0;
    for (const [wcId, data] of Object.entries(empDir)) {
      const dept = data.dept || '';
      for (const emp of (data.employees || [])) {
        await client.query(
          `INSERT INTO employees (wc_id, emp_id, emp_name, title, firstname, lastname, dept, is_active, is_head, head_id, wc_list, access_code, image, extra, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)`,
          [wcId, emp.id||'', emp.name||'', emp.title||'', emp.firstname||'', emp.lastname||'', dept, emp.is_active!==false, emp.is_head===true, emp.head_id||'', emp.wc_list||'', emp.access_code||'', emp.image||'', JSON.stringify(emp.extra||{}), sortOrder++]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ saved: sortOrder });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

function rowToCuttingMachine(row) {
  return {
    id: row.id, name: row.name,
    count: toInt(row.count, 1), min_kva: toInt(row.min_kva, 50),
    max_kva: toInt(row.max_kva, 1000), hrs_per_unit: toNumber(row.hrs_per_unit, 2.5),
    laser_m4: !!row.laser_m4, max_face_mm: toInt(row.max_face_mm, 9999),
    drill_8mm: !!row.drill_8mm, drill_22mm: !!row.drill_22mm, notes: row.notes || '',
  };
}

app.get('/api/cutting-machines', asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT * FROM cutting_machines ORDER BY sort_order, id');
  res.json(result.rows.map(rowToCuttingMachine));
}));

app.post('/api/cutting-machines', asyncRoute(async (req, res) => {
  const { name, count, min_kva, max_kva, hrs_per_unit, laser_m4, max_face_mm, drill_8mm, drill_22mm, notes } = req.body;
  const result = await pool.query(
    `INSERT INTO cutting_machines (name, count, min_kva, max_kva, hrs_per_unit, laser_m4, max_face_mm, drill_8mm, drill_22mm, notes, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,(SELECT COALESCE(MAX(sort_order),0)+1 FROM cutting_machines))
     RETURNING *`,
    [name||'เครื่องตัด', toInt(count,1), toInt(min_kva,50), toInt(max_kva,1000), toNumber(hrs_per_unit,2.5),
     !!laser_m4, toInt(max_face_mm,9999), !!drill_8mm, !!drill_22mm, notes||'']
  );
  res.status(201).json(rowToCuttingMachine(result.rows[0]));
}));

app.put('/api/cutting-machines/:id', asyncRoute(async (req, res) => {
  const { name, count, min_kva, max_kva, hrs_per_unit, laser_m4, max_face_mm, drill_8mm, drill_22mm, notes } = req.body;
  const result = await pool.query(
    `UPDATE cutting_machines SET name=$2, count=$3, min_kva=$4, max_kva=$5, hrs_per_unit=$6,
     laser_m4=$7, max_face_mm=$8, drill_8mm=$9, drill_22mm=$10, notes=$11, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [req.params.id, name, toInt(count,1), toInt(min_kva,50), toInt(max_kva,1000), toNumber(hrs_per_unit,2.5),
     !!laser_m4, toInt(max_face_mm,9999), !!drill_8mm, !!drill_22mm, notes||'']
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Machine not found' });
  res.json(rowToCuttingMachine(result.rows[0]));
}));

app.delete('/api/cutting-machines/:id', asyncRoute(async (req, res) => {
  await pool.query('DELETE FROM cutting_machines WHERE id = $1', [req.params.id]);
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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ PostgreSQL backend running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to start backend:', err);
    process.exit(1);
  });
