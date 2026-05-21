require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

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

async function migrate() {
  const dbFile = path.join(__dirname, 'db.json');
  if (!fs.existsSync(dbFile)) {
    console.log('No db.json found — nothing to migrate.');
    process.exit(0);
  }

  const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const [wc_id, wc] of Object.entries(data.wc_config || {})) {
      await client.query(
        'INSERT INTO wc_config (wc_id, data) VALUES ($1, $2) ON CONFLICT (wc_id) DO UPDATE SET data = EXCLUDED.data',
        [wc_id, JSON.stringify(wc)]
      );
    }
    console.log(`Migrated ${Object.keys(data.wc_config || {}).length} wc_config rows`);

    for (const [product_id, product] of Object.entries(data.products || {})) {
      await client.query(
        'INSERT INTO products (product_id, data) VALUES ($1, $2) ON CONFLICT (product_id) DO UPDATE SET data = EXCLUDED.data',
        [product_id, JSON.stringify(product)]
      );
    }
    console.log(`Migrated ${Object.keys(data.products || {}).length} product rows`);

    for (const [wc_id, hours] of Object.entries(data.open_load || {})) {
      await client.query(
        'INSERT INTO open_load (wc_id, hours) VALUES ($1, $2) ON CONFLICT (wc_id) DO UPDATE SET hours = EXCLUDED.hours',
        [wc_id, Number(hours) || 0]
      );
    }
    console.log(`Migrated ${Object.keys(data.open_load || {}).length} open_load rows`);

    for (const [date, name] of Object.entries(data.holidays || {})) {
      await client.query(
        'INSERT INTO holidays (date, name) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name',
        [date, name]
      );
    }
    console.log(`Migrated ${Object.keys(data.holidays || {}).length} holiday rows`);

    for (const [date, name] of Object.entries(data.factory_holidays || {})) {
      await client.query(
        'INSERT INTO factory_holidays (date, name) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name',
        [date, name]
      );
    }
    console.log(`Migrated ${Object.keys(data.factory_holidays || {}).length} factory_holiday rows`);

    for (const o of (data.accepted_orders || [])) {
      await client.query(
        `INSERT INTO accepted_orders (id,product,qty,deadline,customer,kva,category,sap_so,plan_date,comment,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO NOTHING`,
        [
          String(o.id), o.product || '', parseInt(o.qty, 10) || 1,
          o.deadline || null, o.customer || '',
          parseInt(o.kva, 10) || 0, o.category || '', o.sap_so || '',
          o.plan_date ? dateKey(o.plan_date) : null,
          o.comment || '', o.created_at || new Date().toISOString(),
        ]
      );
    }
    console.log(`Migrated ${(data.accepted_orders || []).length} accepted_orders rows`);

    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
