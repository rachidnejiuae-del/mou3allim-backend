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
  const { status, filter } = req.query;
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

    // One query instead of ~5 per teacher. Subjects/levels are aggregated as JSON,
    // the active paid subscription reference is picked via a LATERAL subquery
    // (ordered by ends_at DESC, same as before), and whether the teacher ever had a
    // trial is a boolean EXISTS. Same output shape as the previous per-row version.
    const result = await pool.query(
      `SELECT tp.id, u.full_name, u.phone, u.gender, tp.governorate, tp.bio,
              tp.photo_url, tp.certificate_url, tp.status, tp.rejection_reason,
              tp.created_at, tp.updated_at, tp.degree, tp.experience,
              COALESCE(rt.rating, 0)::float AS rating,
              COALESCE(rt.rating_count, 0) AS rating_count,
              act.plan, act.ends_at, act.payment_status, act.payment_reference AS active_ref,
              (had_trial.teacher_id IS NOT NULL) AS had_trial,
              COALESCE(subj.subjects, '[]'::json) AS subjects,
              COALESCE(lvl.levels, '[]'::json) AS levels
       FROM teacher_profiles tp
       JOIN users u ON u.id = tp.user_id
       LEFT JOIN LATERAL (
         SELECT AVG(r.score)::float AS rating, COUNT(DISTINCT r.id) AS rating_count
         FROM ratings r WHERE r.teacher_id = tp.id
       ) rt ON TRUE
       LEFT JOIN LATERAL (
         SELECT s.plan, s.ends_at, s.payment_status, s.payment_reference
         FROM subscriptions s
         WHERE s.teacher_id = tp.id AND s.payment_status = 'paid' AND s.ends_at > NOW()
         ORDER BY s.ends_at DESC LIMIT 1
       ) act ON TRUE
       LEFT JOIN LATERAL (
         SELECT tp.id AS teacher_id
         WHERE EXISTS (
           SELECT 1 FROM subscriptions s2
           WHERE s2.teacher_id = tp.id AND s2.payment_reference = 'trial:approval-7d'
         )
       ) had_trial ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('name', sub.name, 'price_per_hour', ts.price_per_hour)) AS subjects
         FROM teacher_subjects ts JOIN subjects sub ON sub.id = ts.subject_id
         WHERE ts.teacher_id = tp.id
       ) subj ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(tl.level_name) AS levels
         FROM teacher_levels tl WHERE tl.teacher_id = tp.id
       ) lvl ON TRUE
       ${conditions}
       ORDER BY tp.created_at DESC`,
      params
    );

    let teachers = result.rows.map((t) => {
      const activeRef = t.active_ref || null;
      const hasActive = !!activeRef;
      const isPaid = activeRef && activeRef.indexOf('prepaid:') === 0;
      const isTrialActive = activeRef === 'trial:approval-7d';
      const trialExpired = t.status === 'approved' && t.had_trial && !hasActive;
      const { active_ref, had_trial, ...rest } = t;
      return {
        ...rest,
        subjects: t.subjects || [],
        levels: t.levels || [],
        sub_state: isPaid ? 'paid' : (isTrialActive ? 'trial' : (trialExpired ? 'trial_expired' : 'none')),
        trial_expired: trialExpired,
      };
    });

    if (filter === 'trial_expired') {
      teachers = teachers.filter((t) => t.trial_expired);
    }

    res.json({ teachers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

async function getStats(req, res) {
  try {
    const [totalResult, statusResult, activeSubsResult, trialResult, paidResult, expiredTrialsResult, ratingsResult] = await Promise.all([
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
      pool.query(`
        SELECT COUNT(DISTINCT teacher_id)::int AS count
        FROM subscriptions
        WHERE payment_status = 'paid' AND ends_at > NOW()
          AND payment_reference = 'trial:approval-7d'
      `),
      pool.query(`
        SELECT COUNT(DISTINCT teacher_id)::int AS count
        FROM subscriptions
        WHERE payment_status = 'paid' AND ends_at > NOW()
          AND payment_reference LIKE 'prepaid:%'
      `),
      pool.query(`
        SELECT COUNT(*)::int AS count FROM teacher_profiles tp
        WHERE tp.status = 'approved'
          AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.teacher_id = tp.id AND s.payment_reference = 'trial:approval-7d')
          AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.teacher_id = tp.id AND s2.payment_status = 'paid' AND s2.ends_at > NOW())
      `),
      pool.query(`SELECT COUNT(*)::int AS count FROM ratings WHERE hidden = FALSE`),
    ]);

    const statusCounts = { approved: 0, pending: 0, suspended: 0, rejected: 0 };
    statusResult.rows.forEach((r) => { statusCounts[r.status] = r.count; });

    res.json({
      total_teachers: totalResult.rows[0].count,
      by_status: statusCounts,
      active_subscriptions: activeSubsResult.rows[0].count,
      trial_teachers: trialResult.rows[0].count,
      paid_teachers: paidResult.rows[0].count,
      expired_trials: expiredTrialsResult.rows[0].count,
      total_ratings: ratingsResult.rows[0].count,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

async function approve(req, res) {
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

async function deleteTeacher(req, res) {
  const teacherId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prof = await client.query('SELECT user_id FROM teacher_profiles WHERE id = $1', [teacherId]);
    if (prof.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Professeur introuvable.' });
    }
    const userId = prof.rows[0].user_id;

    await client.query('DELETE FROM prepaid_codes WHERE used_by_teacher_id = $1', [teacherId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    await client.query('COMMIT');
    res.json({ message: 'Compte supprimé définitivement.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la suppression.' });
  } finally {
    client.release();
  }
}

async function listTrials(req, res) {
  try {
    const endingSoon = await pool.query(`
      SELECT tp.id, u.full_name, u.phone, tp.governorate, s.ends_at,
             CEIL(EXTRACT(EPOCH FROM (s.ends_at - NOW()))/86400)::int AS days_left
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.user_id
      JOIN subscriptions s ON s.teacher_id = tp.id
      WHERE s.payment_status = 'paid'
        AND s.payment_reference = 'trial:approval-7d'
        AND s.ends_at > NOW()
        AND s.ends_at <= NOW() + INTERVAL '2 days'
      ORDER BY s.ends_at ASC
    `);

    const endedUnpaid = await pool.query(`
      SELECT DISTINCT tp.id, u.full_name, u.phone, tp.governorate,
             MAX(s.ends_at) AS trial_ended_at,
             tp.status
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.user_id
      JOIN subscriptions s ON s.teacher_id = tp.id
      WHERE s.payment_reference = 'trial:approval-7d'
        AND s.ends_at <= NOW()
        AND NOT EXISTS (
          SELECT 1 FROM subscriptions s2
          WHERE s2.teacher_id = tp.id
            AND s2.payment_status = 'paid'
            AND s2.ends_at > NOW()
        )
      GROUP BY tp.id, u.full_name, u.phone, tp.governorate, tp.status
      ORDER BY MAX(s.ends_at) DESC
    `);

    res.json({ ending_soon: endingSoon.rows, ended_unpaid: endedUnpaid.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { listPending, listAll, getStats, approve, reject, suspend, deleteTeacher, listTrials };
