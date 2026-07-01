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

module.exports = router;
