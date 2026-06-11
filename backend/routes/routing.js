const pool = require('../db/pool');
const { asyncRoute } = require('../db/helpers');

function makeRoutingRoutes(app, tableName, prefix) {
  app.get(`/api/${prefix}`, asyncRoute(async (req, res) => {
    const { routing_group, wc_id, size_kva } = req.query;
    let sql = `SELECT * FROM ${tableName}`;
    const params = [];
    const wheres = [];
    if (routing_group) { wheres.push(`routing_group=$${params.length+1}`); params.push(routing_group); }
    if (wc_id) { wheres.push(`wc_id=$${params.length+1}`); params.push(wc_id); }
    if (size_kva) { wheres.push(`size_kva=$${params.length+1}`); params.push(parseInt(size_kva)); }
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY sheet_name, size_kva, routing_group, operation';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  }));

  app.post(`/api/${prefix}/batch`, asyncRoute(async (req, res) => {
    const rows = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'Expected non-empty array' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${tableName}`);
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const vals = chunk.map((_, j) => {
          const b = j * 10;
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`;
        }).join(',');
        const params = chunk.flatMap(r => [
          String(r.sheet_name || ''),
          String(r.size_label || ''),
          parseInt(r.size_kva) || 0,
          String(r.routing_group || ''),
          String(r.operation || ''),
          String(r.wc_id || ''),
          String(r.description || ''),
          parseFloat(r.qty_per_op) || 1,
          String(r.unit || ''),
          parseFloat(r.std_hrs) || 0,
        ]);
        await client.query(
          `INSERT INTO ${tableName}(sheet_name,size_label,size_kva,routing_group,operation,wc_id,description,qty_per_op,unit,std_hrs) VALUES ${vals}`,
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

  app.delete(`/api/${prefix}`, asyncRoute(async (req, res) => {
    const result = await pool.query(`DELETE FROM ${tableName}`);
    res.json({ deleted: result.rowCount });
  }));
}

function routingRoutes(app) {
  makeRoutingRoutes(app, 'routing_cr', 'routing-cr');
  makeRoutingRoutes(app, 'routing_hv', 'routing-hv');
  makeRoutingRoutes(app, 'routing_lv', 'routing-lv');
}

module.exports = routingRoutes;
