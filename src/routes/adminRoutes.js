const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { listPending, approve, reject } = require('../controllers/adminController');
const { generate, list: listCodes, disable } = require('../controllers/codeController');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/teachers/pending', listPending);
router.patch('/teachers/:id/approve', approve);
router.patch('/teachers/:id/reject', reject);

router.post('/codes/generate', generate);
router.get('/codes', listCodes);
router.patch('/codes/:id/disable', disable);

module.exports = router;
