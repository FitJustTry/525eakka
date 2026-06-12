const pool = require('../db/pool')

module.exports = function(app) {
  app.get('/api/machine-downtime', async (req, res, next) => {
    try {
      const { machine_id } = req.query
      const q = machine_id
        ? `SELECT * FROM machine_downtime WHERE machine_id = $1 ORDER BY start_date DESC`
        : `SELECT * FROM machine_downtime ORDER BY start_date DESC`
      const rows = machine_id
        ? (await pool.query(q, [machine_id])).rows
        : (await pool.query(q)).rows
      res.json(rows)
    } catch (e) { next(e) }
  })

  app.post('/api/machine-downtime', async (req, res, next) => {
    try {
      const { machine_id, start_date, end_date, reason = 'Breakdown', notes = '' } = req.body
      const r = await pool.query(
        `INSERT INTO machine_downtime (machine_id, start_date, end_date, reason, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [machine_id, start_date, end_date, reason, notes]
      )
      res.json(r.rows[0])
    } catch (e) { next(e) }
  })

  app.put('/api/machine-downtime/:id', async (req, res, next) => {
    try {
      const { start_date, end_date, reason, notes } = req.body
      const r = await pool.query(
        `UPDATE machine_downtime SET start_date=$1, end_date=$2, reason=$3, notes=$4 WHERE id=$5 RETURNING *`,
        [start_date, end_date, reason, notes, req.params.id]
      )
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
      res.json(r.rows[0])
    } catch (e) { next(e) }
  })

  app.delete('/api/machine-downtime/:id', async (req, res, next) => {
    try {
      await pool.query(`DELETE FROM machine_downtime WHERE id=$1`, [req.params.id])
      res.status(204).end()
    } catch (e) { next(e) }
  })
}
