const pool = require('../db/pool');

// GET /api/admin/teachers/pending — list profiles awaiting review
async function listPending(req, res) {
  try {
    const result = await pool.query(
      `SELECT tp.id, u.full_name, u.phone, tp.governorate, tp.bio, tp.photo_url, tp.created_at
       FROM teacher_profiles tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.status = 'pending'
       ORDER BY tp.created_at ASC`
    );
    res.json({ teachers: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// PATCH /api/admin/teachers/:id/approve
async function approve(req, res) {
  try {
    await pool.query(
      `UPDATE teacher_profiles SET status = 'approved', rejection_reason = NULL, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ message: 'Profil approuvé.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// PATCH /api/admin/teachers/:id/reject
async function reject(req, res) {
  const { reason } = req.body;
  try {
    await pool.query(
      `UPDATE teacher_profiles SET status = 'rejected', rejection_reason = $1, updated_at = NOW() WHERE id = $2`,
      [reason || 'Non spécifié', req.params.id]
    );
    res.json({ message: 'Profil rejeté.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { listPending, approve, reject };
