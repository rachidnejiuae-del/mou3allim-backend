const { Pool } = require('pg');
require('dotenv').config();

// Render (and most managed Postgres hosts) require SSL but use a
// self-signed-style cert chain, so we disable strict verification.
// Local development (no PORT/RENDER env set) skips SSL entirely.
const isHosted = !!process.env.RENDER || !!process.env.DATABASE_SSL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isHosted ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
});

module.exports = pool;
