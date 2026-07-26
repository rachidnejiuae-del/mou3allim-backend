const pool = require('../db/pool');

async function rate(req, res) {
  const teacherId = req.params.id;
  const { score, comment } = req.body;

  // This route now runs the `authenticate` middleware, so req.user is always
  // set. Registration is required to rate — guest ratings are no longer accepted.
  if (!req.user) {
    return res.status(401).json({ error: 'Connectez-vous pour laisser un avis.' });
  }
  if (req.user.role === 'teacher') {
    return res.status(403).json({ error: 'Seuls les parents peuvent noter un professeur.' });
  }
  if (!score || score < 1 || score > 5) {
    return res.status(400).json({ error: 'score doit être entre 1 et 5.' });
  }

  try {
    // One rating per parent per teacher; a repeat submission updates the prior one.
    await pool.query(
      `INSERT INTO ratings (teacher_id, parent_id, score, comment, guest_name)
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT (teacher_id, parent_id)
       DO UPDATE SET score = $3, comment = $4, created_at = NOW()`,
      [teacherId, req.user.id, score, comment || null]
    );
    res.json({ message: 'Merci pour votre avis !' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de la note." });
  }
}

async function list(req, res) {
  try {
    // Show only the parent's FIRST name publicly (privacy) — never the full name.
    const result = await pool.query(
      `SELECT r.id, r.score, r.comment, r.created_at, r.hidden,
        COALESCE(split_part(u.full_name, ' ', 1), 'Anonyme') AS parent_name
       FROM ratings r
       LEFT JOIN users u ON u.id = r.parent_id
       WHERE r.teacher_id = $1 AND r.hidden = FALSE
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

async function hide(req, res) {
  try {
    await pool.query(`UPDATE ratings SET hidden = TRUE WHERE id = $1`, [req.params.ratingId]);
    res.json({ message: 'Commentaire masqué.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

async function unhide(req, res) {
  try {
    await pool.query(`UPDATE ratings SET hidden = FALSE WHERE id = $1`, [req.params.ratingId]);
    res.json({ message: 'Commentaire restauré.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { rate, list, hide, unhide };
