const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { redeem, getMySubscription } = require('../controllers/subscriptionController');

const router = express.Router();

router.post('/redeem', authenticate, requireRole('teacher'), redeem);
router.get('/me', authenticate, requireRole('teacher'), getMySubscription);

module.exports = router;
