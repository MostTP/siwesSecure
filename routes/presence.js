import express from 'express';
import pool from '../config/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { calculateDistance } from '../utils/location.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// Student: Submit GPS presence
router.post('/', authRequired, requireRole('STUDENT'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const studentId = req.user.id;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    // Get student's assigned location
    const studentResult = await pool.query(
      'SELECT company_location_id FROM students WHERE id = $1',
      [studentId]
    );

    if (!studentResult.rows[0] || !studentResult.rows[0].company_location_id) {
      await logAudit(studentId, 'STUDENT', 'PRESENCE_ATTEMPT', 'presence_log', false, req.ip);
      return res.status(400).json({ error: 'Student not assigned to a location' });
    }

    // Get location details
    const locationResult = await pool.query(
      'SELECT latitude, longitude, allowed_radius_meters FROM company_locations WHERE id = $1',
      [studentResult.rows[0].company_location_id]
    );

    if (!locationResult.rows[0]) {
      await logAudit(studentId, 'STUDENT', 'PRESENCE_ATTEMPT', 'presence_log', false, req.ip);
      return res.status(400).json({ error: 'Location not found' });
    }

    const location = locationResult.rows[0];
    const distance = calculateDistance(
      latitude,
      longitude,
      parseFloat(location.latitude),
      parseFloat(location.longitude)
    );

    const isValid = distance <= location.allowed_radius_meters;
    const status = isValid ? 'VALID' : 'INVALID';

    // Log presence
    const result = await pool.query(
      `INSERT INTO presence_logs (student_id, latitude, longitude, distance_m, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [studentId, latitude, longitude, Math.round(distance), status]
    );

    await logAudit(
      studentId,
      'STUDENT',
      'PRESENCE_SUBMISSION',
      `presence_log_${result.rows[0].id}`,
      isValid,
      req.ip
    );

    res.status(201).json({
      presence: result.rows[0],
      message: isValid ? 'Presence validated' : 'Location outside allowed radius'
    });
  } catch (error) {
    console.error('Presence submission error:', error);
    await logAudit(req.user.id, 'STUDENT', 'PRESENCE_SUBMISSION', 'presence_log', false, req.ip);
    res.status(500).json({ error: 'Failed to submit presence' });
  }
});

// Get student's presence history
router.get('/history', authRequired, requireRole('STUDENT'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM presence_logs WHERE student_id = $1 ORDER BY timestamp DESC LIMIT 50`,
      [req.user.id]
    );

    res.json({ presence_logs: result.rows });
  } catch (error) {
    console.error('Error fetching presence history:', error);
    res.status(500).json({ error: 'Failed to fetch presence history' });
  }
});

export default router;

