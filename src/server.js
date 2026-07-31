require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const lookupRoutes = require('./routes/lookupRoutes');
const { globalLimiter } = require('./middleware/rateLimit');

const app = express();

// Render terminates TLS at its proxy. Without this, req.ip is the proxy's
// address and every visitor shares one rate-limit bucket.
// Use 1, not true — `true` trusts the whole X-Forwarded-For chain, letting a
// client spoof a header and get a fresh bucket per request.
app.set('trust proxy', 1);

app.use(helmet());

// Allowlist instead of wide-open CORS. Includes the custom domain, the Netlify
// URLs, the hosted admin dashboard, and the localhost/file:// origins for dev
// and the local admin dashboard.
const ALLOWED_ORIGINS = [
  'https://mou3allim.com',
  'https://www.mou3allim.com',
  'https://steady-puffpuff-806d91.netlify.app',
  'https://mou3allim-admin.netlify.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  'null', // admin.html opened as a local file (file://) sends Origin: null
];

app.use(cors({
  origin(origin, callback) {
    // No origin header: curl, Expo native, server-to-server.
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origine non autorisée par CORS.'));
  },
  credentials: false,
}));

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', globalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', lookupRoutes);

// Centralized error handler (e.g. multer file errors)
app.use((err, req, res, next) => {
  console.error(err);
  // Don't leak internal messages to clients on 500s.
  const status = err.status || 500;
  const message = status >= 500 ? 'Erreur serveur.' : (err.message || 'Requête invalide.');
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Mou3allim API running on port ${PORT}`));
