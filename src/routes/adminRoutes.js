const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { listPending, listAll, approve, reject, suspend } = require('../controllers/adminController');
const { generate, list: listCodes, disable } = require('../controllers/codeController');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/teachers/pending', listPending);
router.get('/teachers', listAll);
router.patch('/teachers/:id/approve', approve);
router.patch('/teachers/:id/reject', reject);
router.patch('/teachers/:id/suspend', suspend);

router.post('/codes/generate', generate);
router.get('/codes', listCodes);
router.patch('/codes/:id/disable', disable);

module.exports = router;
