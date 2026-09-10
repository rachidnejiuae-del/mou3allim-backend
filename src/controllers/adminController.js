const pool = require('../db/pool');

const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

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
    const params = [];
    let conditions = '';

    if (status) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Statut invalide.' });
      }
      params.push(status);
      conditions = `WHERE tp.status = $${params.length}`;
    }

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
       ORDER BY tp.created_at DESC`,
      params
    );

    const teachers = await Promise.all(result.rows.map(async (t) => {
      const [degExp, subs, levels] = await Promise.all([
        pool.query('SELECT degree, experience FROM teacher_profiles WHERE id = $1', [t.id]),
        pool.query(
          `SELECT sub.name, ts.price_per_hour
           FROM teacher_subjects ts JOIN subjects sub ON sub.id = ts.subject_id
           WHERE ts.teacher_id = $1`, [t.id]),
        pool.query('SELECT level_name FROM teacher_levels WHERE teacher_id = $1', [t.id]),
      ]);
      return {
        ...t,
        degree: degExp.rows[0] ? degExp.rows[0].degree : null,
        experience: degExp.rows[0] ? degExp.rows[0].experience : null,
        subjects: subs.rows,
        levels: levels.rows.map((r) => r.level_name),
      };
    }));

    res.json({ teachers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

async function getStats(req, res) {
  try {
    const [totalResult, statusResult, activeSubsResult, ratingsResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM teacher_profiles`),
      pool.query(`
        SELECT status, COUNT(*)::int AS count
        FROM teacher_profiles
        GROUP BY status
      `),
      pool.query(`
        SELECT COUNT(DISTINCT teacher_id)::int AS count
        FROM subscriptions
        WHERE payment_status = 'paid' AND ends_at > NOW()
      `),
      pool.query(`SELECT COUNT(*)::int AS count FROM ratings WHERE hidden = FALSE`),
    ]);

    const statusCounts = { approved: 0, pending: 0, suspended: 0, rejected: 0 };
    statusResult.rows.forEach((r) => { statusCounts[r.status] = r.count; });

    res.json({
      total_teachers: totalResult.rows[0].count,
      by_status: statusCounts,
      active_subscriptions: activeSubsResult.rows[0].count,
      total_ratings: ratingsResult.rows[0].count,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

async function approve(req, res) {
  // ?trial=1 (or body { trial: true }) also grants a 7-day free trial so the
  // teacher appears in search immediately. Without it, approval alone does NOT
  // make them visible — they must redeem a paid code (original behavior).
  const wantTrial = req.query.trial === '1' || req.query.trial === 'true' || (req.body && req.body.trial === true);
  try {
    await pool.query(
      `UPDATE teacher_profiles SET status = 'approved', rejection_reason = NULL, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    if (wantTrial) {
      const active = await pool.query(
        `SELECT id FROM subscriptions
         WHERE teacher_id = $1 AND payment_status = 'paid' AND ends_at > NOW()
         LIMIT 1`,
        [req.params.id]
      );
      if (active.rows.length === 0) {
        await pool.query(
          `INSERT INTO subscriptions (teacher_id, plan, amount, payment_status, payment_reference, starts_at, ends_at)
           VALUES ($1, 'monthly', 0, 'paid', 'trial:approval-7d', NOW(), NOW() + INTERVAL '7 days')`,
          [req.params.id]
        );
        return res.json({ message: 'Profil approuvé. Essai gratuit de 7 jours activé.' });
      }
      return res.json({ message: 'Profil approuvé (abonnement déjà actif, pas de nouvel essai).' });
    }

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

module.exports = { listPending, listAll, getStats, approve, reject, suspend };
