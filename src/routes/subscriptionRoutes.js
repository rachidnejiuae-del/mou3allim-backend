const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { redeem } = require('../controllers/subscriptionController');

const router = express.Router();

router.post('/redeem', authenticate, requireRole('teacher'), redeem);

module.exports = router;
