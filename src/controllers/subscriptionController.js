const pool = require('../db/pool');

const PLAN_DAYS = { monthly: 30, yearly: 365 };

// POST /api/subscriptions/redeem — teacher activates subscription with a prepaid code
// body: { code: "MOU3-XXXX-XXXX" }
async function redeem(req, res) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Le code est requis.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const profileResult = await client.query(
      'SELECT id, governorate, degree, experience FROM teacher_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (profileResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Profil professeur introuvable.' });
    }
    const teacherId = profileResult.rows[0].id;
    const profile = profileResult.rows[0];

    // Profile must be COMPLETE before a code can be redeemed — a teacher can only
    // go live once parents have full information. Checks the same fields the
    // dashboard requires to save.
    const [subjCount, levelCount] = await Promise.all([
      client.query('SELECT COUNT(*)::int AS n FROM teacher_subjects WHERE teacher_id = $1', [teacherId]),
      client.query('SELECT COUNT(*)::int AS n FROM teacher_levels WHERE teacher_id = $1', [teacherId]),
    ]);
    const missing = [];
    if (!profile.degree) missing.push('le diplôme');
    if (!profile.experience) missing.push("l'expérience");
    if (!profile.governorate) missing.push('le gouvernorat');
    if (subjCount.rows[0].n === 0) missing.push('au moins une matière avec un prix');
    if (levelCount.rows[0].n === 0) missing.push('au moins un niveau enseigné');
    if (missing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Veuillez compléter votre profil avant d\'activer votre abonnement. Il manque : '
          + missing.join(', ') + '.',
      });
    }

    // Lock the code row to prevent two requests redeeming it at the same time
    const codeResult = await client.query(
      `SELECT * FROM prepaid_codes WHERE code = $1 FOR UPDATE`,
      [code.trim().toUpperCase()]
    );
    const prepaidCode = codeResult.rows[0];

    if (!prepaidCode) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Code introuvable. Vérifiez la saisie.' });
    }
    if (prepaidCode.status !== 'unused') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ce code a déjà été utilisé ou est désactivé.' });
    }

    const durationDays = PLAN_DAYS[prepaidCode.plan];

    await client.query(
      `UPDATE prepaid_codes
       SET status = 'used', used_by_teacher_id = $1, used_at = NOW()
       WHERE id = $2`,
      [teacherId, prepaidCode.id]
    );

    const subResult = await client.query(
      `INSERT INTO subscriptions (teacher_id, plan, amount, payment_status, payment_reference, starts_at, ends_at)
       VALUES ($1, $2, 0, 'paid', $3, NOW(), NOW() + INTERVAL '${durationDays} days')
       RETURNING id, plan, starts_at, ends_at`,
      [teacherId, prepaidCode.plan, `prepaid:${prepaidCode.code}`]
    );

    await client.query('COMMIT');
    res.status(201).json({
      message: 'Abonnement activé avec succès !',
      subscription: subResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: "Erreur serveur lors de l'activation du code." });
  } finally {
    client.release();
  }
}
// GET /api/subscriptions/me — teacher checks their own subscription status
async function getMySubscription(req, res) {
  try {
    const profileResult = await pool.query(
      'SELECT id FROM teacher_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profil introuvable.' });
    }
    const teacherId = profileResult.rows[0].id;
    const result = await pool.query(
      `SELECT plan, starts_at, ends_at, payment_status
       FROM subscriptions
       WHERE teacher_id = $1 AND payment_status = 'paid'
       ORDER BY ends_at DESC LIMIT 1`,
      [teacherId]
    );
    res.json({ subscription: result.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { redeem, getMySubscription };
