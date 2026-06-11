require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');
const { initDatabase } = require('./db/init');
const snapshotRoutes = require('./routes/snapshot');
const configRoutes = require('./routes/config');
const orderRoutes = require('./routes/orders');
const employeeRoutes = require('./routes/employees');
const cuttingRoutes = require('./routes/cutting');
const coilRoutes = require('./routes/coil');
const planOrderRoutes = require('./routes/planOrders');
const sapRoutingRoutes = require('./routes/sapRouting');
const routingRoutes = require('./routes/routing');
const capRatesRoutes = require('./routes/capRates');

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', async (req, res) => {
  const result = await pool.query('SELECT now() AS now');
  res.json({ ok: true, database: 'postgresql', time: result.rows[0].now });
});

snapshotRoutes(app);
configRoutes(app);
orderRoutes(app);
employeeRoutes(app);
cuttingRoutes(app);
coilRoutes(app);
planOrderRoutes(app);
sapRoutingRoutes(app);
routingRoutes(app);
capRatesRoutes(app);

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
