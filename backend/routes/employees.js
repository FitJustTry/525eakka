const pool = require('../db/pool');
const { asyncRoute } = require('../db/helpers');

function employeeRoutes(app) {
  app.get('/api/employees', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM employees ORDER BY wc_id, sort_order, id');
    const employees = {};
    result.rows.forEach(row => {
      if (!employees[row.wc_id]) employees[row.wc_id] = { dept: row.dept, employees: [] };
      employees[row.wc_id].employees.push({ id: row.emp_id, name: row.emp_name, title: row.title||'', firstname: row.firstname||'', lastname: row.lastname||'', is_active: row.is_active, is_head: row.is_head, head_id: row.head_id||'', wc_list: row.wc_list||'', access_code: row.access_code||'', image: row.image||'', extra: row.extra||{} });
    });
    res.json(employees);
  }));

  app.get('/api/employees/flat', asyncRoute(async (req, res) => {
    const result = await pool.query(
      'SELECT id, wc_id, emp_id, emp_name, title, firstname, lastname, dept, is_active, is_head FROM employees ORDER BY wc_id, sort_order, id'
    );
    res.json(result.rows);
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

  app.put('/api/employees/:id', asyncRoute(async (req, res) => {
    const allowed = ['emp_name','dept','title','wc_id','is_active','is_head','firstname','lastname'];
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!entries.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = entries.map(([k], i) => `${k}=$${i + 2}`).join(', ');
    const result = await pool.query(
      `UPDATE employees SET ${sets}, updated_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id, ...entries.map(([, v]) => v)]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  }));

  app.delete('/api/employees/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM employees WHERE id=$1', [req.params.id]);
    res.status(204).send();
  }));
}

module.exports = employeeRoutes;
