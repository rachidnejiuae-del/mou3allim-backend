const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  getMyProfile, updateMyProfile, uploadPhoto, search, getById,
} = require('../controllers/teacherController');
const { rate, list: listRatings } = require('../controllers/ratingController');

const router = express.Router();

// Specific routes before /:id
router.get('/me', authenticate, requireRole('teacher'), getMyProfile);
router.put('/me', authenticate, requireRole('teacher'), updateMyProfile);
router.post('/me/photo', authenticate, requireRole('teacher'), upload.single('photo'), uploadPhoto);

// Public
router.get('/search', search);
router.get('/:id', getById);
router.get('/:id/ratings', listRatings);

// Rating requires a logged-in account (registration required to rate).
router.post('/:id/ratings', authenticate, rate);

module.exports = router;
