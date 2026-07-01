const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `teacher_${req.user.id}_${Date.now()}${ext}`);
  },
});

const allowedPhotoTypes = ['image/jpeg', 'image/png', 'image/webp'];
const allowedCertTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = req.route?.path?.includes('certificate') ? allowedCertTypes : allowedPhotoTypes;
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Format non supporté.'));
    }
    cb(null, true);
  },
});

module.exports = upload;
