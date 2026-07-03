const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, phone: user.phone },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

async function register(req, res) {
  const { phone, password, full_name, role, gender } = req.body;

  if (!phone || !password || !full_name || !role) {
    return res.status(400).json({ error: 'phone, password, full_name et role sont requis.' });
  }
  if (!['parent', 'teacher'].includes(role)) {
    return res.status(400).json({ error: 'role doit être "parent" ou "teacher".' });
  }

  const validGender = gender === 'female' ? 'female' : 'male';
  const avatarUrl = validGender === 'female'
    ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=female-teacher&style=circle'
    : 'https://api.dicebear.com/7.x/avataaars/svg?seed=male-teacher&style=circle';

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
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
  }
}

async function login(req, res) {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'phone et password sont requis.' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Identifiants invalides.' });
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

async function bootstrapAdmin(req, res) {
  const { phone, key } = req.query;
  if (!process.env.ADMIN_SETUP_KEY || key !== process.env.ADMIN_SETUP_KEY) {
    return res.status(403).send('Clé invalide.');
  }
  if (!phone) return res.status(400).send('Paramètre phone manquant.');
  try {
    const result = await pool.query(
      `UPDATE users SET role = 'admin' WHERE phone = $1 RETURNING id, phone, full_name, role`,
      [phone]
    );
    if (result.rows.length === 0) {
      return res.status(404).send(`Aucun utilisateur trouvé avec le numéro ${phone}.`);
    }
    res.send(`✅ ${result.rows[0].full_name} (${phone}) est maintenant admin.`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur.');
  }
}

async function resetPassword(req, res) {
  const { phone, code, new_password } = req.body;
  if (!phone || !code || !new_password) {
    return res.status(400).json({ error: 'Téléphone, code et nouveau mot de passe requis.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }
  try {
    const otpResult = await pool.query(
      `SELECT * FROM otp_codes
       WHERE phone = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code]
    );
    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Code invalide ou expiré.' });
    }
    await pool.query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otpResult.rows[0].id]);
    const passwordHash = await bcrypt.hash(new_password, 10);
    const userResult = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE phone = $2 RETURNING id`,
      [passwordHash, phone]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Aucun compte trouvé avec ce numéro.' });
    }
    res.json({ message: 'Mot de passe réinitialisé avec succès.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { register, login, bootstrapAdmin, resetPassword };
