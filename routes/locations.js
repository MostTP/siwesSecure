import express from 'express';
import pool from '../config/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Admin: Create company location
router.post('/', authRequired, requireRole('ADMIN'), async (req, res) => {
  try {
    const { company_name, latitude, longitude, allowed_radius_meters } = req.body;

    if (!company_name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO company_locations (company_name, latitude, longitude, allowed_radius_meters)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [company_name, latitude, longitude, allowed_radius_meters || 100]
    );

    res.status(201).json({ location: result.rows[0] });
  } catch (error) {
    console.error('Location creation error:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// Get all locations (Admin, Supervisors)
router.get('/', authRequired, requireRole('ADMIN', 'INDUSTRY_SUPERVISOR', 'INSTITUTION_SUPERVISOR'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM company_locations ORDER BY company_name');
    res.json({ locations: result.rows });
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

export default router;

