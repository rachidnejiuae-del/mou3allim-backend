const express = require('express');
const pool = require('../db/pool');
const AREAS_BY_GOVERNORATE = require('../data/areas');

const router = express.Router();

const GOVERNORATES = [
  'Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Zaghouan', 'Bizerte',
  'Béja', 'Jendouba', 'Le Kef', 'Siliana', 'Sousse', 'Monastir', 'Mahdia',
  'Sfax', 'Kairouan', 'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine',
  'Tataouine', 'Gafsa', 'Tozeur', 'Kébili',
];

// Teacher's own qualification/degree (single choice on the dashboard).
const DEGREES = [
  'Enseignant primaire',
  'Enseignant préparatoire',
  'Enseignant secondaire',
  'Enseignant universitaire',
  'Étudiant',
  'Autre',
];

// Years of experience (single choice on the dashboard).
const EXPERIENCE = [
  '1 à 5 ans',
  '5 à 10 ans',
  '10 à 15 ans',
  'Plus de 15 ans',
];

// Levels a teacher can teach, grouped by stage. Single source of truth used by
// the teacher dashboard form AND the parent search filter.
const LEVELS = [
  { group: 'Primaire', items: [
    'Primaire 1', 'Primaire 2', 'Primaire 3', 'Primaire 4', 'Primaire 5', 'Primaire 6',
  ]},
  { group: 'Préparatoire', items: [
    'Préparatoire 7', 'Préparatoire 8', 'Préparatoire 9',
  ]},
  { group: 'Secondaire', items: [
    'Secondaire 1', 'Secondaire 2', 'Secondaire 3', 'Secondaire 4',
  ]},
  { group: 'Université', items: [
    'Université L1', 'Université L2', 'Université L3',
  ]},
];

router.get('/subjects', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM subjects ORDER BY name');
    res.json({ subjects: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.get('/governorates', (req, res) => {
  res.json({ governorates: GOVERNORATES });
});

router.get('/areas', (req, res) => {
  const { governorate } = req.query;
  if (!governorate) {
    return res.status(400).json({ error: 'Le paramètre governorate est requis.' });
  }
  const areas = AREAS_BY_GOVERNORATE[governorate] || [];
  res.json({ areas });
});

router.get('/degrees', (req, res) => {
  res.json({ degrees: DEGREES });
});

router.get('/experience', (req, res) => {
  res.json({ experience: EXPERIENCE });
});

router.get('/levels', (req, res) => {
  res.json({ levels: LEVELS });
});

module.exports = router;
