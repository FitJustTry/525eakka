const pool = require('./pool');
const { toNumber, dateKey, rowToWorkCenter, rowToProduct, rowToOrder, rowToCuttingMachine } = require('./helpers');

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
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS week_start TEXT`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS seq INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS plant TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS electrical TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS total_kva NUMERIC NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS enter_test TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS cable_box TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS control TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS due_store TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS due_so TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS adjust_plan TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS due_clamp TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS due_box_ctrl TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS raw_mat TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS lv TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS hv TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE accepted_orders ADD COLUMN IF NOT EXISTS done_qty INTEGER NOT NULL DEFAULT 0`);
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
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS laser BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS m4 BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS min_face_mm INTEGER NOT NULL DEFAULT 1`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS max_face_mm INTEGER NOT NULL DEFAULT 9999`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS drill_8mm BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS drill_22mm BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS rates JSONB NOT NULL DEFAULT '[]'`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS reg_hrs NUMERIC NOT NULL DEFAULT 8`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS ot_hrs NUMERIC NOT NULL DEFAULT 4`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS wc_id TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS off_days JSONB NOT NULL DEFAULT '[]'`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS time_mul NUMERIC NOT NULL DEFAULT 1`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS tmc_hrs NUMERIC NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS tmc_rates JSONB NOT NULL DEFAULT '[]'`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS tr_power_hrs NUMERIC NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS tr_power_rates JSONB NOT NULL DEFAULT '[]'`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS class_h_hrs NUMERIC NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE cutting_machines ADD COLUMN IF NOT EXISTS class_h_rates JSONB NOT NULL DEFAULT '[]'`);
    await client.query(`UPDATE cutting_machines SET laser = laser_m4 WHERE laser = false AND laser_m4 = true`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS coil_machines (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        station_type TEXT NOT NULL DEFAULT '',
        wc_id TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS plan_orders (
        id SERIAL PRIMARY KEY,
        week_start DATE,
        plan_date DATE,
        seq INTEGER NOT NULL DEFAULT 0,
        sap_so TEXT NOT NULL DEFAULT '',
        item_code TEXT NOT NULL DEFAULT '',
        product TEXT NOT NULL DEFAULT '',
        customer TEXT NOT NULL DEFAULT '',
        kva INTEGER NOT NULL DEFAULT 0,
        qty INTEGER NOT NULL DEFAULT 1,
        deadline DATE,
        face_mm INTEGER,
        electrical TEXT NOT NULL DEFAULT '',
        hv TEXT NOT NULL DEFAULT '',
        lv TEXT NOT NULL DEFAULT '',
        comment TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_plan_orders_week ON plan_orders(week_start)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sap_routing (
        id SERIAL PRIMARY KEY,
        order_no TEXT NOT NULL DEFAULT '',
        material_code TEXT NOT NULL DEFAULT '',
        wc_id TEXT NOT NULL DEFAULT '',
        operation TEXT NOT NULL DEFAULT '',
        std_hrs NUMERIC(10,4) NOT NULL DEFAULT 0,
        is_confirmed BOOLEAN NOT NULL DEFAULT false,
        plant TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_sap_routing_order ON sap_routing(order_no)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sap_routing_wc ON sap_routing(wc_id)');
    await client.query(`ALTER TABLE sap_routing ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}'`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cutting_rates (
        id INTEGER PRIMARY KEY DEFAULT 1,
        rates JSONB NOT NULL DEFAULT '[]'
      )
    `);
    await client.query(`INSERT INTO cutting_rates (id, rates) VALUES (1, '[]') ON CONFLICT DO NOTHING`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cutting_tmc_rates (
        id INTEGER PRIMARY KEY DEFAULT 1,
        rates JSONB NOT NULL DEFAULT '[]'
      )
    `);
    await client.query(`INSERT INTO cutting_tmc_rates (id, rates) VALUES (1, '[]') ON CONFLICT DO NOTHING`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cutting_tr_power_rates (
        id INTEGER PRIMARY KEY DEFAULT 1,
        rates JSONB NOT NULL DEFAULT '[]'
      )
    `);
    await client.query(`INSERT INTO cutting_tr_power_rates (id, rates) VALUES (1, '[]') ON CONFLICT DO NOTHING`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cutting_class_h_rates (
        id INTEGER PRIMARY KEY DEFAULT 1,
        rates JSONB NOT NULL DEFAULT '[]'
      )
    `);
    await client.query(`INSERT INTO cutting_class_h_rates (id, rates) VALUES (1, '[]') ON CONFLICT DO NOTHING`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cutting_plan_snapshots (
        id SERIAL PRIMARY KEY,
        week_start DATE NOT NULL,
        week_end DATE NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        plan_data JSONB NOT NULL DEFAULT '{}',
        saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_cutting_plan_week ON cutting_plan_snapshots(week_start)');
    // Phase 1: plan lifecycle columns
    await client.query(`ALTER TABLE cutting_plan_snapshots ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'`);
    await client.query(`ALTER TABLE cutting_plan_snapshots ADD COLUMN IF NOT EXISTS planned_finish_dates JSONB NOT NULL DEFAULT '{}'`);
    await client.query(`ALTER TABLE cutting_plan_snapshots ADD COLUMN IF NOT EXISTS planned_hours JSONB NOT NULL DEFAULT '{}'`);
    await client.query(`ALTER TABLE cutting_plan_snapshots ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE cutting_plan_snapshots ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE cutting_plan_snapshots ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS coil_machines (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 1,
        type TEXT NOT NULL DEFAULT '',
        min_kva INTEGER NOT NULL DEFAULT 0,
        max_kva INTEGER NOT NULL DEFAULT 9999,
        hrs_per_unit NUMERIC NOT NULL DEFAULT 2.0,
        wire TEXT NOT NULL DEFAULT '',
        hv_lv TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        off_days JSONB NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // Ensure all coil_machines columns exist (adds to old schema if needed)
    await client.query(`ALTER TABLE coil_machines ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE coil_machines ADD COLUMN IF NOT EXISTS min_kva INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE coil_machines ADD COLUMN IF NOT EXISTS max_kva INTEGER NOT NULL DEFAULT 9999`);
    await client.query(`ALTER TABLE coil_machines ADD COLUMN IF NOT EXISTS hrs_per_unit NUMERIC NOT NULL DEFAULT 2.0`);
    await client.query(`ALTER TABLE coil_machines ADD COLUMN IF NOT EXISTS wire TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE coil_machines ADD COLUMN IF NOT EXISTS hv_lv TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE coil_machines ADD COLUMN IF NOT EXISTS off_days JSONB NOT NULL DEFAULT '[]'`);
    await client.query(`ALTER TABLE coil_machines ADD COLUMN IF NOT EXISTS reg_hrs NUMERIC NOT NULL DEFAULT 8`);
    await client.query(`ALTER TABLE coil_machines ADD COLUMN IF NOT EXISTS ot_hrs NUMERIC NOT NULL DEFAULT 4`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS routing_cr (
        id SERIAL PRIMARY KEY,
        sheet_name TEXT NOT NULL DEFAULT '',
        size_label TEXT NOT NULL DEFAULT '',
        size_kva INTEGER NOT NULL DEFAULT 0,
        routing_group TEXT NOT NULL DEFAULT '',
        operation TEXT NOT NULL DEFAULT '',
        wc_id TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        qty_per_op NUMERIC NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT '',
        std_hrs NUMERIC(10,4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_routing_cr_routing_group ON routing_cr(routing_group)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_routing_cr_wc ON routing_cr(wc_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_routing_cr_size ON routing_cr(size_kva)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS routing_hv (
        id SERIAL PRIMARY KEY,
        sheet_name TEXT NOT NULL DEFAULT '',
        size_label TEXT NOT NULL DEFAULT '',
        size_kva INTEGER NOT NULL DEFAULT 0,
        routing_group TEXT NOT NULL DEFAULT '',
        operation TEXT NOT NULL DEFAULT '',
        wc_id TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        qty_per_op NUMERIC NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT '',
        std_hrs NUMERIC(10,4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_routing_hv_routing_group ON routing_hv(routing_group)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_routing_hv_wc ON routing_hv(wc_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_routing_hv_size ON routing_hv(size_kva)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS routing_lv (
        id SERIAL PRIMARY KEY,
        sheet_name TEXT NOT NULL DEFAULT '',
        size_label TEXT NOT NULL DEFAULT '',
        size_kva INTEGER NOT NULL DEFAULT 0,
        routing_group TEXT NOT NULL DEFAULT '',
        operation TEXT NOT NULL DEFAULT '',
        wc_id TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        qty_per_op NUMERIC NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT '',
        std_hrs NUMERIC(10,4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_routing_lv_routing_group ON routing_lv(routing_group)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_routing_lv_wc ON routing_lv(wc_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_routing_lv_size ON routing_lv(size_kva)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_rates (
        id SERIAL PRIMARY KEY,
        station_type TEXT NOT NULL DEFAULT '',
        section TEXT NOT NULL DEFAULT '',
        kva INTEGER NOT NULL DEFAULT 0,
        hrs_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,
        efficiency NUMERIC(6,4) NOT NULL DEFAULT 0,
        machines INTEGER NOT NULL DEFAULT 0,
        hrs_per_day NUMERIC(6,2) NOT NULL DEFAULT 0,
        working_days NUMERIC(6,2) NOT NULL DEFAULT 0,
        available_hrs NUMERIC(10,2) NOT NULL DEFAULT 0,
        source_file TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_cap_rates_station ON cap_rates(station_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_cap_rates_kva ON cap_rates(kva)');
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
    item_code: value.item_code || '',
    week_start: value.week_start || '',
    seq: toInt(value.seq, 0),
    plant: value.plant || '',
    electrical: value.electrical || '',
    total_kva: toNumber(value.total_kva, 0),
    enter_test: value.enter_test || '',
    cable_box: value.cable_box || '',
    control: value.control || '',
    due_store: value.due_store || '',
    due_so: value.due_so || '',
    adjust_plan: value.adjust_plan || '',
    due_clamp: value.due_clamp || '',
    due_box_ctrl: value.due_box_ctrl || '',
    raw_mat: value.raw_mat || '',
    lv: value.lv || '',
    hv: value.hv || '',
    done_qty: toInt(value.done_qty, 0),
  };
  if (!order.product) throw new Error('product is required');
  if (!order.deadline) throw new Error('deadline is required');

  await client.query(
    `INSERT INTO accepted_orders
       (id,product,qty,deadline,customer,kva,category,sap_so,plan_date,comment,item_code,
        week_start,seq,plant,electrical,total_kva,enter_test,cable_box,control,
        due_store,due_so,adjust_plan,due_clamp,due_box_ctrl,raw_mat,lv,hv,done_qty)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     ON CONFLICT (id) DO UPDATE SET
       product=EXCLUDED.product, qty=EXCLUDED.qty, deadline=EXCLUDED.deadline,
       customer=EXCLUDED.customer, kva=EXCLUDED.kva, category=EXCLUDED.category,
       sap_so=EXCLUDED.sap_so, plan_date=EXCLUDED.plan_date, comment=EXCLUDED.comment,
       item_code=EXCLUDED.item_code, week_start=EXCLUDED.week_start, seq=EXCLUDED.seq,
       plant=EXCLUDED.plant, electrical=EXCLUDED.electrical, total_kva=EXCLUDED.total_kva,
       enter_test=EXCLUDED.enter_test, cable_box=EXCLUDED.cable_box, control=EXCLUDED.control,
       due_store=EXCLUDED.due_store, due_so=EXCLUDED.due_so, adjust_plan=EXCLUDED.adjust_plan,
       due_clamp=EXCLUDED.due_clamp, due_box_ctrl=EXCLUDED.due_box_ctrl,
       raw_mat=EXCLUDED.raw_mat, lv=EXCLUDED.lv, hv=EXCLUDED.hv, done_qty=EXCLUDED.done_qty,
       updated_at=now()`,
    [
      order.id, order.product, order.qty, order.deadline, order.customer,
      order.kva, order.category, order.sap_so, order.plan_date, order.comment, order.item_code,
      order.week_start, order.seq, order.plant, order.electrical, order.total_kva,
      order.enter_test, order.cable_box, order.control, order.due_store, order.due_so,
      order.adjust_plan, order.due_clamp, order.due_box_ctrl, order.raw_mat, order.lv, order.hv,
      order.done_qty,
    ]
  );
  return order;
}

module.exports = { initDatabase, getSnapshot, upsertWorkCenter, upsertProduct, upsertOrder };
