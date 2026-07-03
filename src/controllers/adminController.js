const pool = require('../db/pool');

async function listPending(req, res) {
  try {
    const result = await pool.query(
      `SELECT tp.id, u.full_name, u.phone, tp.governorate, tp.bio, tp.photo_url,
              tp.certificate_url, tp.created_at
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

async function listAll(req, res) {
  const { status } = req.query;
  try {
    const conditions = status ? `WHERE tp.status = '${status}'` : '';
    const result = await pool.query(
      `SELECT tp.id, u.full_name, u.phone, u.gender, tp.governorate, tp.bio,
              tp.photo_url, tp.certificate_url, tp.status, tp.rejection_reason,
              tp.created_at, tp.updated_at,
              COALESCE(AVG(r.score), 0)::float AS rating,
              COUNT(DISTINCT r.id) AS rating_count,
              s.plan, s.ends_at, s.payment_status
       FROM teacher_profiles tp
       JOIN users u ON u.id = tp.user_id
       LEFT JOIN ratings r ON r.teacher_id = tp.id
       LEFT JOIN subscriptions s ON s.teacher_id = tp.id AND s.payment_status = 'paid' AND s.ends_at > NOW()
       ${conditions}
       GROUP BY tp.id, u.full_name, u.phone, u.gender, tp.governorate, tp.bio,
                tp.photo_url, tp.certificate_url, tp.status, tp.rejection_reason,
                tp.created_at, tp.updated_at, s.plan, s.ends_at, s.payment_status
       ORDER BY tp.created_at DESC`
    );
    res.json({ teachers: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

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

async function suspend(req, res) {
  const { reason } = req.body;
  try {
    await pool.query(
      `UPDATE teacher_profiles SET status = 'suspended', rejection_reason = $1, updated_at = NOW() WHERE id = $2`,
      [reason || "Suspendu par l'administrateur", req.params.id]
    );
    res.json({ message: 'Professeur suspendu.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { listPending, listAll, approve, reject, suspend };
