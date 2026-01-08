import express from 'express';
import pool from '../config/database.js';
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Student registration
router.post('/register/student', async (req, res) => {
  try {
    const { matric_number, full_name, institution, department, siwes_start_date, siwes_end_date, password } = req.body;

    if (!matric_number || !full_name || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if student already exists
    const existing = await pool.query('SELECT id FROM students WHERE matric_number = $1', [matric_number]);
    if (existing.rows[0]) {
      return res.status(400).json({ error: 'Student already registered' });
    }

    const hashedPassword = await hashPassword(password);

    const result = await pool.query(
      `INSERT INTO students (matric_number, full_name, institution, department, siwes_start_date, siwes_end_date, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, matric_number, full_name`,
      [matric_number, full_name, institution, department, siwes_start_date, siwes_end_date, hashedPassword]
    );

    const token = generateToken({ id: result.rows[0].id, role: 'STUDENT' });

    res.status(201).json({
      user: result.rows[0],
      token,
      role: 'STUDENT'
    });
  } catch (error) {
    console.error('Student registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Supervisor registration
router.post('/register/supervisor', async (req, res) => {
  try {
    const { type, full_name, official_email, password, ...otherFields } = req.body;

    if (!type || !full_name || !official_email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (type !== 'INDUSTRY_SUPERVISOR' && type !== 'INSTITUTION_SUPERVISOR') {
      return res.status(400).json({ error: 'Invalid supervisor type' });
    }

    const hashedPassword = await hashPassword(password);

    let result;
    if (type === 'INDUSTRY_SUPERVISOR') {
      const { company_name, phone } = otherFields;
      result = await pool.query(
        `INSERT INTO industry_supervisors (full_name, company_name, official_email, phone, password_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, official_email, verified`,
        [full_name, company_name, official_email, phone, hashedPassword]
      );
    } else {
      const { institution, staff_id } = otherFields;
      result = await pool.query(
        `INSERT INTO institution_supervisors (full_name, institution, staff_id, official_email, password_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, official_email, verified`,
        [full_name, institution, staff_id, official_email, hashedPassword]
      );
    }

    const token = generateToken({ id: result.rows[0].id, role: type });

    res.status(201).json({
      user: result.rows[0],
      token,
      role: type
    });
  } catch (error) {
    console.error('Supervisor registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password, role } = req.body;

    if (!identifier || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let user;
    let userRole;

    switch (role) {
      case 'STUDENT':
        user = await pool.query('SELECT id, password_hash FROM students WHERE matric_number = $1', [identifier]);
        userRole = 'STUDENT';
        break;
      case 'INDUSTRY_SUPERVISOR':
        user = await pool.query('SELECT id, password_hash, verified FROM industry_supervisors WHERE official_email = $1', [identifier]);
        userRole = 'INDUSTRY_SUPERVISOR';
        break;
      case 'INSTITUTION_SUPERVISOR':
        user = await pool.query('SELECT id, password_hash, verified FROM institution_supervisors WHERE official_email = $1', [identifier]);
        userRole = 'INSTITUTION_SUPERVISOR';
        break;
      case 'ADMIN':
        user = await pool.query('SELECT id, password_hash FROM admins WHERE email = $1', [identifier]);
        userRole = 'ADMIN';
        break;
      default:
        return res.status(400).json({ error: 'Invalid role' });
    }

    if (!user.rows[0]) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await comparePassword(password, user.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({ id: user.rows[0].id, role: userRole });

    res.json({
      token,
      role: userRole,
      verified: user.rows[0].verified || true
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authRequired, async (req, res) => {
  try {
    const role = req.user.role;
    let user;

    switch (role) {
      case 'STUDENT':
        user = await pool.query('SELECT id, matric_number, full_name, institution, department FROM students WHERE id = $1', [req.user.id]);
        break;
      case 'INDUSTRY_SUPERVISOR':
        user = await pool.query('SELECT id, full_name, company_name, official_email, verified FROM industry_supervisors WHERE id = $1', [req.user.id]);
        break;
      case 'INSTITUTION_SUPERVISOR':
        user = await pool.query('SELECT id, full_name, institution, staff_id, official_email, verified FROM institution_supervisors WHERE id = $1', [req.user.id]);
        break;
      case 'ADMIN':
        user = await pool.query('SELECT id, full_name, email FROM admins WHERE id = $1', [req.user.id]);
        break;
    }

    res.json({ user: user.rows[0], role });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;

