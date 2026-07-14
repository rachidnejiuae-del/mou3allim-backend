const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const path = require('path');

// Cloudinary auto-configures from CLOUDINARY_URL environment variable

const storage = multer.memoryStorage();

// Broader accepted MIME types — some browsers/OSes report images with
// slightly different or generic MIME types, so we check both MIME and extension.
const allowedImageMimes = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
];
const allowedCertMimes = [...allowedImageMimes, 'application/pdf'];
const allowedImageExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
const allowedCertExts = [...allowedImageExts, '.pdf'];

function isAllowed(file, isCert) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimeList = isCert ? allowedCertMimes : allowedImageMimes;
  const extList = isCert ? allowedCertExts : allowedImageExts;

  // Accept if EITHER the MIME type OR the file extension matches —
  // this covers browsers that send generic/incorrect MIME types.
  return mimeList.includes(file.mimetype) || extList.includes(ext);
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isCert = (req.path || req.url || '').includes('certificate');
    console.log(`[upload] Incoming file: name="${file.originalname}" mimetype="${file.mimetype}" isCert=${isCert}`);

    if (!isAllowed(file, isCert)) {
      console.log(`[upload] REJECTED: ${file.originalname} (${file.mimetype})`);
      return cb(new Error(
        isCert
          ? 'Format non supporté. Utilisez une image (JPG, PNG) ou un PDF.'
          : 'Format non supporté. Utilisez une image (JPG, PNG).'
      ));
    }
    cb(null, true);
  },
});

function uploadToCloudinary(buffer, folder, resourceType = 'image') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `mou3allim/${folder}`,
        resource_type: resourceType,
        ...(resourceType === 'image' && {
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        }),
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}

module.exports = { upload, uploadToCloudinary };
