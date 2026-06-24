const pool = require('../db/pool');

// POST /api/teachers/:id/ratings — parent rates a teacher (upsert: one rating per parent)
async function rate(req, res) {
  const teacherId = req.params.id;
  const { score, comment } = req.body;

  if (req.user.role !== 'parent') {
    return res.status(403).json({ error: 'Seuls les parents peuvent noter un professeur.' });
  }
  if (!score || score < 1 || score > 5) {
    return res.status(400).json({ error: 'score doit être entre 1 et 5.' });
  }

  try {
    await pool.query(
      `INSERT INTO ratings (teacher_id, parent_id, score, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (teacher_id, parent_id)
       DO UPDATE SET score = $3, comment = $4, created_at = NOW()`,
      [teacherId, req.user.id, score, comment || null]
    );
    res.json({ message: 'Merci pour votre avis !' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'enregistrement de la note.' });
  }
}

// GET /api/teachers/:id/ratings — list ratings/comments for a teacher
async function list(req, res) {
  try {
    const result = await pool.query(
      `SELECT r.score, r.comment, r.created_at, u.full_name AS parent_name
       FROM ratings r
       JOIN users u ON u.id = r.parent_id
       WHERE r.teacher_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [req.params.id]
    );
    res.json({ ratings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { rate, list };
