const pool = require('../db/pool');

// POST /api/teachers/:id/ratings
async function rate(req, res) {
  const teacherId = req.params.id;
  const { score, comment, guest_name } = req.body;

  if (!score || score < 1 || score > 5) {
    return res.status(400).json({ error: 'score doit être entre 1 et 5.' });
  }

  try {
    if (req.user) {
      // Logged-in user (parent account)
      if (req.user.role === 'teacher') {
        return res.status(403).json({ error: 'Seuls les parents peuvent noter un professeur.' });
      }
      await pool.query(
        `INSERT INTO ratings (teacher_id, parent_id, score, comment, guest_name)
         VALUES ($1, $2, $3, $4, NULL)
         ON CONFLICT (teacher_id, parent_id)
         DO UPDATE SET score = $3, comment = $4, created_at = NOW()`,
        [teacherId, req.user.id, score, comment || null]
      );
    } else {
      // Anonymous guest — use guest_name
      if (!guest_name || !guest_name.trim()) {
        return res.status(400).json({ error: 'Le prénom est requis pour noter.' });
      }
      await pool.query(
        `INSERT INTO ratings (teacher_id, parent_id, score, comment, guest_name)
         VALUES ($1, NULL, $2, $3, $4)`,
        [teacherId, score, comment || null, guest_name.trim()]
      );
    }
    res.json({ message: 'Merci pour votre avis !' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de la note." });
  }
}

// GET /api/teachers/:id/ratings
async function list(req, res) {
  try {
    const result = await pool.query(
      `SELECT r.score, r.comment, r.created_at,
        COALESCE(r.guest_name, u.full_name, 'Anonyme') AS parent_name
       FROM ratings r
       LEFT JOIN users u ON u.id = r.parent_id
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
