const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, requireRole } = require('../middleware/auth');
const { normalizePhone } = require('../utils/phone');
const { listPending, listAll, getStats, approve, reject, suspend } = require('../controllers/adminController');
const { generate, list: listCodes, disable } = require('../controllers/codeController');
const { hide, unhide } = require('../controllers/ratingController');
const pool = require('../db/pool');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/stats', getStats);

router.get('/teachers/pending', listPending);
router.get('/teachers', listAll);
router.patch('/teachers/:id/approve', approve);
router.patch('/teachers/:id/reject', reject);
router.patch('/teachers/:id/suspend', suspend);

router.post('/codes/generate', generate);
router.get('/codes', listCodes);
router.patch('/codes/:id/disable', disable);

router.patch('/ratings/:ratingId/hide', hide);
router.patch('/ratings/:ratingId/unhide', unhide);

// ---- Identity verification for manual (WhatsApp) password resets ----------
// Step 1: admin enters the phone, gets the account's security QUESTION to ask.
router.get('/verify-identity', async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone) return res.status(400).json({ error: 'Numéro invalide.' });
  try {
    const r = await pool.query(
      `SELECT full_name, role, created_at, security_question,
              (security_answer_hash IS NOT NULL) AS has_answer
       FROM users WHERE phone = $1`,
      [phone]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Aucun compte avec ce numéro.' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Step 2: admin enters the answer the person gave; server says match or not.
// The stored answer is hashed, so it is never exposed — not even to the admin.
router.post('/verify-identity', async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const answer = req.body.answer;
  if (!phone || !answer) return res.status(400).json({ error: 'Numéro et réponse requis.' });
  try {
    const r = await pool.query('SELECT security_answer_hash FROM users WHERE phone = $1', [phone]);
    if (!r.rows.length) return res.status(404).json({ error: 'Aucun compte avec ce numéro.' });
    const hash = r.rows[0].security_answer_hash;
    if (!hash) return res.json({ match: false, no_answer: true });
    const norm = String(answer).trim().toLowerCase().replace(/\s+/g, ' ');
    const match = await bcrypt.compare(norm, hash);
    res.json({ match });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Admin sets a new password AFTER verifying identity (manual WhatsApp reset).
// This is the closing step of the Vérifier identité workflow.
router.post('/reset-password', async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const newPassword = req.body.new_password;
  if (!phone || !newPassword) return res.status(400).json({ error: 'Numéro et nouveau mot de passe requis.' });
  if (String(newPassword).length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const r = await pool.query('UPDATE users SET password_hash = $1 WHERE phone = $2 RETURNING id', [hash, phone]);
    if (!r.rows.length) return res.status(404).json({ error: 'Aucun compte avec ce numéro.' });
    res.json({ message: 'Mot de passe réinitialisé.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.get('/ratings/:teacherId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.score, r.comment, r.hidden, r.created_at,
        COALESCE(r.guest_name, u.full_name, 'Anonyme') AS parent_name
       FROM ratings r
       LEFT JOIN users u ON u.id = r.parent_id
       WHERE r.teacher_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.teacherId]
    );
    res.json({ ratings: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
