const pool = require('../db/pool');
const { asyncRoute } = require('../db/helpers');

function capRatesRoutes(app) {
  app.get('/api/cap-rates', asyncRoute(async (req, res) => {
    const { station_type, section } = req.query;
    let sql = 'SELECT * FROM cap_rates';
    const params = [];
    const wheres = [];
    if (station_type) { wheres.push(`station_type=$${params.length+1}`); params.push(station_type); }
    if (section !== undefined && section !== '') { wheres.push(`section=$${params.length+1}`); params.push(section); }
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY station_type, section, kva';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  }));

  app.post('/api/cap-rates/batch', asyncRoute(async (req, res) => {
    const rows = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'Expected non-empty array' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM cap_rates');
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const vals = chunk.map((_, j) => {
          const b = j * 10;
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`;
        }).join(',');
        const params = chunk.flatMap(r => [
          String(r.station_type || ''),
          String(r.section || ''),
          parseInt(r.kva) || 0,
          parseFloat(r.hrs_per_unit) || 0,
          parseFloat(r.efficiency) || 0,
          parseInt(r.machines) || 0,
          parseFloat(r.hrs_per_day) || 0,
          parseFloat(r.working_days) || 0,
          parseFloat(r.available_hrs) || 0,
          String(r.source_file || ''),
        ]);
        await client.query(
          `INSERT INTO cap_rates(station_type,section,kva,hrs_per_unit,efficiency,machines,hrs_per_day,working_days,available_hrs,source_file) VALUES ${vals}`,
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

  app.delete('/api/cap-rates', asyncRoute(async (req, res) => {
    const result = await pool.query('DELETE FROM cap_rates');
    res.json({ deleted: result.rowCount });
  }));
}

module.exports = capRatesRoutes;
