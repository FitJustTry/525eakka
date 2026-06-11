const pool = require('../db/pool');
const { asyncRoute, toNumber } = require('../db/helpers');

function kvaFromDescription(desc) {
  if (!desc) return 0;
  const m = String(desc).match(/(\d[\d,]*)\s*kva/i);
  if (m) return parseInt(m[1].replace(/,/g, ''));
  return 0;
}

function sapRoutingRoutes(app) {
  app.get('/api/sap-routing', asyncRoute(async (req, res) => {
    const { wc_id, order_no } = req.query;
    let sql = 'SELECT * FROM sap_routing';
    const params = [];
    if (wc_id) { sql += ' WHERE wc_id=$1'; params.push(wc_id); }
    else if (order_no) { sql += ' WHERE order_no=$1'; params.push(order_no); }
    sql += ' ORDER BY order_no, wc_id';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  }));

  app.get('/api/sap-routing/catalog', asyncRoute(async (req, res) => {
    const result = await pool.query(`
      SELECT material_code,
             MAX(extra->>'MaterialDescription') AS material_desc,
             MAX(plant) AS plant,
             wc_id,
             MAX(operation) AS operation,
             ROUND(AVG(std_hrs)::numeric, 4) AS avg_std_hrs,
             COUNT(*) AS row_count,
             SUM(std_hrs) AS total_hrs
      FROM sap_routing
      GROUP BY material_code, wc_id
      ORDER BY material_code, wc_id
    `);
    const catalog = {};
    for (const row of result.rows) {
      if (!catalog[row.material_code]) {
        catalog[row.material_code] = {
          mat: row.material_code,
          desc: row.material_desc || '',
          plant: row.plant || '',
          total_hrs: 0,
          ops: []
        };
      }
      const hrs = parseFloat(row.avg_std_hrs);
      catalog[row.material_code].ops.push({ wc: row.wc_id, op: row.operation, hrs, rows: parseInt(row.row_count) });
      catalog[row.material_code].total_hrs += hrs;
    }
    const out = Object.values(catalog).map(c => ({ ...c, total_hrs: Math.round(c.total_hrs * 100) / 100 }));
    res.json(out);
  }));

  // GET /api/sap-routing/rates-by-kva?wc_id=EE3102
  // Reads kVA from extra.MaterialDescription, groups by kVA, averages std_hrs
  app.get('/api/sap-routing/rates-by-kva', asyncRoute(async (req, res) => {
    const { wc_id } = req.query;
    if (!wc_id) return res.status(400).json({ error: 'wc_id required' });
    const result = await pool.query(
      `SELECT extra->>'MaterialDescription' AS desc,
              ROUND(AVG(std_hrs)::numeric, 4) AS avg_hrs,
              COUNT(*) AS cnt
       FROM sap_routing
       WHERE wc_id=$1 AND std_hrs > 0
       GROUP BY extra->>'MaterialDescription'
       ORDER BY extra->>'MaterialDescription'`,
      [wc_id]
    );
    const byKva = {};
    for (const row of result.rows) {
      const kva = kvaFromDescription(row.desc);
      if (kva <= 0) continue;
      if (!byKva[kva]) byKva[kva] = { sum: 0, count: 0 };
      byKva[kva].sum   += parseFloat(row.avg_hrs) * parseInt(row.cnt);
      byKva[kva].count += parseInt(row.cnt);
    }
    const rates = Object.entries(byKva)
      .map(([kva, v]) => ({ kva: parseInt(kva), hrs: Math.round(v.sum / v.count * 100) / 100, count: v.count }))
      .sort((a, b) => a.kva - b.kva);
    res.json(rates);
  }));

  // GET /api/sap-routing/by-kva?kva=3500
  // Returns all routing operations for materials whose MaterialDescription contains that kVA
  // Groups by wc_id + operation, averages std_hrs across all matching materials
  app.get('/api/sap-routing/by-kva', asyncRoute(async (req, res) => {
    const kva = parseInt(req.query.kva);
    if (!kva) return res.status(400).json({ error: 'kva required' });
    const result = await pool.query(`
      SELECT wc_id,
             MAX(operation) AS operation,
             ROUND(AVG(std_hrs)::numeric, 4) AS avg_hrs,
             COUNT(DISTINCT material_code) AS material_count,
             COUNT(*) AS row_count
      FROM sap_routing
      WHERE (extra->>'MaterialDescription') ~* ($1::text || '\\s*kva')
      GROUP BY wc_id
      ORDER BY avg_hrs DESC
    `, [kva]);
    const total = result.rows.reduce((s, r) => s + parseFloat(r.avg_hrs), 0);
    res.json({ kva, ops: result.rows.map(r => ({ wc: r.wc_id, op: r.operation, hrs: parseFloat(r.avg_hrs), materials: parseInt(r.material_count) })), total_hrs: Math.round(total * 100) / 100 });
  }));

  // GET /api/sap-routing/search?q=xxx
  // Search by order_no, material_code, or MaterialDescription — returns grouped by material_code
  app.get('/api/sap-routing/search', asyncRoute(async (req, res) => {
    const q = (req.query.q ?? '').trim();
    if (!q) return res.json([]);
    const result = await pool.query(`
      SELECT material_code,
             MAX(extra->>'MaterialDescription') AS material_desc,
             MAX(plant) AS plant,
             wc_id,
             MAX(operation) AS operation,
             ROUND(AVG(std_hrs)::numeric, 4) AS avg_hrs,
             COUNT(*) AS row_count,
             array_agg(DISTINCT order_no ORDER BY order_no) AS order_nos
      FROM sap_routing
      WHERE order_no ILIKE $1
         OR material_code ILIKE $1
         OR (extra->>'MaterialDescription') ILIKE $1
         OR wc_id ILIKE $1
         OR operation ILIKE $1
      GROUP BY material_code, wc_id
      ORDER BY material_code, wc_id
      LIMIT 200
    `, [`%${q}%`]);
    const catalog = {};
    for (const row of result.rows) {
      if (!catalog[row.material_code]) {
        catalog[row.material_code] = { mat: row.material_code, desc: row.material_desc || '', plant: row.plant || '', total_hrs: 0, order_nos: row.order_nos ?? [], ops: [] };
      }
      const hrs = parseFloat(row.avg_hrs);
      catalog[row.material_code].ops.push({ wc: row.wc_id, op: row.operation, hrs, rows: parseInt(row.row_count) });
      catalog[row.material_code].total_hrs += hrs;
    }
    const out = Object.values(catalog).map(c => ({ ...c, total_hrs: Math.round(c.total_hrs * 100) / 100 }));
    res.json(out);
  }));

  app.get('/api/sap-routing/summary', asyncRoute(async (req, res) => {
    const result = await pool.query(`
      SELECT wc_id, COUNT(*) AS op_count,
             SUM(std_hrs) AS total_std_hrs,
             SUM(CASE WHEN is_confirmed THEN 1 ELSE 0 END) AS confirmed
      FROM sap_routing
      GROUP BY wc_id ORDER BY wc_id
    `);
    res.json(result.rows);
  }));

  app.post('/api/sap-routing/batch', asyncRoute(async (req, res) => {
    const rows = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'Expected non-empty array' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM sap_routing');
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const vals = chunk.map((_, j) => {
          const b = j * 8;
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`;
        }).join(',');
        const params = chunk.flatMap(r => [
          String(r.order_no || ''),
          String(r.material_code || ''),
          String(r.wc_id || ''),
          String(r.operation || ''),
          toNumber(r.std_hrs),
          !!r.is_confirmed,
          String(r.plant || ''),
          JSON.stringify(r.extra || {}),
        ]);
        await client.query(
          `INSERT INTO sap_routing(order_no,material_code,wc_id,operation,std_hrs,is_confirmed,plant,extra) VALUES ${vals}`,
          params
        );
        inserted += chunk.length;
      }
      await client.query('COMMIT');
      res.json({ inserted });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
  }));

  app.delete('/api/sap-routing', asyncRoute(async (req, res) => {
    const result = await pool.query('DELETE FROM sap_routing');
    res.json({ deleted: result.rowCount });
  }));
}

module.exports = sapRoutingRoutes;
