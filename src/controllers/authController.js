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

// POST /api/auth/register
// role: 'parent' or 'teacher'. Teachers fill the rest of their profile in a separate step.
async function register(req, res) {
  const { phone, password, full_name, role } = req.body;

  if (!phone || !password || !full_name || !role) {
    return res.status(400).json({ error: 'phone, password, full_name et role sont requis.' });
  }
  if (!['parent', 'teacher'].includes(role)) {
    return res.status(400).json({ error: 'role doit être "parent" ou "teacher".' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ce numéro de téléphone est déjà utilisé.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (phone, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4) RETURNING id, phone, full_name, role`,
      [phone, passwordHash, full_name, role]
    );
    const user = result.rows[0];

    // If teacher, create an empty pending profile right away
    if (role === 'teacher') {
      await pool.query(
        `INSERT INTO teacher_profiles (user_id, governorate, status)
         VALUES ($1, $2, 'pending')`,
        [user.id, 'Tunis']
      );
    }

    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'inscription.' });
  }
}

// POST /api/auth/login
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

module.exports = { register, login, bootstrapAdmin };

// GET /api/auth/bootstrap-admin?phone=...&key=...
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
