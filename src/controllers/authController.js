const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { normalizePhone, isPlausibleTunisianMobile } = require('../utils/phone');

// Fail fast rather than signing tokens with `undefined` as the secret.
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Refusing to start.');
}

const OTP_ENABLED = process.env.OTP_ENABLED === 'true';

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, phone: user.phone },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

async function register(req, res) {
  const { password, full_name, role, gender } = req.body;

  const phone = normalizePhone(req.body.phone);
  if (!phone) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide. Format attendu : +216 XX XXX XXX' });
  }
  if (!isPlausibleTunisianMobile(phone)) {
    return res.status(400).json({ error: 'Veuillez saisir un numéro de mobile tunisien valide.' });
  }
  if (!password || !full_name || !role) {
    return res.status(400).json({ error: 'phone, password, full_name et role sont requis.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }
  if (!['parent', 'teacher'].includes(role)) {
    return res.status(400).json({ error: 'role doit être "parent" ou "teacher".' });
  }

  const validGender = gender === 'female' ? 'female' : 'male';
  const avatarUrl = validGender === 'female'
    ? 'https://i.ibb.co/Kzw9Y1BF/female-teacher.jpg'
    : 'https://i.ibb.co/8DZjzRhB/male-teacher.jpg';

  try {
    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ce numéro de téléphone est déjà utilisé.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (phone, password_hash, full_name, role, gender)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, phone, full_name, role, gender`,
      [phone, passwordHash, full_name, role, validGender]
    );
    const user = result.rows[0];

    if (role === 'teacher') {
      await pool.query(
        `INSERT INTO teacher_profiles (user_id, governorate, status, photo_url)
         VALUES ($1, $2, 'pending', $3)`,
        [user.id, 'Tunis', avatarUrl]
      );
    }

    const token = signToken(user);
    res.status(201).json({ token, user, otp_required: OTP_ENABLED });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ce numéro de téléphone est déjà utilisé.' });
    }
    console.error(err);
    res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
  }
}

async function login(req, res) {
  const { password } = req.body;
  const phone = normalizePhone(req.body.phone);

  if (!phone || !password) {
    return res.status(400).json({ error: 'phone et password sont requis.' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];

    // Same generic message and a real bcrypt comparison either way, so response
    // timing doesn't reveal whether the number is registered.
    if (!user) {
      await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants invalides.' });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, phone: user.phone, full_name: user.full_name, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
}

// Self-service password reset depends on delivering an OTP by SMS.
// With no SMS provider configured the code only reaches the server log, so this
// endpoint stays closed until OTP_ENABLED=true.
async function resetPassword(req, res) {
  if (!OTP_ENABLED) {
    return res.status(503).json({
      error: 'La réinitialisation automatique est momentanément indisponible. Contactez-nous sur WhatsApp au +216 28 357 354.',
    });
  }

  const { code, new_password } = req.body;
  const phone = normalizePhone(req.body.phone);

  if (!phone || !code || !new_password) {
    return res.status(400).json({ error: 'Téléphone, code et nouveau mot de passe requis.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const otpResult = await client.query(
      `SELECT * FROM otp_codes
       WHERE phone = $1 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [phone]
    );
    const otp = otpResult.rows[0];

    if (!otp || otp.attempts >= 5) {
      await client.query('COMMIT');
      return res.status(400).json({ error: 'Code invalide ou expiré. Demandez un nouveau code.' });
    }

    if (otp.code !== code) {
      await client.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
      await client.query('COMMIT');
      return res.status(400).json({ error: 'Code invalide ou expiré.' });
    }

    await client.query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otp.id]);
    const passwordHash = await bcrypt.hash(new_password, 10);
    const userResult = await client.query(
      `UPDATE users SET password_hash = $1 WHERE phone = $2 RETURNING id`,
      [passwordHash, phone]
    );

    await client.query('COMMIT');

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Aucun compte trouvé avec ce numéro.' });
    }
    res.json({ message: 'Mot de passe réinitialisé avec succès.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    client.release();
  }
}

module.exports = { register, login, resetPassword };
</parameter>
