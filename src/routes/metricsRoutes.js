const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Only these events are accepted, so nobody can spam arbitrary strings.
const ALLOWED_EVENTS = ['search_view', 'profile_view', 'call_click', 'whatsapp_click'];

// POST /api/track  { event: "call_click" }
// Public, no auth, no personal data — just bumps a daily counter.
router.post('/track', async (req, res) => {
  const { event } = req.body || {};
  if (!ALLOWED_EVENTS.includes(event)) {
    return res.status(400).json({ error: 'Invalid event.' });
  }
  try {
    await pool.query(
      `INSERT INTO metrics_daily (event, day, count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (event, day) DO UPDATE SET count = metrics_daily.count + 1`,
      [event]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('track error', err.message);
    res.json({ ok: false });
  }
});

// GET /api/admin/metrics — admin only. Returns all-time totals + last 14 days.
router.get('/admin/metrics', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const [totals, recent] = await Promise.all([
      pool.query(`SELECT event, SUM(count)::int AS total FROM metrics_daily GROUP BY event`),
      pool.query(
        `SELECT to_char(day,'YYYY-MM-DD') AS day, event, count
         FROM metrics_daily
         WHERE day >= CURRENT_DATE - INTERVAL '13 days'
         ORDER BY day DESC, event`
      ),
    ]);
    const totalsObj = {};
    totals.rows.forEach((r) => { totalsObj[r.event] = r.total; });
    res.json({ totals: totalsObj, recent: recent.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
