const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Only these events are accepted, so nobody can spam arbitrary strings.
const ALLOWED_EVENTS = ['search_view', 'profile_view', 'call_click', 'whatsapp_click'];

// Events that belong to a specific teacher (so we record WHICH teacher).
const TEACHER_EVENTS = ['profile_view', 'call_click', 'whatsapp_click'];

// POST /api/track  { event: "call_click", teacherId: 52 }
// Public, no auth, no personal data — just bumps daily counters.
// teacherId is optional; when present and the event is teacher-specific,
// we also bump the per-teacher counter. Fire-and-forget: never 500s the caller.
router.post('/track', async (req, res) => {
  const { event, teacherId } = req.body || {};
  if (!ALLOWED_EVENTS.includes(event)) {
    return res.status(400).json({ error: 'Invalid event.' });
  }
  try {
    // Global daily counter (unchanged behaviour).
    await pool.query(
      `INSERT INTO metrics_daily (event, day, count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (event, day) DO UPDATE SET count = metrics_daily.count + 1`,
      [event]
    );

    // Per-teacher daily counter, only for teacher-specific events with a valid id.
    const tid = parseInt(teacherId, 10);
    if (TEACHER_EVENTS.includes(event) && Number.isInteger(tid) && tid > 0) {
      await pool.query(
        `INSERT INTO teacher_metrics_daily (teacher_id, event, day, count)
         VALUES ($1, $2, CURRENT_DATE, 1)
         ON CONFLICT (teacher_id, event, day)
         DO UPDATE SET count = teacher_metrics_daily.count + 1`,
        [tid, event]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('track error', err.message);
    res.json({ ok: false });
  }
});

// GET /api/admin/metrics — admin only. Returns all-time totals + last 30 days.
router.get('/admin/metrics', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const [totals, recent] = await Promise.all([
      pool.query(`SELECT event, SUM(count)::int AS total FROM metrics_daily GROUP BY event`),
      pool.query(
        `SELECT to_char(day,'YYYY-MM-DD') AS day, event, count
         FROM metrics_daily
         WHERE day >= CURRENT_DATE - INTERVAL '29 days'
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

// GET /api/admin/metrics/teachers — admin only.
// Per-teacher breakdown over the last 30 days: who was viewed / called / WhatsApp'd.
router.get('/admin/metrics/teachers', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         tm.teacher_id,
         u.full_name,
         u.phone,
         COALESCE(SUM(tm.count) FILTER (WHERE tm.event = 'profile_view'), 0)::int   AS profile_views,
         COALESCE(SUM(tm.count) FILTER (WHERE tm.event = 'call_click'), 0)::int      AS call_clicks,
         COALESCE(SUM(tm.count) FILTER (WHERE tm.event = 'whatsapp_click'), 0)::int  AS whatsapp_clicks
       FROM teacher_metrics_daily tm
       LEFT JOIN teacher_profiles tp ON tp.id = tm.teacher_id
       LEFT JOIN users u ON u.id = tp.user_id
       WHERE tm.day >= CURRENT_DATE - INTERVAL '29 days'
       GROUP BY tm.teacher_id, u.full_name, u.phone
       ORDER BY (
         COALESCE(SUM(tm.count) FILTER (WHERE tm.event = 'call_click'), 0)
         + COALESCE(SUM(tm.count) FILTER (WHERE tm.event = 'whatsapp_click'), 0)
       ) DESC,
       profile_views DESC`
    );
    res.json({ teachers: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
