const express = require('express');
const { register, login, bootstrapAdmin } = require('../controllers/authController');
const { sendOtp, verifyOtp } = require('../controllers/otpController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/bootstrap-admin', bootstrapAdmin);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

module.exports = router;
