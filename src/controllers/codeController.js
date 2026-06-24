const crypto = require('crypto');
const pool = require('../db/pool');

function generateCode() {
  // Format: MOU3-XXXX-XXXX, easy to read/type, hard to guess
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `MOU3-${part()}-${part()}`;
}

// POST /api/admin/codes/generate — { plan: 'monthly'|'yearly', count: number }
async function generate(req, res) {
  const { plan, count = 1 } = req.body;
  if (!['monthly', 'yearly'].includes(plan)) {
    return res.status(400).json({ error: 'plan doit être "monthly" ou "yearly".' });
  }
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 100); // cap at 100 per request

  try {
    const codes = [];
    for (let i = 0; i < n; i++) {
      const code = generateCode();
      await pool.query(
        `INSERT INTO prepaid_codes (code, plan) VALUES ($1, $2)`,
        [code, plan]
      );
      codes.push(code);
    }
    res.status(201).json({ codes, plan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la génération des codes.' });
  }
}

// GET /api/admin/codes — list all codes with status
async function list(req, res) {
  try {
    const result = await pool.query(
      `SELECT pc.id, pc.code, pc.plan, pc.status, pc.used_at, u.full_name AS used_by
       FROM prepaid_codes pc
       LEFT JOIN teacher_profiles tp ON tp.id = pc.used_by_teacher_id
       LEFT JOIN users u ON u.id = tp.user_id
       ORDER BY pc.created_at DESC
       LIMIT 200`
    );
    res.json({ codes: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// PATCH /api/admin/codes/:id/disable — invalidate an unused code (e.g. typo, leaked)
async function disable(req, res) {
  try {
    await pool.query(
      `UPDATE prepaid_codes SET status = 'disabled' WHERE id = $1 AND status = 'unused'`,
      [req.params.id]
    );
    res.json({ message: 'Code désactivé.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { generate, list, disable };
