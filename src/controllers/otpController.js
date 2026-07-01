const pool = require('../db/pool');

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
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
  } else {
    console.log(`[OTP DEV] Code for ${phone}: ${code}`);
  }
}

async function sendOtp(req, res) {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Numéro de téléphone requis.' });

  try {
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `UPDATE otp_codes SET used = TRUE WHERE phone = $1 AND used = FALSE`,
      [phone]
    );

    await pool.query(
      `INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
      [phone, code, expiresAt]
    );

    await sendSMS(phone, code);

    res.json({ message: 'Code envoyé par SMS.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'envoi du code." });
  }
}

async function verifyOtp(req, res) {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'Téléphone et code requis.' });

  try {
    const result = await pool.query(
      `SELECT * FROM otp_codes
       WHERE phone = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Code invalide ou expiré.' });
    }

    await pool.query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [result.rows[0].id]);

    await pool.query(
      `UPDATE users SET phone_verified = TRUE WHERE phone = $1`,
      [phone]
    );

    res.json({ message: 'Téléphone vérifié avec succès.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la vérification.' });
  }
}

module.exports = { sendOtp, verifyOtp };
