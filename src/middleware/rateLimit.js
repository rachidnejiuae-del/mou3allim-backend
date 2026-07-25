// src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');
const { normalizePhone } = require('../utils/phone');

// NOTE: this store is in-memory. Render's free tier spins the service down,
// which wipes every counter. That is acceptable for password brute-force
// (bcrypt is slow, 8 tries per window is already punishing) but NOT as the
// only defence on anything guessable — see the attempts column on otp_codes.

const base = {
  standardHeaders: true,
  legacyHeaders: false,
};

// Key on the normalized phone so +216../00216../bare-8-digit all share one
// bucket. Fall back to IP when no phone was supplied.
function phoneKey(prefix) {
  return (req) => {
    const p = normalizePhone(req.body?.phone);
    return p ? `${prefix}:${p}` : `${prefix}-ip:${req.ip}`;
  };
}

const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: phoneKey('login'),
  skipSuccessfulRequests: true, // only failed attempts count
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});

// Separate IP-based ceiling so one attacker can't spray 8 attempts each
// across thousands of different phone numbers.
const loginIpLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 40,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives depuis cette adresse.' },
});

const registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de comptes créés depuis cette adresse. Réessayez plus tard.' },
});

// Kept ready for when SMS goes live. Unused while OTP_ENABLED is false.
const otpSendLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: phoneKey('otpsend'),
  message: { error: 'Trop de demandes de code. Réessayez dans une heure.' },
});

const otpVerifyLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 6,
  keyGenerator: phoneKey('otpverify'),
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives. Demandez un nouveau code.' },
});

// Broad safety net for everything else (search, profiles, lookups).
const globalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
});

module.exports = {
  loginLimiter,
  loginIpLimiter,
  registerLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
  globalLimiter,
};
