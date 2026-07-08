const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  getMyProfile, updateMyProfile, uploadPhoto, uploadCertificate, search, getById,
} = require('../controllers/teacherController');
const { rate, list: listRatings } = require('../controllers/ratingController');

const router = express.Router();

// Public
router.get('/search', search);
router.get('/:id', getById);
router.get('/:id/ratings', listRatings);
router.post('/:id/ratings', rate);

// Authenticated (teacher)
router.get('/me', authenticate, requireRole('teacher'), getMyProfile);
router.put('/me', authenticate, requireRole('teacher'), updateMyProfile);
router.post('/me/photo', authenticate, requireRole('teacher'), upload.single('photo'), uploadPhoto);
router.post('/me/certificate', authenticate, requireRole('teacher'), upload.single('certificate'), uploadCertificate);

module.exports = router;
