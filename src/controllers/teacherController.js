const pool = require('../db/pool');
const { uploadToCloudinary } = require('../middleware/upload');

// GET /api/teachers/me — teacher loads their own profile data
async function getMyProfile(req, res) {
  try {
    const result = await pool.query(
      `SELECT u.full_name, u.phone, u.gender,
        tp.id, tp.bio, tp.governorate, tp.photo_url, tp.certificate_url, tp.status
       FROM teacher_profiles tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.user_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profil introuvable.' });
    }
    const teacherId = result.rows[0].id;

    const [subjResult, areaResult] = await Promise.all([
      pool.query(
        `SELECT ts.subject_id, sub.name, ts.price_per_hour
         FROM teacher_subjects ts
         JOIN subjects sub ON sub.id = ts.subject_id
         WHERE ts.teacher_id = $1`,
        [teacherId]
      ),
      pool.query(`SELECT area_name FROM teacher_areas WHERE teacher_id = $1`, [teacherId]),
    ]);

    res.json({
      profile: {
        ...result.rows[0],
        subjects: subjResult.rows,
        areas: areaResult.rows.map((r) => r.area_name),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

async function updateMyProfile(req, res) {
  const { bio, governorate, latitude, longitude, subjects, areas } = req.body;

  try {
    const profileResult = await pool.query(
      'SELECT id FROM teacher_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profil professeur introuvable.' });
    }
    const teacherId = profileResult.rows[0].id;

    await pool.query(
      `UPDATE teacher_profiles
       SET bio = COALESCE($1, bio),
           governorate = COALESCE($2, governorate),
           latitude = COALESCE($3, latitude),
           longitude = COALESCE($4, longitude),
           updated_at = NOW()
       WHERE id = $5`,
      [bio, governorate, latitude, longitude, teacherId]
    );

    if (Array.isArray(subjects) && subjects.length > 0) {
      await pool.query('DELETE FROM teacher_subjects WHERE teacher_id = $1', [teacherId]);
      for (const s of subjects) {
        await pool.query(
          `INSERT INTO teacher_subjects (teacher_id, subject_id, price_per_hour)
           VALUES ($1, $2, $3)`,
          [teacherId, s.subject_id, s.price_per_hour]
        );
      }
    }

    if (Array.isArray(areas)) {
      await pool.query('DELETE FROM teacher_areas WHERE teacher_id = $1', [teacherId]);
      for (const areaName of areas) {
        await pool.query(
          `INSERT INTO teacher_areas (teacher_id, area_name) VALUES ($1, $2)
           ON CONFLICT (teacher_id, area_name) DO NOTHING`,
          [teacherId, areaName]
        );
      }
    }

    res.json({ message: 'Profil mis à jour.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du profil.' });
  }
}

async function uploadPhoto(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

  try {
    const photoUrl = await uploadToCloudinary(req.file.buffer, 'photos', 'image');

    await pool.query(
      `UPDATE teacher_profiles SET photo_url = $1, updated_at = NOW() WHERE user_id = $2`,
      [photoUrl, req.user.id]
    );
    res.json({ photo_url: photoUrl });
  } catch (err) {
    console.error('Cloudinary photo upload error:', err);
    res.status(500).json({ error: "Erreur lors de l'upload de la photo." });
  }
}

async function uploadCertificate(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

  try {
    const isPdf = req.file.mimetype === 'application/pdf';
    const resourceType = isPdf ? 'raw' : 'image';

    const certificateUrl = await uploadToCloudinary(
      req.file.buffer,
      'certificates',
      resourceType
    );

    await pool.query(
      `UPDATE teacher_profiles SET certificate_url = $1, updated_at = NOW() WHERE user_id = $2`,
      [certificateUrl, req.user.id]
    );
    res.json({ certificate_url: certificateUrl });
  } catch (err) {
    console.error('Cloudinary certificate upload error:', err);
    res.status(500).json({ error: "Erreur lors de l'upload du certificat." });
  }
}

async function search(req, res) {
  const { subject, governorate, area, q } = req.query;

  try {
    const conditions = [`tp.status = 'approved'`, `s.payment_status = 'paid'`, `s.ends_at > NOW()`];
    const params = [];

    if (governorate) {
      params.push(governorate);
      conditions.push(`tp.governorate = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`u.full_name ILIKE $${params.length}`);
    }

    let subjectFilter = '';
    if (subject) {
      params.push(subject);
      subjectFilter = `AND EXISTS (
        SELECT 1 FROM teacher_subjects ts2
        JOIN subjects sub2 ON sub2.id = ts2.subject_id
        WHERE ts2.teacher_id = tp.id AND sub2.name = $${params.length}
      )`;
    }

    let areaFilter = '';
    if (area) {
      params.push(area);
      areaFilter = `AND EXISTS (
        SELECT 1 FROM teacher_areas ta2
        WHERE ta2.teacher_id = tp.id AND ta2.area_name = $${params.length}
      )`;
    }

    const sql = `
      SELECT DISTINCT tp.id, u.full_name, u.gender, tp.photo_url, tp.governorate, tp.bio,
        COALESCE(AVG(r.score), 0)::float AS rating,
        COUNT(DISTINCT r.id) AS rating_count
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.user_id
      JOIN subscriptions s ON s.teacher_id = tp.id
      LEFT JOIN ratings r ON r.teacher_id = tp.id
      WHERE ${conditions.join(' AND ')} ${subjectFilter} ${areaFilter}
      GROUP BY tp.id, u.full_name, u.gender, tp.photo_url, tp.governorate, tp.bio
      ORDER BY rating DESC
      LIMIT 50;
    `;

    const result = await pool.query(sql, params);

    const teachers = await Promise.all(
      result.rows.map(async (t) => {
        const [subjResult, areaResult] = await Promise.all([
          pool.query(
            `SELECT sub.name, ts.price_per_hour
             FROM teacher_subjects ts
             JOIN subjects sub ON sub.id = ts.subject_id
             WHERE ts.teacher_id = $1`,
            [t.id]
          ),
          pool.query(`SELECT area_name FROM teacher_areas WHERE teacher_id = $1`, [t.id]),
        ]);
        return {
          ...t,
          subjects: subjResult.rows,
          areas: areaResult.rows.map((r) => r.area_name),
        };
      })
    );

    res.json({ teachers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la recherche.' });
  }
}

async function getById(req, res) {
  try {
    const result = await pool.query(
      `SELECT tp.id, u.full_name, u.phone, u.gender, tp.photo_url, tp.governorate, tp.bio,
        tp.certificate_url, s.ends_at,
        COALESCE(AVG(r.score), 0)::float AS rating,
        COUNT(DISTINCT r.id) AS rating_count
       FROM teacher_profiles tp
       JOIN users u ON u.id = tp.user_id
       JOIN subscriptions s ON s.teacher_id = tp.id
       LEFT JOIN ratings r ON r.teacher_id = tp.id
       WHERE tp.id = $1 AND tp.status = 'approved' AND s.payment_status = 'paid' AND s.ends_at > NOW()
       GROUP BY tp.id, u.full_name, u.phone, u.gender, tp.photo_url, tp.governorate, tp.bio,
                tp.certificate_url, s.ends_at`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Professeur introuvable ou non disponible.' });
    }

    const [subjResult, areaResult] = await Promise.all([
      pool.query(
        `SELECT sub.name, ts.price_per_hour
         FROM teacher_subjects ts
         JOIN subjects sub ON sub.id = ts.subject_id
         WHERE ts.teacher_id = $1`,
        [req.params.id]
      ),
      pool.query(`SELECT area_name FROM teacher_areas WHERE teacher_id = $1`, [req.params.id]),
    ]);

    res.json({
      teacher: {
        ...result.rows[0],
        subjects: subjResult.rows,
        areas: areaResult.rows.map((r) => r.area_name),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { getMyProfile, updateMyProfile, uploadPhoto, uploadCertificate, search, getById };
