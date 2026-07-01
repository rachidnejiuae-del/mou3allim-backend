const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  updateMyProfile, uploadPhoto, uploadCertificate, search, getById,
} = require('../controllers/teacherController');
const { rate, list: listRatings } = require('../controllers/ratingController');

const router = express.Router();

// Public
router.get('/search', search);
router.get('/:id', getById);
router.get('/:id/ratings', listRatings);

// Authenticated (teacher)
router.put('/me', authenticate, requireRole('teacher'), updateMyProfile);
router.post('/me/photo', authenticate, requireRole('teacher'), upload.single('photo'), uploadPhoto);
router.post('/me/certificate', authenticate, requireRole('teacher'), upload.single('certificate'), uploadCertificate);

// Authenticated (parent)
router.post('/:id/ratings', authenticate, requireRole('parent'), rate);

module.exports = router;
