const crypto = require('crypto');
const pool = require('../db/pool');
const { normalizePhone } = require('../utils/phone');

// No SMS provider is registered yet. While this is false the OTP endpoints
// answer 503 instead of silently "succeeding" with a code that only ever
// reaches the server log.
const OTP_ENABLED = process.env.OTP_ENABLED === 'true';

// Math.random() is not cryptographically random and its output is predictable
// from prior values. For a credential, use the CSPRNG.
function generateOTP() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function sendSMS(phone, code) {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE) {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `Mou3allim: votre code de vérification est ${code}. Valide 10 minutes.`,
      from: process.env.TWILIO_PHONE,
      to: phone,
    });
    return true;
  }
  return false; // no provider configured
}

function disabled(res) {
  return res.status(503).json({
    error: 'La vérification par SMS est momentanément indisponible.',
  });
}

async function sendOtp(req, res) {
  if (!OTP_ENABLED) return disabled(res);

  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Numéro de téléphone invalide.' });

  try {
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(`UPDATE otp_codes SET used = TRUE WHERE phone = $1 AND used = FALSE`, [phone]);
    await pool.query(
      `INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
      [phone, code, expiresAt]
    );

    const delivered = await sendSMS(phone, code);
    if (!delivered) {
      console.error('OTP_ENABLED=true but no SMS provider is configured.');
      return res.status(503).json({ error: 'Envoi SMS indisponible. Réessayez plus tard.' });
    }

    res.json({ message: 'Code envoyé par SMS.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'envoi du code." });
  }
}

async function verifyOtp(req, res) {
  if (!OTP_ENABLED) return disabled(res);

  const { code } = req.body;
  const phone = normalizePhone(req.body.phone);
  if (!phone || !code) return res.status(400).json({ error: 'Téléphone et code requis.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM otp_codes
       WHERE phone = $1 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [phone]
    );
    const otp = result.rows[0];

    if (!otp || otp.attempts >= 5) {
      await client.query('COMMIT');
      return res.status(400).json({ error: 'Code invalide ou expiré. Demandez un nouveau code.' });
    }

    if (otp.code !== code) {
      await client.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
      await client.query('COMMIT');
      return res.status(400).json({ error: 'Code invalide ou expiré.' });
    }

    await client.query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otp.id]);
    await client.query(`UPDATE users SET phone_verified = TRUE WHERE phone = $1`, [phone]);
    await client.query('COMMIT');

    res.json({ message: 'Téléphone vérifié avec succès.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la vérification.' });
  } finally {
    client.release();
  }
}

module.exports = { sendOtp, verifyOtp };
