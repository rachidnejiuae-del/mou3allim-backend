const express = require('express');
const { register, login, resetPassword } = require('../controllers/authController');
const { sendOtp, verifyOtp } = require('../controllers/otpController');
const {
  loginLimiter,
  loginIpLimiter,
  registerLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
} = require('../middleware/rateLimit');

const router = express.Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginIpLimiter, loginLimiter, login);

// GET /bootstrap-admin removed — the key travelled in the query string and
// was written to request logs. To create another admin, run one UPDATE in Neon.

router.post('/send-otp', otpSendLimiter, sendOtp);
router.post('/verify-otp', otpVerifyLimiter, verifyOtp);
router.post('/reset-password', otpVerifyLimiter, resetPassword);

module.exports = router;
