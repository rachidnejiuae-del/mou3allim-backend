const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Cloudinary auto-configures from CLOUDINARY_URL environment variable

const storage = multer.memoryStorage();

const allowedPhotoMimes = ['image/jpeg', 'image/png', 'image/webp'];
const allowedCertMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isCert = req.route?.path?.includes('certificate');
    const allowed = isCert ? allowedCertMimes : allowedPhotoMimes;
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Format non supporté.'));
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
