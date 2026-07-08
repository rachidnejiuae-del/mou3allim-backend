const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
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
