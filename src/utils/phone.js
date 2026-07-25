// src/utils/phone.js
// Tunisian phone numbers arrive in many shapes:
//   +21628357354 / 0021628357354 / 21628357354 / 28357354 / "28 357 354"
// Without normalization these become DIFFERENT users rows and DIFFERENT
// rate-limit buckets. Canonical form is +216XXXXXXXX.

function normalizePhone(input) {
  if (!input) return null;

  // Strip everything that isn't a digit or a leading +
  let s = String(input).trim().replace(/[\s().-]/g, '');

  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);

  if (!/^\d+$/.test(s)) return null;

  // Bare 8-digit local number -> assume Tunisia
  if (s.length === 8) s = '216' + s;

  // Must now be a Tunisian number: 216 + 8 digits
  if (!/^216\d{8}$/.test(s)) return null;

  return '+' + s;
}

// Tunisian mobile prefixes are 2,4,5,9. Landlines start 7.
// Used to reject obvious junk at registration without being strict enough
// to block a legitimate user.
function isPlausibleTunisianMobile(normalized) {
  return /^\+216[24579]\d{7}$/.test(normalized || '');
}

module.exports = { normalizePhone, isPlausibleTunisianMobile };
